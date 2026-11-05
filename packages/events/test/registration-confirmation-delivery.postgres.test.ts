import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateCheckoutCredential } from "../src/checkout-access.service.ts";
import { createCheckoutRegistrationFactory } from "../src/event.service.ts";
import { sendPendingRegistrationConfirmationEmail } from "../src/registration-confirmation-delivery.service.ts";

// No dotenv, buildApp, seed, real provider, or implicit Prisma datasource here.
function guardedUrl(value: string | undefined) {
  assert.ok(value, "Explicit isolated checkout URL is required; no DATABASE_URL fallback");
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55437"); assert.notEqual(url.port, "5433");
  assert.equal(url.pathname.slice(1), process.env.CHECKOUT_TEST_DATABASE);
  assert.match(url.pathname, /^\/checkout_v2_test_[a-f0-9]{32}$/);
  assert.equal(url.username, "checkout_runtime"); assert.ok(url.password);
  assert.equal(url.search, ""); assert.equal(url.hash, "");
  assert.equal(process.env.DATABASE_URL, undefined); assert.equal(process.env.DIRECT_URL, undefined);
  assert.match(process.env.CHECKOUT_TEST_MARKER ?? "", /^checkout-v2-isolated-[a-f0-9]{32}$/);
  return value;
}
const url = guardedUrl(process.env.CHECKOUT_TEST_DATABASE_URL);
const pool = new Pool({ connectionString: url, max: 12, connectionTimeoutMillis: 3000 });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 12 }) });
const prisma2 = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 12 }) });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("EXTERNAL_NETWORK_FORBIDDEN"); };
const cpf = "52998224725";
before(async () => {
  const identity = (await pool.query("SELECT current_database() AS db, current_user AS usr, current_setting('cluster_name') AS marker, current_setting('server_version_num')::int AS version")).rows[0];
  assert.equal(identity.db, process.env.CHECKOUT_TEST_DATABASE); assert.equal(identity.usr, "checkout_runtime");
  assert.equal(identity.marker, process.env.CHECKOUT_TEST_MARKER); assert.ok(identity.version >= 170000 && identity.version < 180000);
  const role = (await pool.query("SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
});
after(async () => { globalThis.fetch = originalFetch; await Promise.all([prisma.$disconnect(), prisma2.$disconnect(), pool.end()]); });

async function eventFixture() {
  const slug = "synthetic-" + randomUUID();
  const church = await prisma.church.create({ data: { name: "Synthetic test only", slug, plan: "TRIAL", status: "ACTIVE", platformFeePercent: 10 } });
  const event = await prisma.event.create({ data: { churchId: church.id, title: "Synthetic checkout", slug, publicSlug: slug,
    date: new Date(Date.now() + 86400000), capacity: 100, isPublic: true, isPaid: true, price: 100,
    publicRegistrationEnabled: true, waitlistEnabled: false } });
  const ticket = await prisma.eventTicket.create({ data: { churchId: church.id, eventId: event.id, name: "Synthetic ticket", isFree: false, isVisible: true } });
  const batch = await prisma.ticketBatch.create({ data: { churchId: church.id, eventId: event.id, ticketId: ticket.id, name: "Synthetic batch",
    quantity: 100, price: 100, salesStart: new Date(Date.now() - 60000), salesEnd: new Date(Date.now() + 86400000), isVisible: true } });
  const body = { name: "Synthetic participant", phone: "41999990001", email: slug + "@example.invalid", cpf,
    paymentMethod: "PIX" as const, ticketId: ticket.id, ticketBatchId: batch.id, answers: [] };
  return { scope: { churchId: church.id, eventId: event.id }, body, key: generateCheckoutCredential() };
}
async function sale() {
  const f = await eventFixture();
  const r = await prisma.$transaction(tx => createCheckoutRegistrationFactory(prisma)(tx, f.scope, f.body));
  const registration = await prisma.registration.findUniqueOrThrow({ where: { id: r.id } });
  const payment = await prisma.eventPayment.findUniqueOrThrow({ where: { id: registration.paymentId! } });
  const scope = { ...f.scope, registrationId: r.id };
  const accessId = randomUUID();
  await pool.query('UPDATE "Registration" SET "checkoutEmail"=$1 WHERE "id"=$2', [f.body.email, r.id]);
  await pool.query('INSERT INTO "EventCheckoutAccess" ("id","churchId","eventId","registrationId","credentialHash","source","requestFingerprint","requestedPaymentMethod","createdAt","expiresAt") VALUES ($1,$2,$3,$4,$5,\'PUBLIC_ATTEMPT\',$6,$7,statement_timestamp(),statement_timestamp()+interval \'24 hours\')',
    [accessId, scope.churchId, scope.eventId, scope.registrationId, createHash("sha256").update(f.key).digest("hex"), "a".repeat(64), "PIX"]);
  return { ...f, scope, registration, payment, accessId };
}
async function confirm(f: Awaited<ReturnType<typeof sale>>) {
  await prisma.registration.update({ where: { id: f.scope.registrationId }, data: { status: "CONFIRMED", paymentStatus: "PAID" } });
}
async function stages(scope: { churchId: string; eventId: string; registrationId: string }) {
  const rows = await pool.query('SELECT "stage" FROM "EventRegistrationConfirmationDeliveryEvent" WHERE "churchId"=$1 AND "eventId"=$2 AND "registrationId"=$3 ORDER BY "sequence"',
    [scope.churchId, scope.eventId, scope.registrationId]);
  return rows.rows.map(row => row.stage);
}
async function registrationOf(id: string) {
  return prisma.registration.findUniqueOrThrow({ where: { id } });
}
async function money(f: Awaited<ReturnType<typeof sale>>) {
  return { payment: await prisma.eventPayment.findUniqueOrThrow({ where: { id: f.payment.id } }),
    transaction: await prisma.transaction.findUniqueOrThrow({ where: { id: f.payment.transactionId } }),
    order: await prisma.eventOrder.findUniqueOrThrow({ where: { id: f.payment.orderId } }) };
}
function preserved(before: { status: string; paymentStatus: string; checkInToken: string }, after: { status: string; paymentStatus: string; checkInToken: string }) {
  assert.equal(after.status, before.status);
  assert.equal(after.paymentStatus, before.paymentStatus);
  assert.equal(after.checkInToken, before.checkInToken);
}

test("INTENT is visible to a second client before send, and only one owner posts", async () => {
  const f = await sale(); await confirm(f);
  const before = await registrationOf(f.scope.registrationId), finance = await money(f);
  let sends = 0;
  const send = async () => {
    sends++;
    const seen = await prisma2.$queryRaw<{ stage: string }[]>`SELECT "stage"::text AS "stage" FROM "EventRegistrationConfirmationDeliveryEvent" WHERE "churchId" = ${f.scope.churchId} AND "eventId" = ${f.scope.eventId} AND "registrationId" = ${f.scope.registrationId} ORDER BY "sequence"`;
    assert.deepEqual(seen.map(row => row.stage), ["DELIVERY_INTENT"]);
    assert.equal((await prisma2.registration.findUniqueOrThrow({ where: { id: f.scope.registrationId } })).confirmationEmailSentAt, null);
    assert.equal(await sendPendingRegistrationConfirmationEmail(prisma2, f.scope.churchId, f.scope, async () => { sends++; return true; }), false);
    return true;
  };
  assert.equal(await sendPendingRegistrationConfirmationEmail(prisma, f.scope.churchId, f.scope, send), true);
  assert.equal(sends, 1); assert.deepEqual(await stages(f.scope), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
  const after = await registrationOf(f.scope.registrationId);
  assert.ok(after.confirmationEmailSentAt); preserved(before, after); assert.deepEqual(await money(f), finance);
  assert.equal(await sendPendingRegistrationConfirmationEmail(prisma2, f.scope.churchId, f.scope, async () => { sends++; return true; }), false);
  assert.equal(sends, 1);
});

test("concurrent clients have one durable confirmation owner", async () => {
  const f = await sale(); await confirm(f); let sends = 0;
  const send = async (input: { recipientEmail: string }) => { sends++; assert.equal(input.recipientEmail, f.body.email); return true; };
  const results = await Promise.all([
    sendPendingRegistrationConfirmationEmail(prisma, f.scope.churchId, f.scope, send),
    sendPendingRegistrationConfirmationEmail(prisma2, f.scope.churchId, f.scope, send)
  ]);
  assert.equal(results.filter(Boolean).length, 1); assert.equal(sends, 1);
  assert.ok((await registrationOf(f.scope.registrationId)).confirmationEmailSentAt);
  assert.deepEqual(await stages(f.scope), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
});

test("timeout, false and throw become UNCERTAIN without a second POST or a late ACCEPTED", { timeout: 10_000 }, async () => {
  const timed = await sale(); await confirm(timed);
  const before = await registrationOf(timed.scope.registrationId), finance = await money(timed);
  let sends = 0; let releaseLate!: (value: boolean) => void;
  const hung = new Promise<boolean>(resolve => { releaseLate = resolve; });
  const started = Date.now();
  assert.equal(await sendPendingRegistrationConfirmationEmail(prisma, timed.scope.churchId, timed.scope, async () => { sends++; return hung; }, { deliveryTimeoutMs: 40 }), false);
  assert.ok(Date.now() - started < 1_000); assert.equal(sends, 1);
  assert.deepEqual(await stages(timed.scope), ["DELIVERY_INTENT", "DELIVERY_UNCERTAIN"]);
  assert.equal((await registrationOf(timed.scope.registrationId)).confirmationEmailSentAt, null);
  releaseLate(true); await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(await stages(timed.scope), ["DELIVERY_INTENT", "DELIVERY_UNCERTAIN"]);
  assert.equal(await sendPendingRegistrationConfirmationEmail(prisma2, timed.scope.churchId, timed.scope, async () => { sends++; return true; }), false);
  assert.equal(sends, 1); preserved(before, await registrationOf(timed.scope.registrationId)); assert.deepEqual(await money(timed), finance);
  for (const failure of [false, new Error("SIMULATED_EMAIL_EXCEPTION")] as const) {
    const f = await sale(); await confirm(f); const token = (await registrationOf(f.scope.registrationId)).checkInToken; let posts = 0;
    const send = async () => { posts++; if (failure instanceof Error) throw failure; return failure; };
    assert.equal(await sendPendingRegistrationConfirmationEmail(prisma, f.scope.churchId, f.scope, send), false);
    assert.equal(posts, 1); assert.deepEqual(await stages(f.scope), ["DELIVERY_INTENT", "DELIVERY_UNCERTAIN"]);
    assert.equal((await registrationOf(f.scope.registrationId)).confirmationEmailSentAt, null);
    assert.equal(await sendPendingRegistrationConfirmationEmail(prisma2, f.scope.churchId, f.scope, send), false);
    assert.equal(posts, 1);
    const after = await registrationOf(f.scope.registrationId);
    assert.equal(after.checkInToken, token); assert.equal(after.status, "CONFIRMED"); assert.equal(after.paymentStatus, "PAID");
  }
});

test("PENDING registration does not send or record a delivery event", async () => {
  const f = await sale(); const before = await registrationOf(f.scope.registrationId); let sends = 0;
  assert.equal(before.paymentStatus, "PENDING"); assert.equal(before.confirmationEmailSentAt, null);
  assert.equal(await sendPendingRegistrationConfirmationEmail(prisma, f.scope.churchId, f.scope, async () => { sends++; return true; }), false);
  assert.equal(sends, 0); assert.deepEqual(await stages(f.scope), []);
  const after = await registrationOf(f.scope.registrationId);
  preserved(before, after); assert.equal(after.confirmationEmailSentAt, null);
});

test("local checkoutEmail wins over the shared contact", async () => {
  const f = await sale(); await confirm(f);
  const local = "local-" + randomUUID() + "@example.invalid";
  await pool.query('UPDATE "Registration" SET "checkoutEmail"=$1 WHERE "id"=$2 AND "churchId"=$3', [local, f.scope.registrationId, f.scope.churchId]);
  const before = await registrationOf(f.scope.registrationId); let seen = "";
  assert.equal(await sendPendingRegistrationConfirmationEmail(prisma, f.scope.churchId, f.scope, async input => { seen = input.recipientEmail; return true; }), true);
  assert.equal(seen, local); assert.notEqual(seen, f.body.email);
  const after = await registrationOf(f.scope.registrationId);
  assert.ok(after.confirmationEmailSentAt); preserved(before, after);
  assert.deepEqual(await stages(f.scope), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
});

test("delivery history rejects mutation, illegal transitions and cross-tenant registration links", async () => {
  const f = await sale(), other = await sale();
  const columns = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='EventRegistrationConfirmationDeliveryEvent' ORDER BY column_name`)).rows.map(row => row.column_name);
  assert.deepEqual(columns, ["churchId", "createdAt", "eventId", "id", "registrationId", "sequence", "stage"]);
  const recovery = (await pool.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='EventCheckoutRecoveryDeliveryStage' ORDER BY e.enumsortorder`)).rows.map(row => row.enumlabel);
  assert.deepEqual(recovery, ["PREPARED", "DELIVERY_INTENT", "DELIVERY_ACCEPTED", "DELIVERY_UNCERTAIN", "DELIVERY_RECONCILED_ACCEPTED"]);
  const fk = (await pool.query(`SELECT confdeltype, confupdtype FROM pg_constraint WHERE conname='registration_confirmation_delivery_registration_fkey'`)).rows[0];
  assert.deepEqual(fk, { confdeltype: "r", confupdtype: "r" });
  const denied = async (sql: string, params: unknown[], code: string) => assert.rejects(pool.query(sql, params), (error: any) => error.code === code);
  const insert = `INSERT INTO "EventRegistrationConfirmationDeliveryEvent" ("id","churchId","eventId","registrationId","stage","createdAt") VALUES ($1,$2,$3,$4,$5,$6)`;
  await denied(insert, [randomUUID(), other.scope.churchId, f.scope.eventId, f.scope.registrationId, "DELIVERY_INTENT", new Date()], "23503");
  await denied(insert, [randomUUID(), f.scope.churchId, f.scope.eventId, f.scope.registrationId, "DELIVERY_ACCEPTED", new Date()], "23514");
  const intentId = randomUUID();
  await pool.query(insert, [intentId, f.scope.churchId, f.scope.eventId, f.scope.registrationId, "DELIVERY_INTENT", new Date()]);
  await denied(insert, [randomUUID(), f.scope.churchId, f.scope.eventId, f.scope.registrationId, "DELIVERY_INTENT", new Date()], "23514");
  await denied(insert, [randomUUID(), f.scope.churchId, f.scope.eventId, f.scope.registrationId, "DELIVERY_ACCEPTED", new Date("2020-01-01T00:00:00Z")], "23514");
  await pool.query(insert, [randomUUID(), f.scope.churchId, f.scope.eventId, f.scope.registrationId, "DELIVERY_ACCEPTED", new Date()]);
  await denied(insert, [randomUUID(), f.scope.churchId, f.scope.eventId, f.scope.registrationId, "DELIVERY_UNCERTAIN", new Date()], "23514");
  await denied(`UPDATE "EventRegistrationConfirmationDeliveryEvent" SET "stage"='DELIVERY_UNCERTAIN' WHERE "id"=$1`, [intentId], "23514");
  await denied(`DELETE FROM "EventRegistrationConfirmationDeliveryEvent" WHERE "id"=$1`, [intentId], "23514");
  await denied(`TRUNCATE "EventRegistrationConfirmationDeliveryEvent"`, [], "23514");
  const token = (await registrationOf(f.scope.registrationId)).checkInToken;
  await pool.query(`UPDATE "Registration" SET "checkedInAt"=statement_timestamp(), "confirmationEmailSentAt"=statement_timestamp() WHERE "id"=$1 AND "churchId"=$2`, [f.scope.registrationId, f.scope.churchId]);
  const row = (await pool.query(`SELECT "checkedInAt","confirmationEmailSentAt","checkInToken","status","paymentStatus" FROM "Registration" WHERE "id"=$1`, [f.scope.registrationId])).rows[0];
  assert.ok(row.checkedInAt); assert.ok(row.confirmationEmailSentAt); assert.equal(row.checkInToken, token);
  assert.deepEqual(await stages(f.scope), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
});
