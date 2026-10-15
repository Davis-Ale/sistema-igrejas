import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { Client, Pool } from 'pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createCheckoutAttempt, generateCheckoutCredential, withCheckoutAuthorization, recoverCheckoutAccess } from '../src/checkout-access.service.ts';
import { createCheckoutRegistrationFactory } from '../src/event.service.ts';
import { createFirstCheckoutCharge, reconcileFirstCheckoutCharge, type CheckoutFirstChargeProvider } from '../src/checkout-charge.service.ts';
import { createCheckoutV2Integration } from '../src/checkout-v2.integration.ts';
import { sendPendingRegistrationConfirmationEmail } from '../src/registration-confirmation-delivery.service.ts';

// No dotenv, buildApp, seed, real provider, or implicit Prisma datasource here.
function guardedUrl(value: string | undefined) {
  assert.ok(value, 'Explicit isolated checkout URL is required; no DATABASE_URL fallback');
  const url = new URL(value);
  assert.equal(url.protocol, 'postgresql:'); assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55437'); assert.notEqual(url.port, '5433');
  assert.equal(url.pathname.slice(1), process.env.CHECKOUT_TEST_DATABASE);
  assert.match(url.pathname, /^\/checkout_v2_test_[a-f0-9]{32}$/);
  assert.equal(url.username, 'checkout_runtime'); assert.ok(url.password);
  assert.equal(url.search, ''); assert.equal(url.hash, '');
  assert.equal(process.env.DATABASE_URL, undefined); assert.equal(process.env.DIRECT_URL, undefined);
  assert.match(process.env.CHECKOUT_TEST_MARKER ?? '', /^checkout-v2-isolated-[a-f0-9]{32}$/);
  return value;
}
const url = guardedUrl(process.env.CHECKOUT_TEST_DATABASE_URL);
const pool = new Pool({ connectionString: url, max: 12, connectionTimeoutMillis: 3000 });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 12 }) });
const prisma2 = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 12 }) });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); };
const cpf = '52998224725';
before(async () => {
  const identity = (await pool.query("SELECT current_database() AS db, current_user AS usr, current_setting('cluster_name') AS marker, current_setting('server_version_num')::int AS version")).rows[0];
  assert.equal(identity.db, process.env.CHECKOUT_TEST_DATABASE); assert.equal(identity.usr, 'checkout_runtime');
  assert.equal(identity.marker, process.env.CHECKOUT_TEST_MARKER); assert.ok(identity.version >= 170000 && identity.version < 180000);
  const role = (await pool.query('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
});
after(async () => { globalThis.fetch = originalFetch; await Promise.all([prisma.$disconnect(), prisma2.$disconnect(), pool.end()]); });

type Method = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';
async function eventFixture(method: Method = 'PIX') {
  const slug = 'synthetic-' + randomUUID();
  const church = await prisma.church.create({ data: { name: 'Synthetic test only', slug, plan: 'TRIAL', status: 'ACTIVE', platformFeePercent: 10 } });
  const event = await prisma.event.create({ data: { churchId: church.id, title: 'Synthetic checkout', slug, publicSlug: slug,
    date: new Date(Date.now() + 86400000), capacity: 100, isPublic: true, isPaid: true, price: 100,
    publicRegistrationEnabled: true, waitlistEnabled: false } });
  const ticket = await prisma.eventTicket.create({ data: { churchId: church.id, eventId: event.id, name: 'Synthetic ticket', isFree: false, isVisible: true } });
  const batch = await prisma.ticketBatch.create({ data: { churchId: church.id, eventId: event.id, ticketId: ticket.id, name: 'Synthetic batch',
    quantity: 100, price: 100, salesStart: new Date(Date.now() - 60000), salesEnd: new Date(Date.now() + 86400000), isVisible: true } });
  const body = { name: 'Synthetic participant', phone: '41999990001', email: slug + '@example.invalid', cpf,
    paymentMethod: method, ticketId: ticket.id, ticketBatchId: batch.id, answers: [] };
  return { scope: { churchId: church.id, eventId: event.id }, body, method, key: generateCheckoutCredential() };
}
async function sale(method: Method = 'PIX') {
  const f = await eventFixture(method);
  const r = await prisma.$transaction(tx => createCheckoutRegistrationFactory(prisma)(tx, f.scope, f.body));
  const registration = await prisma.registration.findUniqueOrThrow({ where: { id: r.id } });
  const payment = await prisma.eventPayment.findUniqueOrThrow({ where: { id: registration.paymentId! } });
  const scope = { ...f.scope, registrationId: r.id };
  const accessId = randomUUID();
  await pool.query('UPDATE "Registration" SET "checkoutEmail"=$1 WHERE "id"=$2', [f.body.email, r.id]);
  await pool.query('INSERT INTO "EventCheckoutAccess" ("id","churchId","eventId","registrationId","credentialHash","source","requestFingerprint","requestedPaymentMethod","createdAt","expiresAt") VALUES ($1,$2,$3,$4,$5,\'PUBLIC_ATTEMPT\',$6,$7,statement_timestamp(),statement_timestamp()+interval \'24 hours\')',
    [accessId, scope.churchId, scope.eventId, scope.registrationId, createHash('sha256').update(f.key).digest('hex'), 'a'.repeat(64), method]);
  return { ...f, scope, registration, payment, accessId };
}
async function financial(f: Awaited<ReturnType<typeof sale>>) {
  return { registration: await prisma.registration.findUniqueOrThrow({ where: { id: f.scope.registrationId } }),
    payment: await prisma.eventPayment.findUniqueOrThrow({ where: { id: f.payment.id } }),
    transaction: await prisma.transaction.findUniqueOrThrow({ where: { id: f.payment.transactionId } }),
    order: await prisma.eventOrder.findUniqueOrThrow({ where: { id: f.payment.orderId } }) };
}
function conserved(before: Awaited<ReturnType<typeof financial>>, after: Awaited<ReturnType<typeof financial>>) {
  assert.deepEqual(after.registration, before.registration); assert.deepEqual(after.order, before.order);
  assert.deepEqual({ ...after.transaction, asaasId: before.transaction.asaasId }, before.transaction);
  assert.deepEqual({ ...after.payment, providerPaymentId: before.payment.providerPaymentId }, before.payment);
}
function simulator(f: Awaited<ReturnType<typeof sale>>) {
  let posts = 0, gets = 0;
  let receipt: any;
  const provider: CheckoutFirstChargeProvider = {
    async create(command) {
      posts++;
      assert.equal(command.churchId, f.scope.churchId); assert.equal(command.eventId, f.scope.eventId);
      assert.equal(command.method, f.method); assert.equal(command.customer.email, f.body.email);
      const rows = (await pool.query('SELECT * FROM "EventCheckoutChargeAttempt" WHERE "id"=$1', [command.attemptId])).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].state, 'STARTED'); assert.equal(rows[0].providerPaymentId, null);
      receipt = { id: 'simulated-' + command.attemptId, externalReference: command.externalReference,
        method: command.method === 'PIX' ? 'PIX' : 'CARD', amount: command.amount };
      return receipt;
    },
    async read(id) { gets++; assert.equal(id, receipt.id); return receipt; }
  };
  return { provider, get posts() { return posts; }, get gets() { return gets; } };
}
const rejected = async (sql: string, values: any[], code: string, constraint?: string) => {
  await assert.rejects(pool.query(sql, values), (error: any) => error.code === code && (!constraint || error.constraint === constraint));
};

test('all 30 migrations applied by Prisma deploy; SQL-only constraints and partial index exist', async () => {
  const rows = (await pool.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name')).rows;
  assert.equal(rows.length, 30); assert.ok(rows.every(r => r.finished_at && !r.rolled_back_at));
  assert.equal(rows.at(-1).migration_name, '20261013120000_event_checkout_access_structure');
  const names = new Set((await pool.query("SELECT conname FROM pg_constraint WHERE conname LIKE 'checkout_%'")).rows.map(r => r.conname));
  for (const name of ['checkout_access_ttl_check', 'checkout_access_source_check', 'checkout_access_hash_check', 'checkout_charge_reference_check', 'checkout_recovery_evidence_check', 'checkout_recovery_actor_check', 'checkout_recovery_access_fkey']) assert.ok(names.has(name));
  const index = (await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname='checkout_access_one_unrevoked_key'")).rows[0];
  assert.match(index.indexdef, /UNIQUE/); assert.match(index.indexdef, /WHERE.*revokedAt.*IS NULL/);
});

test('runtime identity cannot create databases or tables', async () => {
  await rejected('CREATE DATABASE checkout_forbidden', [], '42501');
  await rejected('CREATE TABLE public.checkout_forbidden(id int)', [], '42501');
});

test('TTL, hashes, source, revocation and local email are enforced by PostgreSQL', async () => {
  const f = await sale();
  await rejected('UPDATE "EventCheckoutAccess" SET "expiresAt"="createdAt"+interval \'25 hours\' WHERE "id"=$1', [f.accessId], '23514', 'checkout_access_ttl_check');
  await rejected('UPDATE "EventCheckoutAccess" SET "credentialHash"=\'bad\' WHERE "id"=$1', [f.accessId], '23514', 'checkout_access_hash_check');
  await rejected('UPDATE "EventCheckoutAccess" SET "requestedPaymentMethod"=NULL WHERE "id"=$1', [f.accessId], '23514', 'checkout_access_source_check');
  await rejected('UPDATE "EventCheckoutAccess" SET "revokedAt"="createdAt"-interval \'1 second\' WHERE "id"=$1', [f.accessId], '23514', 'checkout_access_revocation_check');
  await rejected('UPDATE "Registration" SET "checkoutEmail"=\'   \' WHERE "id"=$1', [f.scope.registrationId], '23514', 'checkout_email_nonblank_check');
});

test('composite FKs deny cross-church/event access and charge links', async () => {
  const f = await sale(), other = await eventFixture();
  await rejected('UPDATE "EventCheckoutAccess" SET "churchId"=$1 WHERE "id"=$2', [other.scope.churchId, f.accessId], '23503');
  await rejected('UPDATE "EventCheckoutAccess" SET "eventId"=$1 WHERE "id"=$2', [other.scope.eventId, f.accessId], '23503');
  await rejected('INSERT INTO "EventCheckoutChargeAttempt" ("id","churchId","eventId","eventPaymentId","transactionId","requestedMethod","updatedAt") VALUES ($1,$2,$3,$4,$5,\'PIX\',now())', [randomUUID(), other.scope.churchId, f.scope.eventId, f.payment.id, f.payment.transactionId], '23503');
});

test('credential/global and partial unrevoked unique constraints are enforced including expiry', async () => {
  const f = await sale(), other = await sale();
  await rejected('UPDATE "EventCheckoutAccess" SET "credentialHash"=(SELECT "credentialHash" FROM "EventCheckoutAccess" WHERE "id"=$1) WHERE "id"=$2', [f.accessId, other.accessId], '23505', 'EventCheckoutAccess_credentialHash_key');
  await pool.query('UPDATE "EventCheckoutAccess" SET "createdAt"="createdAt"-interval \'2 days\',"expiresAt"="expiresAt"-interval \'2 days\' WHERE "id"=$1', [f.accessId]);
  await rejected('INSERT INTO "EventCheckoutAccess" SELECT $1,"churchId","eventId","registrationId",$2,"source","requestFingerprint","requestedPaymentMethod",now(),now()+interval \'24 hours\',NULL FROM "EventCheckoutAccess" WHERE "id"=$3', [randomUUID(), 'b'.repeat(64), f.accessId], '23505', 'checkout_access_one_unrevoked_key');
});

test('charge uniqueness and reference CHECKs reject parallel/inconsistent intents', async () => {
  const f = await sale(), id = randomUUID();
  const sql = 'INSERT INTO "EventCheckoutChargeAttempt" ("id","churchId","eventId","eventPaymentId","transactionId","requestedMethod","updatedAt") VALUES ($1,$2,$3,$4,$5,\'PIX\',now())';
  await pool.query(sql, [id, f.scope.churchId, f.scope.eventId, f.payment.id, f.payment.transactionId]);
  await rejected(sql, [randomUUID(), f.scope.churchId, f.scope.eventId, f.payment.id, f.payment.transactionId], '23505');
  await rejected('UPDATE "EventCheckoutChargeAttempt" SET "providerPaymentId"=\'ref\' WHERE "id"=$1', [id], '23514', 'checkout_charge_reference_check');
  await rejected('UPDATE "EventCheckoutChargeAttempt" SET "state"=\'SUCCEEDED\' WHERE "id"=$1', [id], '23514', 'checkout_charge_reference_check');
});

test('row/advisory locks block a second real connection and release at rollback', async () => {
  const f = await sale(), a = new Client({ connectionString: url }), b = new Client({ connectionString: url });
  await a.connect(); await b.connect();
  try {
    assert.notEqual((await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await a.query('BEGIN'); await b.query('BEGIN'); await b.query("SET LOCAL lock_timeout='100ms'");
    await a.query('SELECT "id" FROM "Registration" WHERE "id"=$1 FOR UPDATE', [f.scope.registrationId]);
    await assert.rejects(b.query('SELECT "id" FROM "Registration" WHERE "id"=$1 FOR UPDATE', [f.scope.registrationId]), (e: any) => e.code === '55P03');
    await b.query('ROLLBACK'); await a.query('ROLLBACK');
    await a.query('BEGIN'); await b.query('BEGIN'); await b.query("SET LOCAL lock_timeout='100ms'");
    const mutex = 'event-charge:' + f.scope.churchId + ':' + f.payment.transactionId;
    await a.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [mutex]);
    await assert.rejects(b.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [mutex]), (e: any) => e.code === '55P03');
    await b.query('ROLLBACK'); await a.query('ROLLBACK');
    await b.query('BEGIN'); await b.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [mutex]); await b.query('ROLLBACK');
  } finally { await a.end(); await b.end(); }
});

test('PostgreSQL Serializable rejects a stale write with actual SQLSTATE 40001', async () => {
  const f = await sale(), a = new Client({ connectionString: url }), b = new Client({ connectionString: url }); await a.connect(); await b.connect();
  try {
    await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); await b.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await a.query('SELECT "name" FROM "Church" WHERE "id"=$1', [f.scope.churchId]); await b.query('SELECT "name" FROM "Church" WHERE "id"=$1', [f.scope.churchId]);
    await a.query('UPDATE "Church" SET "name"=\'Synthetic winner\' WHERE "id"=$1', [f.scope.churchId]); await a.query('COMMIT');
    await assert.rejects(b.query('UPDATE "Church" SET "name"=\'Synthetic stale\' WHERE "id"=$1', [f.scope.churchId]), (e: any) => e.code === '40001'); await b.query('ROLLBACK');
  } finally { await a.end(); await b.end(); }
});

test('actual Prisma service creates one graph/grant and replay preserves expiry/finance', async () => {
  const f = await eventFixture(), factory = createCheckoutRegistrationFactory(prisma);
  const first = await createCheckoutAttempt(prisma, f.scope, f.key, f.body, factory);
  const repeat = await createCheckoutAttempt(prisma2, f.scope, f.key, f.body, createCheckoutRegistrationFactory(prisma2));
  assert.equal(first.wasExisting, false); assert.equal(repeat.wasExisting, true); assert.equal(first.registrationId, repeat.registrationId); assert.deepEqual(first.expiresAt, repeat.expiresAt);
  for (const table of ['Registration', 'EventOrder', 'EventPayment', 'Transaction', 'EventCheckoutAccess']) assert.equal((await pool.query('SELECT count(*)::int AS n FROM "' + table + '" WHERE "churchId"=$1', [f.scope.churchId])).rows[0].n, 1);
  await assert.rejects(createCheckoutAttempt(prisma, f.scope, f.key, { ...f.body, paymentMethod: 'DEBIT_CARD' }, factory), /CHECKOUT_ATTEMPT_CONFLICT/);
});

test('concurrent independent Prisma clients converge on one attempt without duplicate finance', async () => {
  const f = await eventFixture();
  const results = await Promise.all(Array.from({ length: 4 }, (_, i) => createCheckoutAttempt(i % 2 ? prisma : prisma2, f.scope, f.key, f.body, createCheckoutRegistrationFactory(i % 2 ? prisma : prisma2))));
  assert.equal(new Set(results.map(r => r.registrationId)).size, 1);
  assert.equal(results.filter(r => !r.wasExisting).length, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM "Transaction" WHERE "churchId"=$1', [f.scope.churchId])).rows[0].n, 1);
});

test('PIX intent is committed before simulated POST, refs atomic and retries never repost', async () => {
  const f = await sale(), before = await financial(f), sim = simulator(f);
  const first = await createFirstCheckoutCharge(prisma, f.scope, f.key, { cpf }, sim.provider);
  const repeat = await createFirstCheckoutCharge(prisma2, f.scope, f.key, {}, sim.provider);
  assert.equal(sim.posts, 1); assert.equal(first.providerPaymentId, repeat.providerPaymentId); assert.equal(repeat.wasExisting, true);
  const after = await financial(f); conserved(before, after); assert.equal(after.transaction.asaasId, after.payment.providerPaymentId);
  assert.equal((await pool.query('SELECT "state" FROM "EventCheckoutChargeAttempt" WHERE "eventPaymentId"=$1', [f.payment.id])).rows[0].state, 'SUCCEEDED');
});

test('concurrent first-charge calls have one durable owner/one simulated POST', async () => {
  const f = await sale(), before = await financial(f), sim = simulator(f);
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => createFirstCheckoutCharge(i % 2 ? prisma : prisma2, f.scope, f.key, { cpf }, sim.provider)));
  assert.equal(sim.posts, 1); assert.ok(results.some(r => r.status === 'fulfilled'));
  for (const r of results) if (r.status === 'rejected') assert.match(r.reason.message, /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM "EventCheckoutChargeAttempt" WHERE "eventPaymentId"=$1', [f.payment.id])).rows[0].n, 1);
  const [attempt] = (await pool.query('SELECT "state", "providerPaymentId" FROM "EventCheckoutChargeAttempt" WHERE "eventPaymentId"=$1', [f.payment.id])).rows;
  const after = await financial(f);
  assert.equal(attempt.state, 'SUCCEEDED'); assert.equal(attempt.providerPaymentId, after.payment.providerPaymentId);
  assert.equal(after.transaction.asaasId, after.payment.providerPaymentId); conserved(before, after);
});

test('timeout is durable UNCERTAIN; restart/retry blocked; only matching GET reconciliation completes', async () => {
  const f = await sale(), before = await financial(f); let posts = 0, gets = 0, aborted = false;
  let observedSignal: AbortSignal | undefined;
  const receipt = { id: 'simulated-timeout-' + randomUUID(), externalReference: f.scope.churchId + ':' + f.payment.id + ':payment', method: 'PIX' as const, amount: 100 };
  const provider: CheckoutFirstChargeProvider = { async create(command, signal) {
    // Observe immediately: awaiting a DB probe here can miss the 100ms abort.
    // Committed STARTED visibility is covered by the dedicated PIX intent test.
    posts++; observedSignal = signal; assert.ok(command.attemptId);
    signal.addEventListener('abort', () => { aborted = true; }, { once: true }); return new Promise(() => {});
  }, async read() { gets++; return receipt; } };
  await assert.rejects(createFirstCheckoutCharge(prisma, f.scope, f.key, { cpf }, provider, { timeoutMs: 100 }), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  assert.equal(observedSignal?.aborted, true); assert.equal(aborted, true);
  assert.equal((await pool.query('SELECT "state" FROM "EventCheckoutChargeAttempt" WHERE "eventPaymentId"=$1', [f.payment.id])).rows[0].state, 'UNCERTAIN');
  await assert.rejects(createFirstCheckoutCharge(prisma2, f.scope, f.key, { cpf }, provider), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/); assert.equal(posts, 1);
  await assert.rejects(reconcileFirstCheckoutCharge(prisma, f.scope, f.key, 'wrong-id', provider), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  const result = await reconcileFirstCheckoutCharge(prisma, f.scope, f.key, receipt.id, provider); assert.equal(result.providerPaymentId, receipt.id); assert.equal(posts, 1); assert.equal(gets, 2);
  conserved(before, await financial(f));
});

test('PIX resume returns simulated QR only and keeps PENDING participant credential blocked', async () => {
  const f = await sale(), sim = simulator(f); const charge = await createFirstCheckoutCharge(prisma, f.scope, f.key, { cpf }, sim.provider);
  const before = await financial(f);
  const integration = createCheckoutV2Integration(prisma, { async read(id) { return { id, amount: 100, method: 'PIX', status: 'PENDING', redirectUrl: null }; },
    async pix(id) { assert.equal(id, charge.providerPaymentId); return { encodedImage: 'synthetic-image', payload: 'synthetic-pix', expirationDate: '2030-01-01' }; } });
  const result = await integration.resume(f.scope, f.key, {}); assert.equal(result.checkInToken, null); assert.equal(result.paymentCheckout?.method, 'PIX');
  assert.equal((result.paymentCheckout as any).pix.payload, 'synthetic-pix'); assert.deepEqual(await financial(f), before);
});

test('credit/debit semantics persisted independently; original CARD and financial snapshots conserved', async () => {
  for (const method of ['CREDIT_CARD', 'DEBIT_CARD'] as const) {
    const f = await sale(method), before = await financial(f), sim = simulator(f); assert.equal(before.transaction.method, 'CARD');
    await createFirstCheckoutCharge(prisma, f.scope, f.key, { cpf }, sim.provider);
    assert.equal((await pool.query('SELECT "requestedMethod" FROM "EventCheckoutChargeAttempt" WHERE "eventPaymentId"=$1', [f.payment.id])).rows[0].requestedMethod, method);
    conserved(before, await financial(f));
  }
});

test('legacy CARD with recovery grant has no invented semantic method or replacement', async () => {
  const f = await sale('DEBIT_CARD'); await pool.query('UPDATE "EventCheckoutAccess" SET "source"=\'ADMIN_RECOVERY\',"requestFingerprint"=NULL,"requestedPaymentMethod"=NULL WHERE "id"=$1', [f.accessId]);
  const before = await financial(f); let reads = 0;
  await prisma.transaction.update({ where: { id: f.payment.transactionId }, data: { asaasId: 'legacy-synthetic' } });
  await prisma.eventPayment.update({ where: { id: f.payment.id }, data: { providerPaymentId: 'legacy-synthetic' } });
  const linked = await financial(f);
  await assert.rejects(createCheckoutV2Integration(prisma, { async read(id) { reads++; return { id, amount: 100, method: 'CARD', status: 'PENDING', redirectUrl: 'https://example.invalid' }; }, async pix() { throw Error('Unexpected PIX'); } }).resume(f.scope, f.key, {}), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  assert.equal(reads, 0); assert.deepEqual(await financial(f), linked); assert.equal(before.transaction.method, 'CARD');
});

test('wrong church/event and revoked access cannot authorize a POST', async () => {
  const f = await sale(), sim = simulator(f), other = await eventFixture();
  await assert.rejects(createFirstCheckoutCharge(prisma, other.scope, f.key, { cpf }, sim.provider), /CHECKOUT_ACCESS_DENIED/);
  await assert.rejects(createFirstCheckoutCharge(prisma, { ...f.scope, eventId: other.scope.eventId }, f.key, { cpf }, sim.provider), /CHECKOUT_ACCESS_DENIED/);
  await pool.query('UPDATE "EventCheckoutAccess" SET "revokedAt"=now() WHERE "id"=$1', [f.accessId]);
  await assert.rejects(createFirstCheckoutCharge(prisma, f.scope, f.key, { cpf }, sim.provider), /CHECKOUT_ACCESS_DENIED/); assert.equal(sim.posts, 0);
});

test('SUPER_ADMIN recovery persists audit/revocation atomically, replay preserves financial history', async () => {
  const f = await sale(), before = await financial(f);
  const admin = await prisma.userAccount.create({ data: { churchId: f.scope.churchId, email: randomUUID() + '@example.invalid', passwordHash: 'synthetic-not-a-login', role: 'SUPER_ADMIN', status: 'ACTIVE' } });
  const actor = { userId: admin.id, churchId: f.scope.churchId, role: 'SUPER_ADMIN' }; const key = generateCheckoutCredential();
  const request = { action: 'REISSUE', operationId: randomUUID(), verification: { ownershipVerified: true, verificationMethod: 'Synthetic human test', evidenceReference: 'synthetic-case', verifiedChannelReference: 'synthetic-channel' } };
  const first = await recoverCheckoutAccess(prisma, actor, f.scope, key, request);
  const replay = await recoverCheckoutAccess(prisma2, actor, f.scope, key, request); assert.equal(replay.wasExisting, true); assert.deepEqual(first.expiresAt, replay.expiresAt);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM "EventCheckoutRecoveryAudit" WHERE "operationId"=$1', [request.operationId])).rows[0].n, 1);
  assert.ok((await pool.query('SELECT "revokedAt" FROM "EventCheckoutAccess" WHERE "id"=$1', [f.accessId])).rows[0].revokedAt);
  assert.deepEqual(await financial(f), before);
});

test('confirmation local recipient/concurrent marker and PENDING block use actual row locks', async () => {
  const f = await sale(); let sends = 0; const send = async (input: any) => { sends++; assert.equal(input.recipientEmail, f.body.email); return true; };
  assert.equal(await sendPendingRegistrationConfirmationEmail(prisma, f.scope.churchId, f.scope, send), false); assert.equal(sends, 0);
  await prisma.registration.update({ where: { id: f.scope.registrationId }, data: { status: 'CONFIRMED', paymentStatus: 'PAID' } });
  const result = await Promise.all([sendPendingRegistrationConfirmationEmail(prisma, f.scope.churchId, f.scope, send), sendPendingRegistrationConfirmationEmail(prisma2, f.scope.churchId, f.scope, send)]);
  assert.equal(result.filter(Boolean).length, 1); assert.equal(sends, 1);
  assert.ok((await prisma.registration.findUniqueOrThrow({ where: { id: f.scope.registrationId } })).confirmationEmailSentAt);
});


test('destination guard rejects current database, remote hosts, wrong role and missing explicit URL before connection', () => {
  for (const value of [undefined, 'postgresql://checkout_runtime:test@127.0.0.1:5433/sistema_igrejas',
    'postgresql://checkout_runtime:test@localhost:55437/' + process.env.CHECKOUT_TEST_DATABASE,
    'postgresql://checkout_runtime:test@remote.invalid:55437/' + process.env.CHECKOUT_TEST_DATABASE,
    'postgresql://postgres:test@127.0.0.1:55437/' + process.env.CHECKOUT_TEST_DATABASE]) assert.throws(() => guardedUrl(value));
});

test('sale factory writes original PIX/CARD and exact 100/10/90 snapshots without provider calls', async () => {
  for (const method of ['PIX', 'CREDIT_CARD', 'DEBIT_CARD'] as const) {
    const f = await sale(method), data = await financial(f);
    assert.equal(data.transaction.method, method === 'PIX' ? 'PIX' : 'CARD');
    assert.equal(data.transaction.type, 'EVENT'); assert.equal(data.transaction.direction, 'IN');
    assert.equal(data.transaction.amount.toString(), '100'); assert.equal(data.payment.amount.toString(), '100');
    assert.equal(data.order.totalAmount.toString(), '100'); assert.equal(data.payment.platformFeePercent?.toString(), '10');
    assert.equal(data.payment.platformFeeAmount?.toString(), '10'); assert.equal(data.payment.netAmount?.toString(), '90');
    assert.equal(data.transaction.asaasId, null); assert.equal(data.payment.providerPaymentId, null);
    assert.equal(data.registration.paymentStatus, 'PENDING'); assert.equal(data.registration.confirmationEmailSentAt, null);
  }
});

test('constraint failure rolls back the entire real sale transaction including financial graph', async () => {
  const f = await eventFixture();
  await assert.rejects(prisma.$transaction(async tx => {
    const registration = await createCheckoutRegistrationFactory(prisma)(tx, f.scope, f.body);
    await tx.$executeRawUnsafe('UPDATE "Registration" SET "checkoutEmail"=\' \' WHERE "id"=$1', registration.id);
  }));
  for (const table of ['Visitor', 'Registration', 'EventOrder', 'EventPayment', 'Transaction'])
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM "' + table + '" WHERE "churchId"=$1', [f.scope.churchId])).rows[0].n, 0);
});

test('two PostgreSQL connections contend on the same durable charge uniqueness and preserve finance', async () => {
  const f = await sale(), before = await financial(f);
  const sql = 'INSERT INTO "EventCheckoutChargeAttempt" ("id","churchId","eventId","eventPaymentId","transactionId","requestedMethod","updatedAt") VALUES ($1,$2,$3,$4,$5,\'PIX\',now())';
  const results = await Promise.allSettled([pool.query(sql, [randomUUID(), f.scope.churchId, f.scope.eventId, f.payment.id, f.payment.transactionId]),
    pool.query(sql, [randomUUID(), f.scope.churchId, f.scope.eventId, f.payment.id, f.payment.transactionId])]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const failure = results.find(r => r.status === 'rejected'); assert.equal((failure as PromiseRejectedResult).reason.code, '23505');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM "EventCheckoutChargeAttempt" WHERE "eventPaymentId"=$1', [f.payment.id])).rows[0].n, 1);
  assert.deepEqual(await financial(f), before);
});

test('persistent recovery audit enforces role/evidence and composite actor/access ownership', async () => {
  const f = await sale(), other = await sale();
  const actor = await prisma.userAccount.create({ data: { churchId: f.scope.churchId, email: randomUUID() + '@example.invalid', passwordHash: 'synthetic-not-a-login', role: 'SUPER_ADMIN' } });
  const sql = 'INSERT INTO "EventCheckoutRecoveryAudit" ("id","churchId","eventId","registrationId","accessId","operationId","requestFingerprint","action","actorUserId","actorRole","ownershipVerified","verificationMethod","evidenceReference","verifiedChannelReference") VALUES ($1,$2,$3,$4,$5,$6,$7,\'REISSUE\',$8,$9,$10,\'Synthetic test\',\'synthetic-evidence\',\'synthetic-channel\')';
  const values = [randomUUID(), f.scope.churchId, f.scope.eventId, f.scope.registrationId, f.accessId, randomUUID(), 'a'.repeat(64), actor.id, 'SUPER_ADMIN', true];
  await rejected(sql, [...values.slice(0, 8), 'PASTOR', true], '23514', 'checkout_recovery_actor_check');
  await rejected(sql, [...values.slice(0, 9), false], '23514', 'checkout_recovery_evidence_check');
  await rejected(sql, [...values.slice(0, 4), other.accessId, ...values.slice(5)], '23503', 'checkout_recovery_access_fkey');
  await pool.query(sql, values);
  await rejected(sql, [randomUUID(), ...values.slice(1)], '23505', 'EventCheckoutRecoveryAudit_churchId_operationId_key');
});
