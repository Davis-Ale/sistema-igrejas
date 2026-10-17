import assert from "node:assert/strict";
import test from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { CHECKOUT_ACCESS_TTL_MS, type CheckoutAccessRecord } from "../src/checkout-access.schema.ts";
import { revokeCheckoutAccess } from "../src/checkout-access.service.ts";
import { createAssistedCheckoutRecovery, type CheckoutRecoveryDelivery, type CheckoutRecoveryDeliveryAudit } from "../src/checkout-assisted-recovery.service.ts";
import { checkoutRecoveryDeliveryId } from "../src/checkout-recovery-delivery.identity.ts";
import { createPostgresRecoveryDeliveryStore, type DeliveryEvent } from "../src/checkout-recovery-delivery.store.ts";
import { prepareCheckoutV2Routes } from "../src/checkout-v2.routes.ts";
import { prepareEventsApiCheckoutV2 } from "../../../apps/events-api/src/checkout-v2.prepared.ts";
import { prepareApiBrCheckoutV2 } from "../../../apps/api-br/src/checkout-v2.prepared.ts";
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_ASSISTED_RECOVERY_TEST"); };
const actor = { churchId: "church-a", userId: "admin-a", role: "SUPER_ADMIN" };
const scope = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a" };
const time = new Date("2026-10-17T12:00:00Z");
const request = () => ({ operationId: randomUUID(), action: "RECOVER", verifiedEmail: "verified@example.invalid",
  verification: { ownershipVerified: true, emailPossessionVerified: true, registrationUnambiguous: true,
    evidenceReference: "case-123", verifiedChannelReference: "channel-123" } });
// Protocol double only: serialized callers and rollback, not a PostgreSQL lock,
// constraint, financial provider or human-verification implementation.
function harness() {
  const dbcontext = new AsyncLocalStorage<boolean>();
  let ambiguousCommit = false;
  let state = {
    accounts: [{ id: actor.userId, churchId: actor.churchId, role: actor.role, status: "ACTIVE" }],
    events: [{ id: scope.eventId, churchId: scope.churchId, deletedAt: null as Date | null }],
    registrations: [{ ...scope, id: scope.registrationId, registrationSource: "PUBLIC", paymentStatus: "PENDING",
      status: "PENDING", checkoutEmail: null as string | null, personId: null as string | null, visitorId: "shared-visitor" as string | null,
      checkInToken: "participant-checkin", confirmationEmailSentAt: new Date(time.getTime() - 1000),
      waitlistedAt: null as Date | null, paymentId: "transaction-a", orderId: "order-a" }],
    contacts: [{ id: "shared-visitor", churchId: scope.churchId, email: null as string | null }],
    financial: [{ id: "payment-a", transactionId: "transaction-a", orderId: "order-a", amount: 100,
      fee: 10, net: 90, providerPaymentId: "provider-a", method: "PIX", discountId: "discount-a", status: "PENDING" }],
    accesses: [] as CheckoutAccessRecord[], audits: [] as any[], deliveryEvents: [] as DeliveryEvent[]
  };
  let tail = Promise.resolve(), transactions = 0, failAudit: unknown = null, failCommit: unknown = null;
  const queries: { sql: string; values: unknown[] }[] = [];
  const scoped = (r: { churchId: string; eventId: string; registrationId: string }, values: unknown[]) =>
    r.churchId === values[0] && r.eventId === values[1] && r.registrationId === values[2];
  const tx = {
    event: { async findFirst({ where }: any) { return state.events.find(e => e.id === where.id &&
      e.churchId === where.churchId && e.deletedAt === null) ?? null; } },
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); queries.push({ sql, values });
      if (sql.includes("pg_advisory_xact_lock")) return [];
      if (sql.includes('FROM "UserAccount"')) return state.accounts.filter(a => a.churchId === values[0] && a.id === values[1] && a.role === "SUPER_ADMIN" && a.status === "ACTIVE");
      if (sql.includes('FROM "EventCheckoutRecoveryDeliveryEvent"')) return state.deliveryEvents.filter(a => a.churchId === values[0] && a.operationId === values[1]);
      if (sql.includes('FROM "EventCheckoutRecoveryAudit"')) return state.audits.filter(a => a.churchId === values[0] && a.operationId === values[1]);
      if (sql.includes('FROM "EventCheckoutAccess"')) return sql.includes('"credentialHash" =') ?
        state.accesses.filter(a => a.credentialHash === values[0]) : state.accesses.filter(a => scoped(a, values) && (values.length < 4 || a.id === values[3]));
      if (sql.includes('FROM "Registration" r')) {
        return state.registrations.filter(r => scoped(r, values)).map(r => {
          const p = state.contacts.find(p => p.id === r.personId && p.churchId === r.churchId);
          const v = state.contacts.find(v => v.id === r.visitorId && v.churchId === r.churchId);
          return { ...r, personEmail: p?.email ?? null, visitorEmail: v?.email ?? null, linkedPersonId: r.personId,
            linkedVisitorId: r.visitorId, personId: p?.id ?? null, visitorId: v?.id ?? null };
        });
      }
      if (sql.includes('FROM "Registration"') && sql.includes("FOR UPDATE")) return state.registrations.filter(r => scoped(r, values));
      throw new Error(`Unexpected query: ${sql}`);
    },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); queries.push({ sql, values });
      if (sql.includes('UPDATE "Registration"')) {
        const r = state.registrations.find(r => scoped(r, values.slice(1)));
        if (r && !r.checkoutEmail?.trim()) { r.checkoutEmail = values[0] as string; return 1; } return 0;
      }
      if (sql.includes('UPDATE "EventCheckoutAccess"')) {
        let count = 0;
        for (const a of state.accesses) if (scoped(a, values.slice(1)) && a.revokedAt === null &&
          (values.length === 4 || a.id === values[4])) { a.revokedAt = values[0] as Date; count++; }
        return count;
      }
      if (sql.includes('INSERT INTO "EventCheckoutAccess"')) {
        state.accesses.push({ id: values[0] as string, churchId: values[1] as string, eventId: values[2] as string,
          registrationId: values[3] as string, credentialHash: values[4] as string, source: "ADMIN_RECOVERY",
          requestFingerprint: null, requestedPaymentMethod: null, createdAt: values[5] as Date,
          expiresAt: values[6] as Date, revokedAt: null }); return 1;
      }
      if (sql.includes('INSERT INTO "EventCheckoutRecoveryDeliveryEvent"')) {
        state.deliveryEvents.push({ id: values[0] as string, churchId: values[1] as string, operationId: values[2] as string, stage: values[3] as DeliveryEvent["stage"],
          requestFingerprint: values[4] as string, actorUserId: values[5] as string, receiptReference: values[6] as string | null, evidenceReference: values[7] as string | null, createdAt: values[8] as Date }); return 1;
      }
      if (sql.includes('INSERT INTO "EventCheckoutRecoveryAudit"')) {
        if (failAudit) { const error = failAudit; failAudit = null; throw error; }
        state.audits.push({ id: values[0], churchId: values[1], eventId: values[2], registrationId: values[3],
          accessId: values[4], operationId: values[5], requestFingerprint: values[6], action: values[7], actorUserId: values[8],
          actorRole: "SUPER_ADMIN", ownershipVerified: values[9], verificationMethod: values[10], evidenceReference: values[11],
          verifiedChannelReference: values[12], reason: values[13], createdAt: values[14] }); return 1;
      }
      throw new Error(`Unexpected write: ${sql}`);
    }
  };
  const database = { async $transaction(operation: any, options: unknown) {
    assert.deepEqual(options, { isolationLevel: "Serializable" }); transactions++;
    const previous = tail; let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    const snapshot = structuredClone(state);
    try { const result = await dbcontext.run(true, () => operation(tx));
      if (ambiguousCommit && state.audits.length > snapshot.audits.length) { ambiguousCommit = false; throw { committed: true }; }
      if (failCommit) { const error = failCommit; failCommit = null; throw error; } return result;
    } catch (error) { if (!(error && typeof error === "object" && "committed" in error)) state = snapshot; throw error; } finally { release(); }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  return { database, queries, dbcontext, ambiguousCommit() { ambiguousCommit = true; }, get state() { return state; }, get transactions() { return transactions; },
    failAudit(error: unknown) { failAudit = error; }, failCommit(error: unknown) { failCommit = error; } };
}

function operation(h = harness(), timeout = 1000) {
  let now = new Date(time), auditFailure: string | null = null;
  let onSend: ((input: CheckoutRecoveryDelivery, signal: AbortSignal) => Promise<{ receiptReference: string }>) | undefined;
  let onAudit: (() => void) | undefined;
  const sent: CheckoutRecoveryDelivery[] = [], deliveryAudit: CheckoutRecoveryDeliveryAudit[] = [];
  const options = {
    retentionMs: 600_000, deliveryTimeoutMs: timeout, clock: () => new Date(now),
    deliveryStore: {
      ...createPostgresRecoveryDeliveryStore(h.database),
      async append(c: any, stage: any, at: Date, receipt: any = null, evidence: any = null) {
        assert.equal(h.dbcontext.getStore(), undefined);
        if (auditFailure === stage) { auditFailure = null; throw new Error("private audit failure"); }
        const claimed = await createPostgresRecoveryDeliveryStore(h.database).append(c, stage, at, receipt, evidence);
        if (claimed) { deliveryAudit.push({ ...c.scope, operationId: c.operationId, stage, receiptReference: receipt } as CheckoutRecoveryDeliveryAudit); onAudit?.(); }
        return claimed;
      }
    },
    async sendEmail(input: CheckoutRecoveryDelivery, signal: AbortSignal) {
      assert.equal(h.dbcontext.getStore(), undefined);
      assert.equal(deliveryAudit.at(-1)?.stage, "DELIVERY_INTENT");
      assert.ok(h.state.audits.some(a => a.operationId === input.operationId));
      assert.equal(h.state.accesses.find(a => a.revokedAt === null)!.credentialHash, createHash("sha256").update(input.credential).digest("hex"));
      sent.push(structuredClone(input));
      return onSend ? onSend(input, signal) : { receiptReference: "resend_receipt-123" };
    }
  };
  const service = createAssistedCheckoutRecovery(h.database, options);
  return { h, service, options, sent, deliveryAudit, advance(ms: number) { now = new Date(now.getTime() + ms); },
    failAudit(stage: string) { auditFailure = stage; },
    onSend(fn: NonNullable<typeof onSend>) { onSend = fn; }, onAudit(fn: () => void) { onAudit = fn; } };
}

test("verified email delivery reuses recovery audit and never exposes the generated secret to administrative results or audit", async () => {
  const o = operation(), req = request(), before = structuredClone(o.h.state);
  try {
    const result = await o.service.execute(actor, scope, req);
    assert.equal(result.delivery, "ACCEPTED"); assert.equal(o.sent.length, 1);
    assert.equal(o.sent[0]!.recipientEmail, req.verifiedEmail);
    assert.equal(o.sent[0]!.expiresAt.getTime() - time.getTime(), CHECKOUT_ACCESS_TTL_MS);
    assert.equal(o.h.state.audits[0].verificationMethod, "ASSISTED_VERIFIED_EMAIL_V1");
    assert.equal(o.h.state.audits[0].actorUserId, actor.userId);
    assert.equal(o.h.state.audits[0].evidenceReference, req.verification.evidenceReference);
    assert.deepEqual(o.h.state.financial, before.financial); assert.deepEqual(o.h.state.contacts, before.contacts);
    assert.deepEqual(o.h.state.registrations[0], { ...before.registrations[0], checkoutEmail: req.verifiedEmail });
    const serialized = JSON.stringify([result, o.deliveryAudit, o.h.state.audits]);
    assert.equal(serialized.includes(o.sent[0]!.credential), false); assert.equal(serialized.includes(req.verifiedEmail), false);
    assert.deepEqual(o.deliveryAudit.map(a => a.stage), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
    const replay = await o.service.execute(actor, scope, req);
    assert.equal(replay.wasExisting, true); assert.equal(o.sent.length, 1); assert.equal(o.h.state.audits.length, 1);
  } finally { o.service.dispose(); }
});

test("matching contacts do not replace human evidence, channel possession or unambiguous ownership", async () => {
  for (const patch of [{ verification: undefined }, { verification: { ...request().verification, ownershipVerified: false } },
    { verification: { ...request().verification, emailPossessionVerified: false } },
    { verification: { ...request().verification, registrationUnambiguous: false } },
    { verification: { ...request().verification, evidenceReference: "person@example.invalid" } },
    { verification: { ...request().verification, evidenceReference: "ec2_" + "a".repeat(43) } },
    { verification: { ...request().verification, verifiedChannelReference: "sik_" + "a".repeat(64) } },
    { name: "Participante" }, { phone: "41999990001" }, { email: "verified@example.invalid" }, { checkoutToken: "old" }, { credential: "ec2_secret" }]) {
    const o = operation(); o.h.state.contacts[0]!.email = "verified@example.invalid";
    try {
      await assert.rejects(o.service.execute(actor, scope, { ...request(), ...patch }), /CHECKOUT_RECOVERY_INPUT_INVALID/);
      assert.equal(o.h.transactions, 0); assert.equal(o.sent.length, 0); assert.equal(o.h.state.accesses.length, 0);
    } finally { o.service.dispose(); }
  }
});

test("current SUPER_ADMIN, exact church/event/registration and valid relationships are required before retaining or delivering", async () => {
  for (const change of ["role", "disabled", "church", "event", "registration", "relationship", "private", "status"]) {
    const o = operation(), target = { ...scope };
    if (change === "role") o.h.state.accounts[0]!.role = "PASTOR";
    if (change === "disabled") o.h.state.accounts[0]!.status = "DISABLED";
    if (change === "church") target.churchId = "other";
    if (change === "event") target.eventId = "other";
    if (change === "registration") target.registrationId = "other";
    if (change === "relationship") o.h.state.contacts[0]!.churchId = "other";
    if (change === "private") o.h.state.registrations[0]!.registrationSource = "ADMIN";
    if (change === "status") o.h.state.registrations[0]!.paymentStatus = "CANCELLED";
    try {
      await assert.rejects(o.service.execute(actor, target, request()));
      assert.equal(o.sent.length, 0); assert.equal(o.h.state.accesses.length, 0);
    } finally { o.service.dispose(); }
  }
});

test("existing or invalid destinations never redirect delivery; REISSUE cannot fill a missing destination", async () => {
  for (const destination of ["other@example.invalid", "invalid-email"]) {
    const o = operation(); o.h.state.registrations[0]!.checkoutEmail = destination;
    try { await assert.rejects(o.service.execute(actor, scope, request()), /CHECKOUT_DESTINATION_/);
      assert.equal(o.sent.length, 0); assert.equal(o.h.state.audits.length, 0);
    } finally { o.service.dispose(); }
  }
  const o = operation();
  try { await assert.rejects(o.service.execute(actor, scope, { ...request(), action: "REISSUE" }), /CHECKOUT_DESTINATION_REQUIRED/); }
  finally { o.service.dispose(); }
});

test("concurrent identical requests and explicit retries never duplicate issuance or email", async () => {
  const o = operation(), req = request(); let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
  o.onSend(async () => { entered(); await hold; return { receiptReference: "resend_receipt-123" }; });
  try {
    const owner = o.service.execute(actor, scope, req); await started;
    const competitors = Array.from({ length: 8 }, () => o.service.execute(actor, scope, req));
    await assert.rejects(o.service.execute(actor, scope, { ...req, verifiedEmail: "changed@example.invalid" }));
    release(); const results = await Promise.all([owner, ...competitors]);
    assert.ok(results.every(r => r.accessId === results[0]!.accessId));
    assert.equal(o.sent.length, 1); assert.equal(o.h.state.audits.length, 1);
  } finally { release?.(); o.service.dispose(); }
});

test("delivery-intent audit failure prevents sending; explicit retry keeps the same key, access and 24h expiry", async () => {
  const o = operation(), req = request(); o.failAudit("DELIVERY_INTENT");
  try {
    await assert.rejects(o.service.execute(actor, scope, req), /CHECKOUT_RECOVERY_RETRY_REQUIRED/);
    const before = structuredClone(o.h.state.accesses[0]); assert.equal(o.sent.length, 0);
    o.advance(1000); await o.service.execute(actor, scope, req);
    assert.deepEqual(o.h.state.accesses[0], before); assert.equal(o.h.state.audits.length, 1);
  } finally { o.service.dispose(); }
});

test("ambiguous issuance commit is replayed with the retained key before any email", async () => {
  const o = operation(), req = request(); o.h.ambiguousCommit();
  try {
    await assert.rejects(o.service.execute(actor, scope, req), /CHECKOUT_RECOVERY_RETRY_REQUIRED/);
    const hash = o.h.state.accesses[0]!.credentialHash;
    assert.equal(o.sent.length, 0); await o.service.execute(actor, scope, req);
    assert.equal(createHash("sha256").update(o.sent[0]!.credential).digest("hex"), hash);
    assert.equal(o.h.state.audits.length, 1);
  } finally { o.service.dispose(); }
});

test("exceptions, timeout and accepted-audit failure block every resend, including late provider results", async () => {
  for (const failure of ["exception", "timeout", "audit"]) {
    const o = operation(undefined, 15), req = request(); let finishLate: ((value: { receiptReference: string }) => void) | undefined;
    if (failure === "exception") o.onSend(async () => { throw new Error("private-key-or-provider-body"); });
    if (failure === "timeout") o.onSend(async () => new Promise(resolve => { finishLate = resolve; }));
    if (failure === "audit") o.failAudit("DELIVERY_ACCEPTED");
    try {
      await assert.rejects(o.service.execute(actor, scope, req), /CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN/);
      finishLate?.({ receiptReference: "resend_late-123" });
      await assert.rejects(o.service.execute(actor, scope, req), /CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN/);
      assert.equal(o.sent.length, 1); assert.equal(o.deliveryAudit.at(-1)?.stage, "DELIVERY_UNCERTAIN");
    } finally { o.service.dispose(); }
  }
});

test("retention expiry or process restart cannot reconstruct a committed key or renew access", async () => {
  for (const failure of ["expiry", "restart"]) {
    const o = operation(), req = request(); o.failAudit("DELIVERY_INTENT");
    let next: ReturnType<typeof createAssistedCheckoutRecovery> | undefined;
    try {
      await assert.rejects(o.service.execute(actor, scope, req)); const access = structuredClone(o.h.state.accesses[0]);
      if (failure === "expiry") { o.advance(600_000); await assert.rejects(o.service.execute(actor, scope, req), /CHECKOUT_RECOVERY_KEY_UNAVAILABLE/); }
      else { o.service.dispose(); next = createAssistedCheckoutRecovery(o.h.database, o.options);
        await assert.rejects(next.execute(actor, scope, req), /CHECKOUT_RECOVERY_KEY_UNAVAILABLE/); }
      assert.equal(o.sent.length, 0); assert.deepEqual(o.h.state.accesses[0], access);
    } finally { next?.dispose(); o.service.dispose(); }
  }
});

test("revocation or role change after delivery intent suppresses handoff", async () => {
  for (const change of ["role", "revoked"]) {
    const o = operation(); o.onAudit(() => {
      if (change === "role") o.h.state.accounts[0]!.role = "PASTOR";
      else o.h.state.accesses[0]!.revokedAt = time;
    });
    try { await assert.rejects(o.service.execute(actor, scope, request())); assert.equal(o.sent.length, 0); }
    finally { o.service.dispose(); }
  }
});

test("historic PIX/CARD recovery preserves ambiguous financial state; reissue/revoke require explicit operations", async () => {
  for (const method of ["PIX", "CARD"]) {
    const o = operation(), req = request(); o.h.state.financial[0]!.method = method; o.h.state.financial[0]!.providerPaymentId = "";
    const before = structuredClone(o.h.state.financial);
    try {
      await o.service.execute(actor, scope, req);
      await assert.rejects(o.service.execute(actor, scope, { ...req, operationId: randomUUID() }), /CHECKOUT_REISSUE_REQUIRED/);
      const old = o.h.state.accesses[0]!;
      await o.service.execute(actor, scope, { ...req, operationId: randomUUID(), action: "REISSUE" });
      assert.ok(old.revokedAt); assert.equal(o.h.state.accesses.length, 2);
      await revokeCheckoutAccess(o.h.database, actor, scope, { operationId: randomUUID(), reason: "Atendimento revogou acesso" }, () => time);
      assert.ok(o.h.state.accesses.every(a => a.revokedAt)); assert.deepEqual(o.h.state.financial, before);
    } finally { o.service.dispose(); }
  }
});

test("prepared recovery refuses caller keys and remains closed without delivery; configured handler receives only authenticated scope", async () => {
  const h = harness(), calls: any[] = [], app = Fastify();
  await app.register(jwt, { secret: "isolated-assisted-recovery-test-secret" });
  (h.database as any).userAccount = { async findUnique() { return { ...h.state.accounts[0], person: null }; } };
  const provider = { async read(): Promise<never> { throw new Error("unexpected"); }, async pix(): Promise<never> { throw new Error("unexpected"); } };
  const execute = async (...args: any[]) => { calls.push(args); return { delivery: "ACCEPTED" } as any; };
  for (const route of prepareCheckoutV2Routes(h.database as PrismaClient, provider, undefined, { execute })) app.route(route);
  const url = "/api/events/event-a/registrations/registration-a/checkout/recovery";
  try {
    const token = app.jwt.sign({ userId: actor.userId, churchId: actor.churchId, role: "SUPER_ADMIN" }), headers = { authorization: `Bearer ${token}` };
    assert.equal((await app.inject({ method: "POST", url, payload: request() })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url, headers: { ...headers, "x-event-checkout-key": "forged" }, payload: request() })).statusCode, 400);
    const result = await app.inject({ method: "POST", url, headers, payload: request() });
    assert.equal(result.statusCode, 200); assert.equal(result.headers["cache-control"], "no-store");
    assert.deepEqual(calls[0][0], actor); assert.deepEqual(calls[0][1], scope);
    assert.equal(calls.length, 1); assert.equal(h.state.accesses.length, 0);
  } finally { await app.close(); }
});

test("no active builder or package entrypoint imports assisted recovery or the email adapter", async () => {
  for (const p of ["../../../apps/api-br/src/app.ts", "../../../apps/events-api/src/app.ts", "../src/index.ts"]) {
    const source = await readFile(new URL(p, import.meta.url), "utf8");
    assert.equal(source.includes("checkout-assisted-recovery"), false); assert.equal(source.includes("checkout-recovery-email"), false);
  }
});

test("both dormant server compositions accept explicit assisted delivery while the default stays blocked", async () => {
  for (const prepare of [prepareEventsApiCheckoutV2, prepareApiBrCheckoutV2]) for (const configured of [false, true]) {
    const o = operation(), h = o.h, app = Fastify();
    (h.database as any).userAccount = { async findUnique() { return { ...h.state.accounts[0], person: null }; } };
    await app.register(jwt, { secret: "isolated-assisted-recovery-test-secret" });
    for (const route of prepare(h.database as PrismaClient, configured ? o.service : undefined)) app.route(route);
    try {
      const token = app.jwt.sign({ userId: actor.userId, churchId: actor.churchId, role: "SUPER_ADMIN" });
      const result = await app.inject({ method: "POST", url: "/api/events/event-a/registrations/registration-a/checkout/recovery",
        headers: { authorization: `Bearer ${token}` }, payload: request() });
      assert.equal(result.statusCode, configured ? 200 : 503);
      assert.equal(o.sent.length, configured ? 1 : 0);
      assert.equal(result.body.includes("ec2_"), false); assert.equal(result.body.includes("verified@example.invalid"), false);
    } finally { await app.close(); o.service.dispose(); }
  }
});


test("preparation failure rolls back access, recovery audit, destination and prior revocation", async () => {
  const o = operation(), req = request();
  const store = { ...o.options.deliveryStore, async prepare(): Promise<void> { throw new Error("synthetic preparation failure"); } };
  const service = createAssistedCheckoutRecovery(o.h.database, { ...o.options, deliveryStore: store });
  try {
    const before = structuredClone(o.h.state);
    await assert.rejects(service.execute(actor, scope, req), /RETRY_REQUIRED/);
    assert.deepEqual(o.h.state, before); assert.equal(o.sent.length, 0);
  } finally { service.dispose(); o.service.dispose(); }
});

test("restart reads persisted ACCEPTED and current revocation without key reconstruction or resend", async () => {
  const o = operation(), req = request(); let next: ReturnType<typeof createAssistedCheckoutRecovery> | undefined;
  try {
    const first = await o.service.execute(actor, scope, req); o.service.dispose();
    o.h.state.accesses[0]!.revokedAt = new Date(time.getTime() + 1000);
    next = createAssistedCheckoutRecovery(o.h.database, o.options);
    const result = await next.execute(actor, scope, req), status = await next.inspect(actor, scope, req);
    assert.equal(result.receiptReference, first.receiptReference); assert.equal(result.wasExisting, true);
    assert.deepEqual(result.revokedAt, o.h.state.accesses[0]!.revokedAt); assert.equal(status.delivery, "ACCEPTED");
    assert.equal(o.sent.length, 1); assert.equal(o.h.state.deliveryEvents.length, 3);
    o.h.state.registrations[0]!.paymentStatus = "REFUNDED"; o.h.state.registrations[0]!.checkoutEmail = "changed@example.invalid";
    assert.equal((await next.inspect(actor, scope, req)).delivery, "ACCEPTED");
    o.h.state.registrations[0]!.paymentStatus = "PENDING"; o.h.state.registrations[0]!.checkoutEmail = req.verifiedEmail;
    for (const patch of [{ action: "REISSUE" }, { verification: { ...req.verification, evidenceReference: "case-other" } }])
      await assert.rejects(next.execute(actor, scope, { ...req, ...patch }), /CONFLICT/);
  } finally { next?.dispose(); o.service.dispose(); }
});

test("ambiguous intent commit never resends in retained process or after restart", async () => {
  const o = operation(), req = request(); const real = o.options.deliveryStore;
  const service = createAssistedCheckoutRecovery(o.h.database, { ...o.options, deliveryStore: { ...real,
    async append(...args: Parameters<typeof real.append>) { const result = await real.append(...args);
      if (args[1] === "DELIVERY_INTENT") throw new Error("synthetic lost commit acknowledgement"); return result; } } });
  let next: ReturnType<typeof createAssistedCheckoutRecovery> | undefined;
  try {
    await assert.rejects(service.execute(actor, scope, req), /RETRY_REQUIRED/);
    await assert.rejects(service.execute(actor, scope, req), /DELIVERY_UNCERTAIN/);
    service.dispose(); next = createAssistedCheckoutRecovery(o.h.database, o.options);
    await assert.rejects(next.execute(actor, scope, req), /DELIVERY_UNCERTAIN/);
    assert.equal((await next.inspect(actor, scope, req)).delivery, "UNCERTAIN"); assert.equal(o.sent.length, 0);
  } finally { next?.dispose(); service.dispose(); o.service.dispose(); }
});

test("ambiguous accepted commit remains ACCEPTED and cannot be downgraded", async () => {
  const o = operation(), req = request(), real = o.options.deliveryStore;
  const service = createAssistedCheckoutRecovery(o.h.database, { ...o.options, deliveryStore: { ...real,
    async append(...args: Parameters<typeof real.append>) { const result = await real.append(...args);
      if (args[1] === "DELIVERY_ACCEPTED") throw new Error("synthetic lost acknowledgement"); return result; } } });
  try {
    await assert.rejects(service.execute(actor, scope, req), /DELIVERY_UNCERTAIN/);
    assert.equal((await service.execute(actor, scope, req)).delivery, "ACCEPTED");
    assert.deepEqual(o.h.state.deliveryEvents.map(e => e.stage), ["PREPARED", "DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
    assert.equal(o.sent.length, 1);
  } finally { service.dispose(); o.service.dispose(); }
});

test("failed uncertain persistence leaves blocking intent and explicit reconciliation binds provider evidence", async () => {
  const o = operation(), req = request(); o.onSend(async () => { throw new Error("synthetic transport loss"); }); o.failAudit("DELIVERY_UNCERTAIN");
  let next: ReturnType<typeof createAssistedCheckoutRecovery> | undefined; let reads = 0; let mismatch = true;
  const evidence = { receiptReference: "resend_known-123", evidenceReference: "case-reconciliation" };
  try {
    await assert.rejects(o.service.execute(actor, scope, req), /DELIVERY_UNCERTAIN/); o.service.dispose();
    next = createAssistedCheckoutRecovery(o.h.database, { ...o.options, readEmail: async reference => {
      reads++; return { receiptReference: reference, operationId: req.operationId, recipientEmail: req.verifiedEmail,
        deliveryId: mismatch ? "0".repeat(64) : checkoutRecoveryDeliveryId({ ...scope, operationId: req.operationId, accessId: o.h.state.accesses[0]!.id }) };
    } });
    await assert.rejects(next.execute(actor, scope, req), /DELIVERY_UNCERTAIN/);
    await assert.rejects(next.reconcile(actor, scope, req, evidence), /CONFLICT/);
    assert.equal(o.h.state.deliveryEvents.at(-1)!.stage, "DELIVERY_INTENT"); mismatch = false;
    const result = await next.reconcile(actor, scope, req, evidence);
    assert.equal(result.delivery, "ACCEPTED"); assert.equal(o.sent.length, 1); assert.equal(reads, 2);
    await next.reconcile(actor, scope, req, evidence); assert.equal(reads, 2);
    assert.deepEqual(o.h.state.deliveryEvents.map(e => e.stage), ["PREPARED", "DELIVERY_INTENT", "DELIVERY_RECONCILED_ACCEPTED"]);
    assert.equal((await next.execute(actor, scope, req)).delivery, "ACCEPTED");
    await assert.rejects(next.reconcile(actor, scope, req, { ...evidence, receiptReference: "resend_other-123" }), /CONFLICT/);
  } finally { next?.dispose(); o.service.dispose(); }
});

test("independent coordinators share the durable operation without duplicate issuance or send", async () => {
  const o = operation(), req = request(), second = createAssistedCheckoutRecovery(o.h.database, o.options);
  try {
    const outcomes = await Promise.allSettled([o.service.execute(actor, scope, req), second.execute(actor, scope, req)]);
    assert.ok(outcomes.some(r => r.status === "fulfilled")); assert.equal(o.sent.length, 1);
    assert.equal(o.h.state.audits.length, 1); assert.equal(o.h.state.accesses.length, 1);
    assert.equal((await second.execute(actor, scope, req)).delivery, "ACCEPTED");
  } finally { second.dispose(); o.service.dispose(); }
});
