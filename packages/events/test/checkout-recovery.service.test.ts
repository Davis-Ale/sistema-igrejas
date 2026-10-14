import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CHECKOUT_ACCESS_TTL_MS, type CheckoutAccessRecord } from "../src/checkout-access.schema.ts";
import { generateCheckoutCredential, recoverCheckoutAccess, revokeCheckoutAccess, withCheckoutAuthorization } from "../src/checkout-access.service.ts";

const actor = { churchId: "church-a", userId: "admin-a", role: "SUPER_ADMIN" };
const scope = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a" };
const time = new Date("2026-10-14T12:00:00Z"), clock = () => new Date(time);
const verification = { ownershipVerified: true, verificationMethod: "Atendimento humano",
  evidenceReference: "atendimento-123", verifiedChannelReference: "canal-123" };
const request = () => ({ operationId: randomUUID(), action: "RECOVER", verification, email: "specific@example.invalid" });
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

// Protocol double only: serialized callers and rollback, not a PostgreSQL lock,
// constraint, financial provider or human-verification implementation.
function harness() {
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
    accesses: [] as CheckoutAccessRecord[], audits: [] as any[]
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
      if (sql.includes('FROM "EventCheckoutRecoveryAudit"')) return state.audits.filter(a => a.churchId === values[0] && a.operationId === values[1]);
      if (sql.includes('FROM "EventCheckoutAccess"')) return sql.includes('"credentialHash" =') ?
        state.accesses.filter(a => a.credentialHash === values[0]) : state.accesses.filter(a => scoped(a, values));
      if (sql.includes('FROM "Registration" r')) {
        return state.registrations.filter(r => scoped(r, values)).map(r => {
          const p = state.contacts.find(p => p.id === r.personId && p.churchId === r.churchId);
          const v = state.contacts.find(v => v.id === r.visitorId && v.churchId === r.churchId);
          return { personEmail: p?.email ?? null, visitorEmail: v?.email ?? null, linkedPersonId: r.personId,
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
    try { const result = await operation(tx);
      if (failCommit) { const error = failCommit; failCommit = null; throw error; } return result;
    } catch (error) { state = snapshot; throw error; } finally { release(); }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  return { database, queries, get state() { return state; }, get transactions() { return transactions; },
    failAudit(error: unknown) { failAudit = error; }, failCommit(error: unknown) { failCommit = error; } };
}

test("human-verified recovery persists scoped email/grant/audit without financial or shared-contact writes", async () => {
  for (const paymentStatus of ["PENDING", "PAID"]) {
    const h = harness(), key = generateCheckoutCredential(), req = request();
    h.state.registrations[0]!.paymentStatus = paymentStatus;
    const before = structuredClone(h.state);
    const result = await recoverCheckoutAccess(h.database, actor, scope, key, req, clock);
    assert.deepEqual(h.state.financial, before.financial); assert.deepEqual(h.state.contacts, before.contacts);
    assert.deepEqual(h.state.registrations[0], { ...before.registrations[0], checkoutEmail: req.email });
    const a = h.state.accesses[0]!; assert.equal(a.source, "ADMIN_RECOVERY"); assert.equal(a.credentialHash, hash(key));
    assert.equal(a.requestFingerprint, null); assert.equal(a.requestedPaymentMethod, null);
    assert.equal(a.expiresAt.getTime() - a.createdAt.getTime(), CHECKOUT_ACCESS_TTL_MS);
    assert.equal(result.wasExisting, false); assert.equal(h.state.audits.length, 1);
    assert.deepEqual(h.state.audits[0], { ...h.state.audits[0], ...scope, action: "RECOVER", actorUserId: actor.userId,
      actorRole: "SUPER_ADMIN", ownershipVerified: true, verificationMethod: verification.verificationMethod,
      evidenceReference: verification.evidenceReference, verifiedChannelReference: verification.verifiedChannelReference, reason: null });
    assert.equal(JSON.stringify(h.state.accesses).includes(key), false); assert.equal(JSON.stringify(h.state.audits).includes(key), false);
    assert.equal(JSON.stringify(result).includes(req.email), false); assert.equal(JSON.stringify(result).includes(key), false);
    assert.ok(h.queries.every(q => !q.sql.includes(key) && !q.sql.includes(req.email)));
  }
});

test("only current active tenant SUPER_ADMIN can recover or revoke", async () => {
  for (const change of ["claimed-role", "database-role", "disabled", "actor-tenant", "missing-account"]) {
    const h = harness(); const claimed = { ...actor };
    if (change === "claimed-role") claimed.role = "PASTOR";
    if (change === "database-role") h.state.accounts[0]!.role = "PASTOR";
    if (change === "disabled") h.state.accounts[0]!.status = "DISABLED";
    if (change === "actor-tenant") claimed.churchId = "other";
    if (change === "missing-account") h.state.accounts = [];
    await assert.rejects(recoverCheckoutAccess(h.database, claimed, scope, generateCheckoutCredential(), request(), clock), /CHECKOUT_RECOVERY_FORBIDDEN/);
    await assert.rejects(revokeCheckoutAccess(h.database, claimed, scope, { operationId: randomUUID(), reason: "Revogar acesso" }, clock), /CHECKOUT_RECOVERY_FORBIDDEN/);
    assert.equal(h.state.accesses.length, 0); assert.equal(h.state.audits.length, 0);
  }
});

test("scope and related ownership are rechecked without lookup by contacts", async () => {
  for (const change of ["event", "registration", "church", "contact-tenant", "event-tenant", "private-source"]) {
    const h = harness(), target = { ...scope };
    if (change === "event") target.eventId = "other";
    if (change === "registration") target.registrationId = "other";
    if (change === "church") target.churchId = "other";
    if (change === "contact-tenant") h.state.contacts[0]!.churchId = "other";
    if (change === "event-tenant") h.state.events[0]!.churchId = "other";
    if (change === "private-source") h.state.registrations[0]!.registrationSource = "ADMIN";
    await assert.rejects(recoverCheckoutAccess(h.database, actor, target, generateCheckoutCredential(), request(), clock));
    assert.equal(h.state.accesses.length, 0); assert.equal(h.state.audits.length, 0);
  }
});

test("strict contracts reject missing human evidence, contact lookup, legacy tokens and financial overrides", async () => {
  for (const patch of [{ verification: undefined }, { verification: { ...verification, ownershipVerified: false } },
    { verification: { ...verification, evidenceReference: "" } }, { name: "Participante" }, { phone: "41999990001" },
    { checkoutToken: "legacy" }, { paymentStatus: "PAID" }, { actorUserId: "other" }]) {
    const h = harness(); await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), { ...request(), ...patch }, clock));
    assert.equal(h.transactions, 0);
  }
  const h = harness();
  await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, "registration.old-token", request(), clock), /CHECKOUT_ACCESS_DENIED/);
});

test("only PENDING and PAID payment states allow a new recovery, without promoting ineligible participant flags", async () => {
  for (const status of ["NOT_REQUIRED", "WAITING_PAYMENT", "WAITLISTED", "CANCELLED", "REFUNDED", "OVERDUE"]) {
    const h = harness(); h.state.registrations[0]!.paymentStatus = status;
    await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock), /CHECKOUT_RECOVERY_INELIGIBLE/);
    assert.equal(h.state.audits.length, 0);
  }
  const h = harness(); h.state.registrations[0]!.status = "CANCELLED"; h.state.registrations[0]!.waitlistedAt = time;
  const before = structuredClone(h.state.registrations[0]);
  await recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock);
  assert.deepEqual(h.state.registrations[0], { ...before, checkoutEmail: request().email });
});

test("destination precedence preserves local/contact email and does not mutate shared registrations", async () => {
  for (const local of [true, false]) {
    const h = harness(); h.state.contacts[0]!.email = "shared@example.invalid";
    if (local) h.state.registrations[0]!.checkoutEmail = "local@example.invalid";
    const dest = local ? "local@example.invalid" : "shared@example.invalid";
    const req = { ...request(), email: dest.toUpperCase() };
    const before = structuredClone(h.state);
    await recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), req, clock);
    assert.deepEqual(h.state.registrations, before.registrations); assert.deepEqual(h.state.contacts, before.contacts);
  }
  const h = harness(); h.state.registrations.push({ ...h.state.registrations[0]!, id: "registration-b", registrationId: "registration-b" });
  await recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock);
  assert.equal(h.state.registrations[1]!.checkoutEmail, null); assert.equal(h.state.contacts[0]!.email, null);
});

test("existing destination cannot be overwritten; missing destination requires RECOVER email", async () => {
  const h = harness(); h.state.contacts[0]!.email = "existing@example.invalid";
  await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock), /CHECKOUT_DESTINATION_CONFLICT/);
  const absent = harness(); const { email: _email, ...req } = request();
  for (const action of ["RECOVER", "REISSUE"]) await assert.rejects(recoverCheckoutAccess(absent.database, actor, scope, generateCheckoutCredential(), { ...req, action }, clock), /CHECKOUT_DESTINATION_REQUIRED/);
  const invalid = harness(); invalid.state.contacts[0]!.email = "invalid";
  await assert.rejects(recoverCheckoutAccess(invalid.database, actor, scope, generateCheckoutCredential(), req, clock), /CHECKOUT_DESTINATION_INVALID/);
});

test("same operation/key/payload is idempotent; conflicting key, evidence, actor, scope or action is rejected", async () => {
  const h = harness(), key = generateCheckoutCredential(), req = request();
  const first = await recoverCheckoutAccess(h.database, actor, scope, key, req, clock);
  const retry = await recoverCheckoutAccess(h.database, actor, scope, key, { ...req, operationId: req.operationId.toUpperCase(), email: req.email.toUpperCase() }, () => new Date(time.getTime() + 1000));
  assert.deepEqual(retry, { ...first, wasExisting: true }); assert.equal(h.state.audits.length, 1);
  for (const patch of [{ email: "changed@example.invalid" }, { verification: { ...verification, evidenceReference: "other-reference" } },
    { action: "REISSUE", email: undefined }]) {
    // REISSUE must omit email entirely under the strict contract.
    const value: any = { ...req, ...patch }; if (patch.action === "REISSUE") delete value.email;
    await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, key, value, clock), /CHECKOUT_RECOVERY_CONFLICT/);
  }
  await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), req, clock), /CHECKOUT_RECOVERY_CONFLICT/);
  h.state.accounts.push({ ...h.state.accounts[0]!, id: "admin-b" });
  await assert.rejects(recoverCheckoutAccess(h.database, { ...actor, userId: "admin-b" }, scope, key, req, clock), /CHECKOUT_RECOVERY_CONFLICT/);
  assert.equal(h.state.audits.length, 1); assert.equal(h.state.accesses.length, 1);
});

test("reissue atomically revokes an expired unrevoked grant and creates a fresh 24h access without replacing finance", async () => {
  const h = harness(), old = generateCheckoutCredential();
  await recoverCheckoutAccess(h.database, actor, scope, old, request(), clock);
  const beforeFinance = structuredClone(h.state.financial);
  await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock), /CHECKOUT_REISSUE_REQUIRED/);
  const later = () => new Date(time.getTime() + CHECKOUT_ACCESS_TTL_MS + 1), fresh = generateCheckoutCredential();
  const req = { operationId: randomUUID(), action: "REISSUE", verification };
  await recoverCheckoutAccess(h.database, actor, scope, fresh, req, later);
  assert.equal(h.state.accesses.filter(a => a.revokedAt === null).length, 1);
  assert.equal(h.state.accesses[0]!.revokedAt?.getTime(), later().getTime());
  assert.equal(h.state.accesses[1]!.expiresAt.getTime(), later().getTime() + CHECKOUT_ACCESS_TTL_MS);
  assert.deepEqual(h.state.financial, beforeFinance);
  await assert.rejects(withCheckoutAuthorization(h.database, scope, old, async () => assert.fail("revoked access"), later), /CHECKOUT_ACCESS_DENIED/);
  assert.deepEqual(await withCheckoutAuthorization(h.database, scope, fresh, async (_tx, resolved) => resolved, later), scope);
});

test("revocation is audited and retry cannot revoke a later reissued grant or restore expired access", async () => {
  const h = harness(), key = generateCheckoutCredential(), original = request();
  await recoverCheckoutAccess(h.database, actor, scope, key, original, clock);
  const req = { operationId: randomUUID(), reason: "Revogar acesso por atendimento" };
  const first = await revokeCheckoutAccess(h.database, actor, scope, req, clock);
  const before = structuredClone(h.state.financial);
  const fresh = generateCheckoutCredential();
  await recoverCheckoutAccess(h.database, actor, scope, fresh, { operationId: randomUUID(), action: "REISSUE", verification }, clock);
  assert.deepEqual(await revokeCheckoutAccess(h.database, actor, scope, req, clock), { ...first, wasExisting: true });
  assert.equal(h.state.accesses[1]!.revokedAt, null); assert.deepEqual(h.state.financial, before);
  const delayed = await recoverCheckoutAccess(h.database, actor, scope, key, original, () => new Date(time.getTime() + CHECKOUT_ACCESS_TTL_MS));
  assert.ok(delayed.revokedAt); assert.equal(h.state.accesses[0]!.revokedAt?.getTime(), time.getTime());
  await assert.rejects(revokeCheckoutAccess(h.database, actor, scope, { ...req, reason: "different reason" }, clock), /CHECKOUT_RECOVERY_CONFLICT/);
  const audit = h.state.audits.find(a => a.action === "REVOKE");
  assert.equal(audit.ownershipVerified, null); assert.equal(audit.evidenceReference, null); assert.equal(audit.reason, req.reason);
});

test("audit failure rolls back email/new access and reissue/revocation effects", async () => {
  for (const action of ["RECOVER", "REISSUE", "REVOKE"]) {
    const h = harness(); if (action !== "RECOVER") await recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock);
    const before = structuredClone(h.state); h.failAudit(new Error("isolated audit failure"));
    const operation = action === "REVOKE" ? revokeCheckoutAccess(h.database, actor, scope, { operationId: randomUUID(), reason: "Revogar acesso" }, clock) :
      recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), action === "RECOVER" ? request() : { operationId: randomUUID(), action, verification }, clock);
    await assert.rejects(operation, /isolated audit failure/); assert.deepEqual(h.state, before);
  }
});

test("concurrent equivalent recovery requests create one grant and one audit in the serialized protocol", async () => {
  const h = harness(), key = generateCheckoutCredential(), req = request();
  const results = await Promise.all(Array.from({ length: 15 }, () => recoverCheckoutAccess(h.database, actor, scope, key, req, clock)));
  assert.equal(results.filter(r => !r.wasExisting).length, 1); assert.equal(h.state.accesses.length, 1); assert.equal(h.state.audits.length, 1);
});

test("serialization retry rolls back audited effects before retry; ambiguous timeout does not retry", async () => {
  const h = harness(); h.failCommit({ code: "P2034" });
  await recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock);
  assert.equal(h.transactions, 2); assert.equal(h.state.accesses.length, 1); assert.equal(h.state.audits.length, 1);
  const timeout = harness(); timeout.failCommit({ code: "P2028" });
  await assert.rejects(recoverCheckoutAccess(timeout.database, actor, scope, generateCheckoutCredential(), request(), clock));
  assert.equal(timeout.transactions, 1); assert.equal(timeout.state.audits.length, 0);
});

test("a private key already bound elsewhere cannot be recovered or reused as a fresh credential", async () => {
  const h = harness(), key = generateCheckoutCredential();
  h.state.accesses.push({ ...scope, eventId: "other", id: "other-access", credentialHash: hash(key), source: "ADMIN_RECOVERY",
    requestFingerprint: null, requestedPaymentMethod: null, createdAt: time, expiresAt: new Date(time.getTime() + CHECKOUT_ACCESS_TTL_MS), revokedAt: null });
  await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, key, request(), clock), /CHECKOUT_RECOVERY_CONFLICT/);
  assert.equal(h.state.audits.length, 0); assert.equal(h.state.registrations[0]!.checkoutEmail, null);
});

test("tenant operation UUID cannot be reused for another registration/event", async () => {
  const h = harness(), key = generateCheckoutCredential(), req = request();
  await recoverCheckoutAccess(h.database, actor, scope, key, req, clock);
  const other = { ...scope, eventId: "event-b", registrationId: "registration-b" };
  h.state.events.push({ id: other.eventId, churchId: other.churchId, deletedAt: null });
  h.state.registrations.push({ ...h.state.registrations[0]!, ...other, id: other.registrationId });
  const before = structuredClone(h.state);
  await assert.rejects(recoverCheckoutAccess(h.database, actor, other, generateCheckoutCredential(), req, clock), /CHECKOUT_RECOVERY_CONFLICT/);
  await assert.rejects(revokeCheckoutAccess(h.database, actor, other, { operationId: req.operationId, reason: "Revogar acesso" }, clock));
  assert.deepEqual(h.state, before);
});

test("reissue preserves public-attempt fingerprint/method/history and refuses to reuse its old key", async () => {
  const h = harness(), old = generateCheckoutCredential();
  h.state.registrations[0]!.checkoutEmail = "specific@example.invalid";
  h.state.accesses.push({ ...scope, id: "public-access", credentialHash: hash(old), source: "PUBLIC_ATTEMPT",
    requestFingerprint: "a".repeat(64), requestedPaymentMethod: "DEBIT_CARD", createdAt: time,
    expiresAt: new Date(time.getTime() + CHECKOUT_ACCESS_TTL_MS), revokedAt: null });
  const original = structuredClone(h.state.accesses[0]);
  const req = { operationId: randomUUID(), action: "REISSUE", verification };
  await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, old, req, clock), /CHECKOUT_RECOVERY_CONFLICT/);
  await recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), req, clock);
  assert.deepEqual(h.state.accesses[0], { ...original, revokedAt: time });
  assert.equal(h.state.accesses[1]!.requestedPaymentMethod, null);
});

test("revocation retries preserve one audit, remain available after financial reversal, and recheck actor privilege", async () => {
  const h = harness(); await recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock);
  h.state.registrations[0]!.paymentStatus = "REFUNDED";
  const req = { operationId: randomUUID(), reason: "Revogar acesso por atendimento" };
  const results = await Promise.all(Array.from({ length: 10 }, () => revokeCheckoutAccess(h.database, actor, scope, req, clock)));
  assert.equal(results.filter(r => !r.wasExisting).length, 1);
  assert.equal(h.state.audits.filter(a => a.action === "REVOKE").length, 1);
  assert.equal(h.state.registrations[0]!.paymentStatus, "REFUNDED");
  h.state.accounts[0]!.role = "PASTOR";
  await assert.rejects(revokeCheckoutAccess(h.database, actor, scope, req, clock), /CHECKOUT_RECOVERY_FORBIDDEN/);
});

test("known recovery uniqueness races retry with a fresh transaction but unrelated constraints do not", async () => {
  for (const constraint of ["EventCheckoutRecoveryAudit_churchId_operationId_key", "checkout_access_one_unrevoked_key"]) {
    const h = harness(); h.failCommit({ code: "P2010", meta: { code: "23505", message: constraint } });
    await recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock);
    assert.equal(h.transactions, 2); assert.equal(h.state.audits.length, 1); assert.equal(h.state.accesses.length, 1);
  }
  const h = harness(); h.failCommit({ code: "P2010", meta: { code: "23505", message: "unrelated_constraint" } });
  await assert.rejects(recoverCheckoutAccess(h.database, actor, scope, generateCheckoutCredential(), request(), clock));
  assert.equal(h.transactions, 1); assert.equal(h.state.audits.length, 0);
});
