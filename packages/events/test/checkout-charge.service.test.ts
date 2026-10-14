import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";
import { CHECKOUT_ACCESS_TTL_MS } from "../src/checkout-access.schema.ts";
import { generateCheckoutCredential } from "../src/checkout-access.service.ts";
import { createFirstCheckoutCharge, reconcileFirstCheckoutCharge,
  type CheckoutFirstChargeCommand, type CheckoutFirstChargeProvider } from "../src/checkout-charge.service.ts";

const scope = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a" };
const cpf = "52998224725";
const timeout = { timeoutMs: 1000 };
function harness() {
  const key = generateCheckoutCredential(), createdAt = new Date(Date.now() - 1000);
  let state = {
    accesses: [{ ...scope, id: "access-a", credentialHash: createHash("sha256").update(key).digest("hex"), source: "PUBLIC_ATTEMPT",
      requestFingerprint: "a".repeat(64), requestedPaymentMethod: "PIX", createdAt,
      expiresAt: new Date(createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS), revokedAt: null as Date | null }],
    graph: { ...scope, eventPaymentId: "payment-a", transactionId: "transaction-a", orderId: "order-a", amount: "100.00", provider: "ASAAS",
      providerPaymentId: null as string | null, asaasId: null as string | null, method: "PIX", registrationStatus: "PENDING",
      registrationPaymentStatus: "PENDING", waitlistedAt: null as Date | null, paymentStatus: "PENDING", transactionStatus: "ACTIVE", orderStatus: "PENDING",
      checkoutEmail: "specific@example.invalid" as string | null, name: "Participante", phone: "41999990001", linkedPersonId: null as string | null,
      linkedVisitorId: "visitor-a", personId: null as string | null, visitorId: "visitor-a" as string | null,
      platformFeePercent: 10, platformFeeAmount: "10.00", netAmount: "90.00", discountId: "discount-a", discountCode: "SPECIAL",
      checkInToken: "participant-token", confirmationEmailSentAt: null, registrationSource: "PUBLIC" },
    attempts: [] as any[]
  };
  // Protocol double: serialized transactions with rollback. It does not prove
  // PostgreSQL locks/constraints, real provider idempotency or cross-process safety.
  let tail = Promise.resolve(), transactions = 0;
  const context = new AsyncLocalStorage<number>();
  const trace: string[] = [], writes: { sql: string; values: unknown[] }[] = [], queries: { sql: string; values: unknown[] }[] = [];
  let claimFailure: unknown = null, finishFailure: unknown = null, uncertainFailure: unknown = null;
  let persistentClaimFailure = false;
  let zeroIntentWrite = false;
  let ambiguousClaim = false, ambiguousFinish = false, zeroPaymentWrite = false, duplicate = false, brokenGraph = false, missingEvent = false;
  const tx = {
    event: { async findFirst({ where }: any) {
      return !missingEvent && where.id === scope.eventId && where.churchId === scope.churchId ? { id: scope.eventId } : null;
    } },
    registration: { async findFirst({ where }: any) {
      return where.id === scope.registrationId && where.churchId === scope.churchId && where.eventId === scope.eventId ?
        { paymentId: state.graph.eventPaymentId, orderId: state.graph.orderId } : null;
    } },
    eventPayment: { async findFirst({ where }: any) {
      return where.id === state.graph.eventPaymentId && where.churchId === scope.churchId && where.eventId === scope.eventId &&
        where.orderId === state.graph.orderId ? { transactionId: state.graph.transactionId } : null;
    } },
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); queries.push({ sql, values });
      if (sql.includes("pg_advisory_xact_lock")) return [];
      if (sql.includes('FROM "EventCheckoutAccess"')) return sql.includes('"credentialHash" =') ?
        structuredClone(state.accesses.filter(a => a.credentialHash === values[0])) :
        structuredClone(state.accesses.filter(a => a.source === "PUBLIC_ATTEMPT" && a.churchId === values[0] && a.eventId === values[1] && a.registrationId === values[2]));
      if (sql.includes('FROM "EventCheckoutChargeAttempt"')) return structuredClone(state.attempts.filter(a =>
        a.churchId === values[0] && a.eventId === values[1] && a.eventPaymentId === values[2] && a.transactionId === values[3]));
      if (sql.includes('JOIN "EventPayment"')) return brokenGraph ? [] : [structuredClone(state.graph)];
      if (sql.includes('FROM "Transaction"')) return duplicate ? [{ id: "other-official-ledger" }] : [];
      if (sql.includes('FROM "Registration"') && sql.includes("FOR UPDATE")) return values[0] === scope.churchId && values[1] === scope.eventId &&
        values[2] === scope.registrationId ? [{ id: scope.registrationId, registrationSource: "PUBLIC" }] : [];
      throw Error(`Unexpected query: ${sql}`);
    },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); writes.push({ sql, values });
      if (sql.includes('INSERT INTO "EventCheckoutChargeAttempt"')) {
        if (zeroIntentWrite) { zeroIntentWrite = false; return 0; }
        if (state.attempts.length) throw { code: "P2010", meta: { code: "23505", message: "EventCheckoutChargeAttempt_eventPaymentId_key" } };
        state.attempts.push({ id: values[0], churchId: values[1], eventId: values[2], eventPaymentId: values[3], transactionId: values[4],
          requestedMethod: values[5], state: "STARTED", providerPaymentId: null, createdAt: values[6], updatedAt: values[7] }); return 1;
      }
      if (sql.includes('UPDATE "Transaction"')) { state.graph.asaasId = values[0] as string; return 1; }
      if (sql.includes('UPDATE "EventPayment"')) {
        if (zeroPaymentWrite) { zeroPaymentWrite = false; return 0; }
        state.graph.providerPaymentId = values[0] as string; return 1;
      }
      if (sql.includes('UPDATE "EventCheckoutChargeAttempt"')) {
        const attempt = state.attempts.find(a => a.id === values[4] && a.churchId === values[2] && a.eventId === values[3] &&
          a.eventPaymentId === values[5] && a.transactionId === values[6]);
        if (!attempt) return 0;
        if (sql.includes('SET "state" = \'UNCERTAIN\'')) {
          if (uncertainFailure) { const error = uncertainFailure; uncertainFailure = null; throw error; }
          if (attempt.state !== "STARTED") return 0;
          attempt.state = "UNCERTAIN";
        } else { attempt.state = "SUCCEEDED"; }
        attempt.providerPaymentId = values[0]; attempt.updatedAt = values[1]; return 1;
      }
      throw Error(`Unexpected mutation: ${sql}`);
    }
  };
  const database = { async $transaction(operation: any, options: unknown) {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    const previous = tail; let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    const index = ++transactions, snapshot = structuredClone(state), startWrites = writes.length;
    try {
      const result = await context.run(index, () => operation(tx));
      const changed = writes.slice(startWrites);
      if (changed.some(w => w.sql.includes('INSERT INTO "EventCheckoutChargeAttempt"'))) {
        if (claimFailure) { const error = claimFailure; if (!persistentClaimFailure) claimFailure = null; throw error; }
        trace.push("COMMIT:STARTED");
        if (ambiguousClaim) { ambiguousClaim = false; throw { code: "P2028", committed: true }; }
      } else if (changed.some(w => w.sql.includes('UPDATE "Transaction"'))) {
        if (finishFailure) { const error = finishFailure; finishFailure = null; throw error; }
        trace.push("COMMIT:SUCCEEDED");
        if (ambiguousFinish) { ambiguousFinish = false; throw { code: "P2028", committed: true }; }
      } else trace.push("COMMIT:READ_OR_UNCERTAIN");
      return result;
    } catch (error) {
      if (!(error && typeof error === "object" && "committed" in error && error.committed)) { state = snapshot; trace.push("ROLLBACK"); }
      throw error;
    } finally { release(); }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  const commands: CheckoutFirstChargeCommand[] = [];
  let post: CheckoutFirstChargeProvider["create"] | undefined, read: CheckoutFirstChargeProvider["read"] | undefined;
  let reads = 0;
  const receipt = () => ({ id: "provider-a", externalReference: `${scope.churchId}:payment-a:payment`, amount: 100, method: "PIX" as "PIX" | "CARD" });
  const provider: CheckoutFirstChargeProvider = {
    async create(command, signal) {
      assert.equal(context.getStore(), undefined, "provider POST must be outside transaction/retry");
      assert.equal(state.attempts[0]?.state, "STARTED"); assert.ok(trace.includes("COMMIT:STARTED"));
      assert.equal(command.attemptId, state.attempts[0].id); commands.push(structuredClone(command)); trace.push("POST");
      return post ? post(command, signal) : { ...receipt(), method: command.method === "PIX" ? "PIX" : "CARD" };
    },
    async read(id, signal) {
      assert.equal(context.getStore(), undefined); reads++; trace.push("GET");
      return read ? read(id, signal) : receipt();
    }
  };
  return { database, provider, key, commands, trace, queries, writes, receipt,
    get state() { return state; }, get transactions() { return transactions; }, get reads() { return reads; },
    post(fn: CheckoutFirstChargeProvider["create"]) { post = fn; }, read(fn: CheckoutFirstChargeProvider["read"]) { read = fn; },
    failClaim(error: unknown, persistent = false) { claimFailure = error; persistentClaimFailure = persistent; }, failFinish(error: unknown) { finishFailure = error; },
    failUncertain(error: unknown) { uncertainFailure = error; }, ambiguousClaim() { ambiguousClaim = true; }, ambiguousFinish() { ambiguousFinish = true; },
    zeroPaymentWrite() { zeroPaymentWrite = true; }, duplicate() { duplicate = true; }, breakGraph() { brokenGraph = true; },
    zeroIntentWrite() { zeroIntentWrite = true; },
    missingEvent() { missingEvent = true; } };
}

test("intent commits before the only POST; references and SUCCEEDED commit atomically without rewriting financial history", async () => {
  const h = harness(), before = structuredClone(h.state.graph);
  const result = await createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout);
  assert.equal(h.commands.length, 1); assert.ok(h.trace.indexOf("COMMIT:STARTED") < h.trace.indexOf("POST"));
  assert.equal(h.state.attempts[0].state, "SUCCEEDED"); assert.equal(h.state.attempts[0].providerPaymentId, "provider-a");
  assert.deepEqual(h.state.graph, { ...before, asaasId: "provider-a", providerPaymentId: "provider-a" });
  assert.equal(result.wasExisting, false);
  const command = h.commands[0]!; assert.equal(command.amount, 100); assert.equal(command.method, "PIX");
  assert.equal(command.customer.email, before.checkoutEmail); assert.equal(command.customer.cpf, cpf);
  for (const secret of [cpf, h.key, before.checkoutEmail!]) {
    assert.equal(JSON.stringify(h.state.attempts).includes(secret), false);
    assert.equal(JSON.stringify(h.writes).includes(secret), false);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test("concurrent callers cannot send a second POST while the committed owner is running", async () => {
  const h = harness(); let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  h.post(async () => { entered(); await gate; return h.receipt(); });
  const first = createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout);
  await started;
  const competitors = await Promise.allSettled(Array.from({ length: 20 }, () => createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout)));
  assert.ok(competitors.every(r => r.status === "rejected")); assert.equal(h.commands.length, 1); assert.equal(h.state.attempts.length, 1);
  release(); await first;
  const retries = await Promise.all(Array.from({ length: 10 }, () => createFirstCheckoutCharge(h.database, scope, h.key, {}, h.provider, timeout)));
  assert.ok(retries.every(r => r.wasExisting && r.providerPaymentId === "provider-a")); assert.equal(h.commands.length, 1);
});

test("provider timeout aborts and leaves UNCERTAIN; late result and retries never reissue", async () => {
  const h = harness(); let release!: () => void, observed: AbortSignal | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  h.post(async (_command, signal) => { observed = signal; await gate; return h.receipt(); });
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, { timeoutMs: 10 }), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  assert.equal(observed?.aborted, true); assert.equal(h.state.attempts[0].state, "UNCERTAIN");
  release(); await new Promise(resolve => setImmediate(resolve));
  for (let retry = 0; retry < 3; retry++) await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  assert.equal(h.commands.length, 1); assert.equal(h.state.graph.asaasId, null); assert.equal(h.state.graph.providerPaymentId, null);
});

test("provider errors are sanitized; failure to mark UNCERTAIN leaves durable STARTED blocking every retry", async () => {
  const h = harness(); h.post(async () => { throw Error(`secret-response:${cpf}:${h.key}`); }); h.failUncertain({ code: "P2028" });
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout), error =>
    error instanceof Error && error.message === "CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED" && !("cause" in error));
  assert.equal(h.state.attempts[0].state, "STARTED");
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  assert.equal(h.commands.length, 1);
});

test("a restarted process with STARTED cannot infer absence or perform an automatic POST", async () => {
  const h = harness(); h.state.attempts.push({ id: "crashed-attempt", ...scope, eventPaymentId: "payment-a", transactionId: "transaction-a",
    requestedMethod: "PIX", state: "STARTED", providerPaymentId: null });
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  assert.equal(h.commands.length, 0); assert.equal(h.reads, 0); assert.equal(h.state.attempts[0].state, "STARTED");
});

test("serialization/known uniqueness retries are database-only and roll back before a single POST", async () => {
  for (const failure of [{ code: "P2034" }, { code: "P2010", meta: { code: "23505", message: "EventCheckoutChargeAttempt_eventPaymentId_key" } }]) {
    const h = harness(); h.failClaim(failure);
    await createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout);
    assert.equal(h.commands.length, 1); assert.equal(h.state.attempts.length, 1); assert.ok(h.trace.includes("ROLLBACK"));
  }
  const h = harness(); h.failClaim({ code: "P2028" });
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  assert.equal(h.commands.length, 0); assert.equal(h.state.attempts.length, 0);
});

test("ambiguous claim commit performs no POST and a possibly committed STARTED cannot be retried", async () => {
  const h = harness(); h.ambiguousClaim();
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  assert.equal(h.commands.length, 0); assert.equal(h.state.attempts[0].state, "STARTED");
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout)); assert.equal(h.commands.length, 0);
});

test("finalization failure rolls back both references; valid known result is retained in UNCERTAIN for safe GET reconciliation", async () => {
  const h = harness(); h.zeroPaymentWrite();
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  assert.equal(h.state.graph.asaasId, null); assert.equal(h.state.graph.providerPaymentId, null);
  assert.equal(h.state.attempts[0].state, "UNCERTAIN"); assert.equal(h.state.attempts[0].providerPaymentId, "provider-a");
  const recovered = await reconcileFirstCheckoutCharge(h.database, scope, h.key, "provider-a", h.provider, timeout);
  assert.equal(recovered.providerPaymentId, "provider-a"); assert.equal(h.commands.length, 1); assert.equal(h.reads, 1);
  assert.equal(h.state.attempts[0].state, "SUCCEEDED"); assert.equal(h.state.graph.asaasId, "provider-a");
  await reconcileFirstCheckoutCharge(h.database, scope, h.key, "provider-a", h.provider, timeout);
  assert.equal(h.commands.length, 1); assert.equal(h.state.attempts.length, 1);
});

test("ambiguous successful finalization cannot downgrade SUCCEEDED or cause a second POST", async () => {
  const h = harness(); h.ambiguousFinish();
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  assert.equal(h.state.attempts[0].state, "SUCCEEDED"); assert.equal(h.state.graph.providerPaymentId, "provider-a");
  assert.equal((await createFirstCheckoutCharge(h.database, scope, h.key, {}, h.provider, timeout)).wasExisting, true);
  assert.equal(h.commands.length, 1);
});

test("safe reconciliation requires existing intent and matching ID/reference/method/amount; it never resets or POSTs", async () => {
  for (const change of ["id", "reference", "method", "amount", "duplicate"]) {
    const h = harness(); h.post(async () => { throw Error("unknown result"); });
    await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
    const receipt = { ...h.receipt() };
    if (change === "id") receipt.id = "other";
    if (change === "reference") receipt.externalReference = "church-other:payment-a:payment";
    if (change === "method") receipt.method = "CARD";
    if (change === "amount") receipt.amount = 101;
    if (change === "duplicate") h.duplicate();
    h.read(async () => receipt);
    await assert.rejects(reconcileFirstCheckoutCharge(h.database, scope, h.key, "provider-a", h.provider, timeout));
    assert.equal(h.state.attempts[0].state, "UNCERTAIN"); assert.equal(h.state.graph.providerPaymentId, null); assert.equal(h.commands.length, 1);
  }
  const absent = harness();
  await assert.rejects(reconcileFirstCheckoutCharge(absent.database, scope, absent.key, "provider-a", absent.provider, timeout));
  assert.equal(absent.reads, 0); assert.equal(absent.commands.length, 0);
});

test("malformed or mismatched POST receipts never attach a wrong reference or promote payment", async () => {
  for (const receipt of [{}, { ...harness().receipt(), amount: 200 }, { ...harness().receipt(), externalReference: "other-event" }]) {
    const h = harness(), before = structuredClone(h.state.graph); h.post(async () => receipt as any);
    await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
    assert.deepEqual(h.state.graph, before); assert.equal(h.state.attempts[0].state, "UNCERTAIN");
    assert.equal(h.state.attempts[0].providerPaymentId, null);
  }
});

test("credit/debit stay distinct in the durable attempt while the official method remains CARD", async () => {
  for (const method of ["CREDIT_CARD", "DEBIT_CARD"]) {
    const h = harness(); h.state.accesses[0]!.requestedPaymentMethod = method; h.state.graph.method = "CARD";
    await createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout);
    assert.equal(h.state.attempts[0].requestedMethod, method); assert.equal(h.commands[0]!.method, method); assert.equal(h.state.graph.method, "CARD");
  }
});

test("scope, private capability, original method and eligible financial graph are required before any intent/POST", async () => {
  for (const change of ["church", "event", "old-token", "revoked", "expired", "legacy", "broken", "missing-event", "paid", "waitlist", "cancelled", "method", "contact-owner", "email", "cpf"]) {
    const h = harness(), target = { ...scope }; let key = h.key, value: unknown = { cpf };
    if (change === "church") target.churchId = "other";
    if (change === "event") target.eventId = "other";
    if (change === "old-token") key = "registration.old-token";
    if (change === "revoked") h.state.accesses[0]!.revokedAt = new Date();
    if (change === "expired") { h.state.accesses[0]!.createdAt = new Date(Date.now() - CHECKOUT_ACCESS_TTL_MS - 1000);
      h.state.accesses[0]!.expiresAt = new Date(h.state.accesses[0]!.createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS); }
    if (change === "legacy") { h.state.accesses[0]!.source = "ADMIN_RECOVERY"; (h.state.accesses[0] as any).requestFingerprint = null; (h.state.accesses[0] as any).requestedPaymentMethod = null; }
    if (change === "broken") h.breakGraph();
    if (change === "missing-event") h.missingEvent();
    if (change === "paid") h.state.graph.registrationPaymentStatus = "PAID";
    if (change === "waitlist") h.state.graph.waitlistedAt = new Date();
    if (change === "cancelled") h.state.graph.registrationStatus = "CANCELLED";
    if (change === "method") h.state.graph.method = "CARD";
    if (change === "contact-owner") h.state.graph.visitorId = null;
    if (change === "email") h.state.graph.checkoutEmail = null;
    if (change === "cpf") value = {};
    await assert.rejects(createFirstCheckoutCharge(h.database, target, key, value, h.provider, timeout));
    assert.equal(h.state.attempts.length, 0); assert.equal(h.commands.length, 0);
  }
  const h = harness();
  for (const override of [{ paymentMethod: "DEBIT_CARD", cpf }, { transactionId: "other", cpf }, { amount: 1, cpf }, { email: "other@example.invalid", cpf }]) {
    await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, override, h.provider, timeout));
  }
  assert.equal(h.commands.length, 0);
});

test("existing references are reused without fabricating history; conflicting references are never replaced", async () => {
  const h = harness(); h.state.graph.providerPaymentId = "provider-a"; h.state.graph.asaasId = "provider-a";
  const reused = await createFirstCheckoutCharge(h.database, scope, h.key, {}, h.provider, timeout);
  assert.equal(reused.attemptId, null); assert.equal(reused.wasExisting, true); assert.equal(h.state.attempts.length, 0); assert.equal(h.commands.length, 0);
  h.state.graph.asaasId = "other";
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  assert.equal(h.state.graph.asaasId, "other"); assert.equal(h.commands.length, 0);
});

test("revoked/expired capability after POST cannot erase known financial evidence or grant eligibility", async () => {
  const h = harness(), before = structuredClone(h.state.graph);
  h.post(async () => { h.state.accesses[0]!.revokedAt = new Date(); return h.receipt(); });
  const result = await createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout);
  assert.equal(h.state.attempts[0].state, "SUCCEEDED");
  assert.deepEqual(h.state.graph, { ...before, providerPaymentId: "provider-a", asaasId: "provider-a" });
  assert.equal("checkInToken" in result, false); assert.equal("paymentCheckout" in result, false);
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, {}, h.provider, timeout), /CHECKOUT_ACCESS_DENIED/);
});

test("ledger/reference changes while POST is in flight do not rewrite amounts, method, snapshots or existing references", async () => {
  for (const change of ["amount", "method", "reference"]) {
    const h = harness();
    h.post(async () => {
      if (change === "amount") h.state.graph.amount = "101.00";
      if (change === "method") h.state.graph.method = "CARD";
      if (change === "reference") h.state.graph.asaasId = "other-known-reference";
      return h.receipt();
    });
    await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
    assert.equal(h.state.attempts[0].state, "UNCERTAIN"); assert.equal(h.state.attempts[0].providerPaymentId, "provider-a");
    assert.equal(h.state.graph.providerPaymentId, null);
    assert.equal(h.state.graph.asaasId, change === "reference" ? "other-known-reference" : null);
  }
});

test("serialization and specific uniqueness retry limits stop after three transactions, before any POST", async () => {
  for (const failure of [{ code: "P2034" }, { code: "P2010", meta: { code: "23505", message: "EventCheckoutChargeAttempt_transactionId_key" } }]) {
    const h = harness(); h.failClaim(failure, true);
    await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
    assert.equal(h.transactions, 3); assert.equal(h.commands.length, 0); assert.equal(h.state.attempts.length, 0);
  }
  const h = harness(); h.failClaim({ code: "P2010", meta: { code: "23505", message: "unrelated_constraint" } }, true);
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  assert.equal(h.transactions, 1); assert.equal(h.commands.length, 0);
});

test("finalization serialization retry repeats only atomic database writes, never the external POST", async () => {
  const h = harness(); h.failFinish({ code: "P2034" });
  await createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout);
  assert.equal(h.commands.length, 1); assert.equal(h.state.attempts[0].state, "SUCCEEDED");
  assert.equal(h.state.graph.asaasId, "provider-a"); assert.equal(h.state.graph.providerPaymentId, "provider-a");
  assert.equal(h.trace.filter(t => t === "ROLLBACK").length, 1);
});

test("reconciliation GET timeout preserves the blocked attempt; a later verified GET retry completes without POST", async () => {
  const h = harness(); h.post(async () => { throw Error("unknown outcome"); });
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  h.read(async () => new Promise(() => {}));
  await assert.rejects(reconcileFirstCheckoutCharge(h.database, scope, h.key, "provider-a", h.provider, { timeoutMs: 10 }));
  assert.equal(h.state.attempts[0].state, "UNCERTAIN"); assert.equal(h.state.graph.asaasId, null);
  h.read(async () => h.receipt());
  await reconcileFirstCheckoutCharge(h.database, scope, h.key, "provider-a", h.provider, timeout);
  assert.equal(h.commands.length, 1); assert.equal(h.reads, 2); assert.equal(h.state.attempts[0].state, "SUCCEEDED");
});

test("a claim INSERT that affects no row never produces an owner or external POST", async () => {
  const h = harness(); h.zeroIntentWrite();
  await assert.rejects(createFirstCheckoutCharge(h.database, scope, h.key, { cpf }, h.provider, timeout));
  assert.equal(h.state.attempts.length, 0); assert.equal(h.commands.length, 0); assert.equal(h.trace.includes("COMMIT:STARTED"), false);
});
