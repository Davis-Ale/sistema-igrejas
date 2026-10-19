import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { Client, Pool } from 'pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateCheckoutCredential } from '../src/checkout-access.service.ts';
import { createCheckoutRegistrationFactory } from '../src/event.service.ts';

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

import { createAssistedCheckoutRecovery } from '../src/checkout-assisted-recovery.service.ts';
import { createPostgresRecoveryDeliveryStore } from '../src/checkout-recovery-delivery.store.ts';
import { checkoutRecoveryDeliveryId } from '../src/checkout-recovery-delivery.identity.ts';

async function assistedFixture() {
  const f = await sale();
  const account = await prisma.userAccount.create({ data: { churchId: f.scope.churchId,
    email: randomUUID() + '@example.invalid', passwordHash: 'synthetic-not-a-login', role: 'SUPER_ADMIN' } });
  const actor = { churchId: f.scope.churchId, userId: account.id, role: 'SUPER_ADMIN' as const };
  const request = { operationId: randomUUID(), action: 'REISSUE', verifiedEmail: f.body.email,
    verification: { ownershipVerified: true, emailPossessionVerified: true, registrationUnambiguous: true,
      evidenceReference: 'synthetic-case', verifiedChannelReference: 'synthetic-channel' } };
  const options = { retentionMs: 60_000, deliveryTimeoutMs: 2000,
    async sendEmail(input: any) {
      const rows = (await pool.query('SELECT "stage" FROM "EventCheckoutRecoveryDeliveryEvent" WHERE "churchId"=$1 AND "operationId"=$2 ORDER BY "sequence"',
        [f.scope.churchId, request.operationId])).rows;
      assert.deepEqual(rows.map(r => r.stage), ['PREPARED', 'DELIVERY_INTENT']);
      assert.ok((await pool.query('SELECT "id" FROM "EventCheckoutRecoveryAudit" WHERE "churchId"=$1 AND "operationId"=$2', [f.scope.churchId, request.operationId])).rowCount);
      return { receiptReference: 'resend_' + randomUUID() };
    } };
  return { f, actor, request, options };
}
async function history(f: Awaited<ReturnType<typeof assistedFixture>>) {
  return (await pool.query('SELECT * FROM "EventCheckoutRecoveryDeliveryEvent" WHERE "churchId"=$1 AND "operationId"=$2 ORDER BY "sequence"',
    [f.actor.churchId, f.request.operationId])).rows;
}

if (process.env.CHECKOUT_TEST_OPERATIONAL_STRESS === '1') test('operational assisted recovery stress observes real transaction failures without secrets or resends', { timeout: 180_000 }, async () => {
  const summary = { cases: Number(process.env.CHECKOUT_TEST_STRESS_CASES ?? 24), concurrency: Number(process.env.CHECKOUT_TEST_STRESS_CONCURRENCY ?? 4), accepted: 0, uncertain: 0, retryRequired: 0,
    unknown: 0, simulatedSends: 0, transactionFailures: [] as { case: number; phase: string; name: string; classification: string; code?: string | undefined; sqlstate?: string | undefined; constraint?: string | undefined; safeError?: string | undefined }[],
    uncertainCases: [] as { case: number; sends: number; lastFailure: unknown }[] };
  assert.ok(Number.isInteger(summary.cases) && summary.cases > 0 && summary.cases <= 64);
  assert.ok([1, 2, 4, 8].includes(summary.concurrency) && summary.cases % summary.concurrency === 0);
  for (let start = 0; start < summary.cases; start += summary.concurrency) {
    await Promise.all(Array.from({ length: summary.concurrency }, async (_, offset) => {
      const t = await assistedFixture(), before = await financial(t.f);
      const client = (start + offset) % 2 ? prisma : prisma2;
      let phase = 'PRECHECK', sends = 0;
      const traced = new Proxy(client, { get(target, prop) {
        if (prop === '$transaction') return async (...args: any[]) => {
          try { return await (target.$transaction as any)(...args); }
          catch (error: any) {
            const cause = error.meta?.driverAdapterError?.cause;
            const message = String(error.message ?? '') + ' ' + String(cause?.originalMessage ?? '');
            const name = ['PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'DriverAdapterError', 'Error', 'TypeError', 'ZodError'].includes(error.name) ? error.name : 'OTHER';
            summary.transactionFailures.push({ case: start + offset, phase, name,
              classification: /could not serialize|serialization failure|40001/i.test(message) ? 'SERIALIZATION_CONFLICT' : /deadlock|40P01/i.test(message) ? 'DEADLOCK' : 'OTHER',
              code: /^P\d{4}$/.test(error.code ?? '') ? error.code : undefined,
              sqlstate: error.meta?.code ?? cause?.originalCode ?? error.cause?.originalCode ?? error.cause?.code,
              constraint: String(error.meta?.message ?? cause?.originalMessage ?? '').match(/checkout_[a-z_]+/)?.[0],
              safeError: /^CHECKOUT_[A-Z_]+$/.test(error.message ?? '') ? error.message : undefined });
            throw error;
          }
        };
        const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const store = createPostgresRecoveryDeliveryStore(traced);
      const deliveryStore = { ...store,
        async prepare(...args: Parameters<typeof store.prepare>) { phase = 'PREPARED'; return store.prepare(...args); },
        async append(...args: Parameters<typeof store.append>) { phase = args[1]; return store.append(...args); },
        async read(...args: Parameters<typeof store.read>) { phase = 'READ'; return store.read(...args); }
      };
      const options = { ...t.options, deliveryStore, async sendEmail() {
        phase = 'HANDOFF'; sends++; summary.simulatedSends++; return { receiptReference: `resend_${randomUUID()}` };
      } };
      const coordinator = createAssistedCheckoutRecovery(traced, options);
      const fresh = createAssistedCheckoutRecovery(client === prisma ? prisma2 : prisma, options);
      try {
        try {
          const result = await coordinator.execute(t.actor, t.f.scope, t.request);
          assert.equal(result.delivery, 'ACCEPTED'); summary.accepted++;
          assert.equal((await fresh.execute(t.actor, t.f.scope, t.request)).delivery, 'ACCEPTED');
        } catch (error) {
          const code = error instanceof Error ? error.message : 'UNKNOWN';
          if (code === 'CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN') {
            summary.uncertain++;
            summary.uncertainCases.push({ case: start + offset, sends, lastFailure: summary.transactionFailures.filter(failure => failure.case === start + offset).at(-1) ?? null });
            const sentBefore = sends;
            await coordinator.execute(t.actor, t.f.scope, t.request).catch(() => undefined);
            await fresh.execute(t.actor, t.f.scope, t.request).catch(() => undefined);
            assert.equal(sends, sentBefore);
            const stages = (await history(t)).map(row => row.stage);
            assert.ok(stages.includes('DELIVERY_INTENT'));
          } else if (code === 'CHECKOUT_RECOVERY_RETRY_REQUIRED') summary.retryRequired++;
          else { summary.unknown++; throw new Error('OPERATIONAL_STRESS_UNEXPECTED_RESULT'); }
        }
        assert.ok(sends <= 1);
        assert.deepEqual(await financial(t.f), before);
      } finally { coordinator.dispose(); fresh.dispose(); }
    }));
  }
  const grouped = new Map<string, number>();
  for (const { case: _case, ...failure } of summary.transactionFailures) {
    const key = JSON.stringify(failure); grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  console.log('OPERATIONAL_RECOVERY_SUMMARY ' + JSON.stringify({ ...summary,
    transactionFailures: [...grouped].map(([failure, count]) => ({ ...JSON.parse(failure), count })) }));
  assert.equal(summary.unknown, 0);
  assert.equal(summary.accepted + summary.uncertain + summary.retryRequired, summary.cases);
});

test('assisted delivery persists intent before send and replays acceptance after a fresh client without financial mutation', async () => {
  const t = await assistedFixture(), before = await financial(t.f); let sends = 0, raw = '';
  const options = { ...t.options, async sendEmail(input: any, signal: AbortSignal) { sends++; raw = input.credential; return t.options.sendEmail(input); } };
  const first = createAssistedCheckoutRecovery(prisma, options);
  const next = createAssistedCheckoutRecovery(prisma2, options);
  try {
    const result = await first.execute(t.actor, t.f.scope, t.request); first.dispose();
    const replay = await next.execute(t.actor, t.f.scope, t.request);
    assert.equal(replay.receiptReference, result.receiptReference); assert.equal(replay.wasExisting, true); assert.equal(sends, 1);
    assert.deepEqual((await history(t)).map(r => r.stage), ['PREPARED', 'DELIVERY_INTENT', 'DELIVERY_ACCEPTED']);
    assert.equal(JSON.stringify(await history(t)).includes(raw), false);
    assert.deepEqual(await financial(t.f), before);
    // A historical receipt is queryable even if a later contact edit would block a new send.
    await pool.query('UPDATE "Registration" SET "checkoutEmail"=$1 WHERE "id"=$2', ["changed@example.invalid", t.f.scope.registrationId]);
    assert.equal((await next.inspect(t.actor, t.f.scope, t.request)).delivery, "ACCEPTED");
    await pool.query('UPDATE "Registration" SET "checkoutEmail"=$1 WHERE "id"=$2', [t.f.body.email, t.f.scope.registrationId]);
    assert.equal(Number((await pool.query('SELECT extract(epoch FROM ("expiresAt"-"createdAt")) AS ttl FROM "EventCheckoutAccess" WHERE "id"=$1', [result.accessId])).rows[0].ttl), 86400);
    await assert.rejects(next.execute(t.actor, t.f.scope, { ...t.request, action: 'RECOVER' }), /CONFLICT/);
    await assert.rejects(next.inspect({ ...t.actor, churchId: 'other' }, { ...t.f.scope, churchId: 'other' }, t.request), /FORBIDDEN/);
  } finally { first.dispose(); next.dispose(); }
});

test('assisted delivery independent Prisma clients serialize one operation and perform at most one simulated send', async () => {
  const t = await assistedFixture(); let sends = 0;
  const options = { ...t.options, async sendEmail(input: any) { sends++; await new Promise(r => setTimeout(r, 30)); return t.options.sendEmail(input); } };
  const a = createAssistedCheckoutRecovery(prisma, options), b = createAssistedCheckoutRecovery(prisma2, options);
  try {
    const result = await Promise.allSettled([a.execute(t.actor, t.f.scope, t.request), b.execute(t.actor, t.f.scope, t.request)]);
    assert.ok(result.some(r => r.status === 'fulfilled'), JSON.stringify(result)); assert.equal(sends, 1);
    assert.equal((await history(t)).filter(r => r.stage === 'DELIVERY_INTENT').length, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM "EventCheckoutRecoveryAudit" WHERE "churchId"=$1 AND "operationId"=$2', [t.actor.churchId, t.request.operationId])).rows[0].n, 1);
    assert.equal((await b.execute(t.actor, t.f.scope, t.request)).delivery, 'ACCEPTED');
  } finally { a.dispose(); b.dispose(); }
});

test('assisted delivery failed PREPARED insert rolls back audit, new grant and previous grant revocation atomically', async () => {
  const t = await assistedFixture(), before = await financial(t.f), store = createPostgresRecoveryDeliveryStore(prisma);
  const service = createAssistedCheckoutRecovery(prisma, { ...t.options, deliveryStore: { ...store,
    async prepare(tx, context, at) { await store.prepare(tx, context, at); throw new Error('synthetic after preparation'); } } });
  try {
    await assert.rejects(service.execute(t.actor, t.f.scope, t.request), /RETRY_REQUIRED/);
    assert.deepEqual(await history(t), []);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM "EventCheckoutRecoveryAudit" WHERE "churchId"=$1 AND "operationId"=$2', [t.actor.churchId, t.request.operationId])).rows[0].n, 0);
    const grants = (await pool.query('SELECT * FROM "EventCheckoutAccess" WHERE "registrationId"=$1', [t.f.scope.registrationId])).rows;
    assert.equal(grants.length, 1); assert.equal(grants[0].id, t.f.accessId); assert.equal(grants[0].revokedAt, null);
    assert.deepEqual(await financial(t.f), before);
  } finally { service.dispose(); }
});

test('assisted delivery ambiguous intent commit is blocking after restart even with no simulated send', async () => {
  const t = await assistedFixture(), real = createPostgresRecoveryDeliveryStore(prisma); let sends = 0;
  const a = createAssistedCheckoutRecovery(prisma, { ...t.options, async sendEmail(input) { sends++; return t.options.sendEmail(input); },
    deliveryStore: { ...real, async append(...args) { const result = await real.append(...args);
      if (args[1] === 'DELIVERY_INTENT') throw new Error('synthetic lost commit acknowledgement'); return result; } } });
  const b = createAssistedCheckoutRecovery(prisma2, t.options);
  try {
    await assert.rejects(a.execute(t.actor, t.f.scope, t.request), /RETRY_REQUIRED/); a.dispose();
    await assert.rejects(b.execute(t.actor, t.f.scope, t.request), /DELIVERY_UNCERTAIN/);
    assert.equal((await b.inspect(t.actor, t.f.scope, t.request)).delivery, 'UNCERTAIN'); assert.equal(sends, 0);
    assert.deepEqual((await history(t)).map(r => r.stage), ['PREPARED', 'DELIVERY_INTENT']);
  } finally { a.dispose(); b.dispose(); }
});

test('assisted delivery timeout persists UNCERTAIN and reconciliation verifies receipt binding without resend', async () => {
  const t = await assistedFixture(), before = await financial(t.f); let sends = 0, reads = 0, late: any, accessId = '', valid = false;
  const a = createAssistedCheckoutRecovery(prisma, { ...t.options, deliveryTimeoutMs: 25,
    async sendEmail(input) { sends++; accessId = input.accessId; return new Promise(resolve => { late = resolve; }); } });
  const receiptReference = 'resend_' + randomUUID(), evidence = { receiptReference, evidenceReference: 'synthetic-provider-case' };
  const b = createAssistedCheckoutRecovery(prisma2, { ...t.options, async readEmail(reference) {
    reads++; return { receiptReference: reference, recipientEmail: t.request.verifiedEmail, operationId: t.request.operationId,
      deliveryId: valid ? checkoutRecoveryDeliveryId({ ...t.f.scope, accessId, operationId: t.request.operationId }) : '0'.repeat(64) };
  } });
  try {
    await assert.rejects(a.execute(t.actor, t.f.scope, t.request), /DELIVERY_UNCERTAIN/); a.dispose(); late?.({ receiptReference });
    await assert.rejects(b.execute(t.actor, t.f.scope, t.request), /DELIVERY_UNCERTAIN/);
    assert.equal((await history(t)).at(-1).stage, 'DELIVERY_UNCERTAIN');
    await assert.rejects(b.reconcile(t.actor, t.f.scope, t.request, evidence), /CONFLICT/); valid = true;
    assert.equal((await b.reconcile(t.actor, t.f.scope, t.request, evidence)).delivery, 'ACCEPTED');
    await b.reconcile(t.actor, t.f.scope, t.request, evidence); assert.equal(reads, 2); assert.equal(sends, 1);
    assert.deepEqual((await history(t)).map(r => r.stage), ['PREPARED', 'DELIVERY_INTENT', 'DELIVERY_UNCERTAIN', 'DELIVERY_RECONCILED_ACCEPTED']);
    assert.deepEqual(await financial(t.f), before);
  } finally { a.dispose(); b.dispose(); }
});

test('assisted delivery PostgreSQL rejects mutation, truncate, duplicate stage, cross-tenant links and invalid transitions', async () => {
  const t = await assistedFixture(), service = createAssistedCheckoutRecovery(prisma, t.options);
  try {
    await service.execute(t.actor, t.f.scope, t.request); const rows = await history(t), row = rows[0];
    const denied = async (sql: string, params: any[] = []) => assert.rejects(pool.query(sql, params), (e: any) => ['23503', '23505', '23514'].includes(e.code));
    await denied('UPDATE "EventCheckoutRecoveryDeliveryEvent" SET "requestFingerprint"=$1 WHERE "id"=$2', ['b'.repeat(64), row.id]);
    await denied('DELETE FROM "EventCheckoutRecoveryDeliveryEvent" WHERE "id"=$1', [row.id]);
    await denied('UPDATE "EventCheckoutRecoveryAudit" SET "evidenceReference"=$1 WHERE "churchId"=$2 AND "operationId"=$3', ['changed-case', t.actor.churchId, t.request.operationId]);
    await denied('TRUNCATE "EventCheckoutRecoveryDeliveryEvent"');
    const sql = 'INSERT INTO "EventCheckoutRecoveryDeliveryEvent" ("id","churchId","operationId","stage","requestFingerprint","actorUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)';
    await denied(sql, [randomUUID(), t.actor.churchId, t.request.operationId, 'DELIVERY_INTENT', row.requestFingerprint, t.actor.userId, new Date()]);
    await denied(sql, [randomUUID(), 'other-tenant', t.request.operationId, 'PREPARED', row.requestFingerprint, t.actor.userId, new Date()]);
    await denied(sql, [randomUUID(), t.actor.churchId, randomUUID(), 'PREPARED', row.requestFingerprint, t.actor.userId, new Date()]);
    await denied(sql, [randomUUID(), t.actor.churchId, t.request.operationId, 'DELIVERY_UNCERTAIN', row.requestFingerprint, t.actor.userId, new Date()]);
    assert.deepEqual(await history(t), rows);
  } finally { service.dispose(); }
});


test('assisted delivery PREPARED survives restart without recreating a lost credential', async () => {
  const t = await assistedFixture(), real = createPostgresRecoveryDeliveryStore(prisma); let sends = 0;
  const options = { ...t.options, async sendEmail(input: any) { sends++; return t.options.sendEmail(input); } };
  const a = createAssistedCheckoutRecovery(prisma, { ...options, deliveryStore: { ...real,
    async append() { throw new Error('synthetic failure before intent'); } } });
  const b = createAssistedCheckoutRecovery(prisma2, options);
  try {
    await assert.rejects(a.execute(t.actor, t.f.scope, t.request), /RETRY_REQUIRED/); a.dispose();
    assert.equal((await b.inspect(t.actor, t.f.scope, t.request)).delivery, 'PREPARED');
    await assert.rejects(b.execute(t.actor, t.f.scope, t.request), /KEY_UNAVAILABLE/);
    assert.equal(sends, 0); assert.deepEqual((await history(t)).map(r => r.stage), ['PREPARED']);
  } finally { a.dispose(); b.dispose(); }
});

test('assisted delivery accepted commit ambiguity cannot downgrade a durable receipt', async () => {
  const t = await assistedFixture(), real = createPostgresRecoveryDeliveryStore(prisma); let sends = 0;
  const a = createAssistedCheckoutRecovery(prisma, { ...t.options, async sendEmail(input) { sends++; return t.options.sendEmail(input); },
    deliveryStore: { ...real, async append(...args) { const result = await real.append(...args);
      if (args[1] === 'DELIVERY_ACCEPTED') throw new Error('synthetic lost accepted acknowledgement'); return result; } } });
  const b = createAssistedCheckoutRecovery(prisma2, t.options);
  try {
    await assert.rejects(a.execute(t.actor, t.f.scope, t.request), /DELIVERY_UNCERTAIN/); a.dispose();
    assert.equal((await b.execute(t.actor, t.f.scope, t.request)).delivery, 'ACCEPTED'); assert.equal(sends, 1);
    assert.deepEqual((await history(t)).map(r => r.stage), ['PREPARED', 'DELIVERY_INTENT', 'DELIVERY_ACCEPTED']);
  } finally { a.dispose(); b.dispose(); }
});

test('assisted delivery two durable adapters claim one intent and reject changed fingerprints', async () => {
  const t = await assistedFixture(), real = createPostgresRecoveryDeliveryStore(prisma);
  const a = createAssistedCheckoutRecovery(prisma, { ...t.options, deliveryStore: { ...real,
    async append() { throw new Error('synthetic stop at preparation'); } } });
  try {
    await assert.rejects(a.execute(t.actor, t.f.scope, t.request), /RETRY_REQUIRED/);
    const rows = await history(t), c = { actor: t.actor, scope: t.f.scope, operationId: t.request.operationId, requestFingerprint: rows[0].requestFingerprint };
    const claimed = await Promise.all([real.append(c, 'DELIVERY_INTENT', new Date()), createPostgresRecoveryDeliveryStore(prisma2).append(c, 'DELIVERY_INTENT', new Date())]);
    assert.equal(claimed.filter(Boolean).length, 1);
    await assert.rejects(real.read({ ...c, requestFingerprint: '0'.repeat(64) }), /CONFLICT/);
    assert.equal((await history(t)).length, 2);
  } finally { a.dispose(); }
});
