import assert from "node:assert/strict";
import test from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { generateCheckoutCredential } from "../src/checkout-access.service.ts";
import { CHECKOUT_ACCESS_TTL_MS } from "../src/checkout-access.schema.ts";
import { createCheckoutV2Integration, type CheckoutPaymentProvider } from "../src/checkout-v2.integration.ts";
import { prepareCheckoutV2Routes } from "../src/checkout-v2.routes.ts";
import type { CheckoutFirstChargeCommand, CheckoutFirstChargeProvider } from "../src/checkout-charge.service.ts";
import { prepareEventsApiCheckoutV2 } from "../../../apps/events-api/src/checkout-v2.prepared.ts";
import { prepareApiBrCheckoutV2 } from "../../../apps/api-br/src/checkout-v2.prepared.ts";

// No PrismaClient/buildApp/dotenv or network. An unexpected provider call fails.
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_ISOLATED_CHECKOUT_TEST"); };
const scope = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a" };
const cpf = "52998224725";
type Method = "PIX" | "CREDIT_CARD" | "DEBIT_CARD";

function harness(method: Method = "PIX") {
  const key = generateCheckoutCredential(), createdAt = new Date(Date.now() - 1000);
  let state = {
    access: { ...scope, id: "access-a", credentialHash: createHash("sha256").update(key).digest("hex"), source: "PUBLIC_ATTEMPT",
      requestFingerprint: "a".repeat(64), requestedPaymentMethod: method as string | null, createdAt,
      expiresAt: new Date(createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS), revokedAt: null as Date | null },
    graph: { ...scope, eventPaymentId: "payment-a", transactionId: "transaction-a", orderId: "order-a", amount: "100.00",
      provider: "ASAAS", providerPaymentId: null as string | null, asaasId: null as string | null,
      method: method === "PIX" ? "PIX" : "CARD", registrationStatus: "PENDING", registrationPaymentStatus: "PENDING",
      paymentStatus: "PENDING", transactionStatus: "ACTIVE", orderStatus: "PENDING", waitlistedAt: null as Date | null,
      checkoutEmail: "local@example.invalid", name: "Participante", phone: "41999990001", linkedPersonId: null,
      linkedVisitorId: "visitor-a", personId: null, visitorId: "visitor-a", platformFeePercent: 10,
      platformFeeAmount: "10.00", netAmount: "90.00", discountCode: "SPECIAL", checkInToken: "private-participant-token",
      confirmationEmailSentAt: null, registrationSource: "PUBLIC" },
    attempts: [] as any[]
  };
  const context = new AsyncLocalStorage<boolean>(), queries: string[] = [], writes: string[] = [], trace: string[] = [];
  let tail = Promise.resolve(), brokenGraph = false, failFinish = false, ambiguousFinish = false;
  const registration = () => ({ ...state.graph, id: scope.registrationId, status: state.graph.registrationStatus,
    paymentStatus: state.graph.registrationPaymentStatus, paymentId: state.graph.eventPaymentId, confirmedAt: null,
    event: { id: scope.eventId, title: "Evento", date: createdAt, slug: "event-slug", publicSlug: "public-slug", isPaid: true,
      church: { name: "Igreja", slug: "church-slug" } } });
  const tx = {
    event: { async findFirst({ where }: any) { return { id: where.id ?? scope.eventId,
      churchId: where.id && where.id !== scope.eventId ? "other-church" : scope.churchId }; } },
    registration: { async findFirst({ where }: any) { return where.id === scope.registrationId && where.churchId === scope.churchId &&
      where.eventId === scope.eventId ? structuredClone(registration()) : null; } },
    eventPayment: { async findFirst({ where }: any) { return where.id === state.graph.eventPaymentId && where.churchId === scope.churchId &&
      where.eventId === scope.eventId && where.orderId === state.graph.orderId ? { transactionId: state.graph.transactionId } : null; } },
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); queries.push(sql);
      if (sql.includes("pg_advisory_xact_lock")) return [];
      if (sql.includes('FROM "EventCheckoutAccess"')) return structuredClone(sql.includes('"credentialHash" =') ?
        state.access.credentialHash === values[0] ? [state.access] : [] :
        state.access.source === "PUBLIC_ATTEMPT" ? [state.access] : []);
      if (sql.includes('FROM "EventCheckoutChargeAttempt"')) return structuredClone(state.attempts);
      if (sql.includes('JOIN "EventPayment"')) {
        if (brokenGraph) return [];
        if (sql.includes('AS "paymentId"')) {
          const a = state.attempts[0];
          return [{ ...state.graph, paymentId: state.graph.eventPaymentId, requestedMethod: a?.requestedMethod ?? state.access.requestedPaymentMethod,
            initialMethod: state.access.source === "PUBLIC_ATTEMPT" ? state.access.requestedPaymentMethod : null,
            attemptState: a?.state ?? null, attemptReference: a?.providerPaymentId ?? null }];
        }
        return [structuredClone(state.graph)];
      }
      if (sql.includes('FROM "Transaction"')) return [];
      if (sql.includes('FROM "Registration"') && sql.includes("FOR UPDATE")) return values[0] === scope.churchId &&
        values[1] === scope.eventId && values[2] === scope.registrationId ? [registration()] : [];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); writes.push(sql);
      if (sql.includes('INSERT INTO "EventCheckoutChargeAttempt"')) {
        assert.equal(state.attempts.length, 0);
        state.attempts.push({ id: values[0], churchId: values[1], eventId: values[2], eventPaymentId: values[3], transactionId: values[4],
          requestedMethod: values[5], state: "STARTED", providerPaymentId: null }); return 1;
      }
      if (sql.includes('UPDATE "Transaction"')) { state.graph.asaasId = values[0] as string; return 1; }
      if (sql.includes('UPDATE "EventPayment"')) { state.graph.providerPaymentId = values[0] as string; return 1; }
      if (sql.includes('UPDATE "EventCheckoutChargeAttempt"')) {
        const a = state.attempts[0]; assert.ok(a);
        a.state = sql.includes("'UNCERTAIN'") && !sql.includes("'SUCCEEDED'") ? "UNCERTAIN" : "SUCCEEDED";
        a.providerPaymentId = values[0]; return 1;
      }
      throw new Error(`Unexpected mutation: ${sql}`);
    }
  };
  const prisma = { ...tx, async $transaction(operation: any, options: unknown) {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    const previous = tail; let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    const before = structuredClone(state), start = writes.length;
    try {
      const result = await context.run(true, () => operation(tx));
      const changed = writes.slice(start);
      if (changed.some(sql => sql.includes('UPDATE "Transaction"'))) {
        if (failFinish) { failFinish = false; throw new Error("Controlled finish rollback"); }
        trace.push("COMMIT:SUCCEEDED");
        if (ambiguousFinish) { ambiguousFinish = false; throw { committed: true }; }
      } else if (changed.some(sql => sql.includes("INSERT"))) trace.push("COMMIT:STARTED");
      return result;
    } catch (error) {
      if (!(error && typeof error === "object" && "committed" in error)) state = before;
      throw error;
    } finally { release(); }
  } } as unknown as PrismaClient;
  const commands: CheckoutFirstChargeCommand[] = [];
  let onCreate: (() => void | Promise<void>) | undefined, onRead: (() => void) | undefined, failRead = false, failQr = false;
  let receipt = { id: "provider-a", externalReference: "church-a:payment-a:payment", amount: 100,
    method: method === "PIX" ? "PIX" as const : "CARD" as const };
  let readCalls = 0, qrCalls = 0, reconcileReads = 0;
  let payment = { ...receipt, status: "PENDING", redirectUrl: "https://payments.example.invalid/invoice" };
  const firstCharge: CheckoutFirstChargeProvider = {
    async create(command) {
      assert.equal(context.getStore(), undefined, "POST must be outside transaction/retry");
      assert.equal(state.attempts[0]?.state, "STARTED"); assert.ok(trace.includes("COMMIT:STARTED"));
      commands.push(structuredClone(command)); await onCreate?.(); return receipt;
    },
    async read() { assert.equal(context.getStore(), undefined); reconcileReads++; return receipt; }
  };
  const provider: CheckoutPaymentProvider = {
    async read() { assert.equal(context.getStore(), undefined); readCalls++; onRead?.();
      if (failRead) throw new Error("private provider error"); return payment; },
    async pix() { qrCalls++; if (failQr) throw new Error("private QR error");
      return { encodedImage: "qr", payload: "copy-paste", expirationDate: "future", privateField: "never disclose" }; }
  };
  const integration = createCheckoutV2Integration(prisma, provider, firstCharge);
  return { key, prisma, provider, firstCharge, integration, commands, trace, writes, queries,
    get state() { return state; }, get readCalls() { return readCalls; }, get qrCalls() { return qrCalls; },
    get reconcileReads() { return reconcileReads; },
    onCreate(fn: () => void | Promise<void>) { onCreate = fn; }, onRead(fn: () => void) { onRead = fn; },
    receipt(value: typeof receipt) { receipt = value; }, payment(value: Partial<typeof payment>) { payment = { ...payment, ...value }; },
    failRead() { failRead = true; }, failQr(value = true) { failQr = value; }, breakGraph() { brokenGraph = true; },
    failFinish() { failFinish = true; }, ambiguousFinish() { ambiguousFinish = true; }
  };
}

test("prepared integration creates PIX/credit/debit through the guard once, preserves snapshots and reuses references", async () => {
  for (const method of ["PIX", "CREDIT_CARD", "DEBIT_CARD"] as const) {
    const h = harness(method), before = structuredClone(h.state.graph), expiresAt = h.state.access.expiresAt;
    const first = await h.integration.resume(scope, h.key, { cpf });
    const retry = await h.integration.resume(scope, h.key, {});
    assert.equal(first.paymentCheckout?.method, method); assert.deepEqual(retry, first);
    assert.equal(first.checkInToken, null); assert.equal(h.commands.length, 1);
    assert.equal(h.commands[0]!.method, method); assert.equal(h.state.attempts[0].requestedMethod, method);
    assert.deepEqual(h.state.graph, { ...before, providerPaymentId: "provider-a", asaasId: "provider-a" });
    assert.deepEqual(h.state.access.expiresAt, expiresAt);
    assert.equal(h.state.attempts[0].state, "SUCCEEDED");
    for (const secret of ["provider-a", cpf, "local@example.invalid", "privateField", "checkoutToken", "attemptId"]) {
      assert.equal(JSON.stringify(first).includes(secret), false);
    }
  }
});

test("concurrent prepared resume calls share one committed intent and one POST", async () => {
  const h = harness(); let release!: () => void, entered!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  h.onCreate(async () => { entered(); await pending; });
  const owner = h.integration.resume(scope, h.key, { cpf }); await started;
  const competitors = await Promise.allSettled(Array.from({ length: 8 }, () => h.integration.resume(scope, h.key, { cpf })));
  assert.ok(competitors.every(r => r.status === "rejected" && /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/.test(String(r.reason))));
  assert.equal(h.commands.length, 1); release(); await owner;
  await h.integration.resume(scope, h.key, {}); assert.equal(h.commands.length, 1);
});

test("lost response remains UNCERTAIN across retries; explicit matching GET reconciliation completes the same intent", async () => {
  const h = harness(), before = structuredClone(h.state.graph);
  h.onCreate(() => { throw new Error("Controlled transport timeout with private data"); });
  await assert.rejects(h.integration.resume(scope, h.key, { cpf }), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  assert.equal(h.state.attempts[0].state, "UNCERTAIN"); const id = h.state.attempts[0].id;
  for (let i = 0; i < 3; i++) await assert.rejects(h.integration.resume(scope, h.key, { cpf }), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  await assert.rejects(h.integration.reconcile(scope, h.key, "wrong-id"), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
  assert.equal(h.state.attempts[0].state, "UNCERTAIN");
  const result = await h.integration.reconcile(scope, h.key, "provider-a");
  assert.equal(result.checkInToken, null); assert.equal("providerPaymentId" in result, false);
  assert.equal(h.state.attempts[0].id, id); assert.equal(h.state.attempts[0].state, "SUCCEEDED");
  assert.deepEqual(h.state.graph, { ...before, providerPaymentId: "provider-a", asaasId: "provider-a" });
  await h.integration.resume(scope, h.key, {}); assert.equal(h.commands.length, 1); assert.equal(h.reconcileReads, 2);
});

test("QR failure, finish rollback and ambiguous finish never cause a second POST", async () => {
  for (const failure of ["qr", "rollback", "ambiguous"]) {
    const h = harness();
    if (failure === "qr") h.failQr();
    if (failure === "rollback") h.failFinish();
    if (failure === "ambiguous") h.ambiguousFinish();
    await assert.rejects(h.integration.resume(scope, h.key, { cpf }),
      failure === "qr" ? /PAYMENT_CHECKOUT_FAILED/ : /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
    if (failure === "rollback") await h.integration.reconcile(scope, h.key, "provider-a");
    h.failQr(false); await h.integration.resume(scope, h.key, {});
    assert.equal(h.commands.length, 1); assert.equal(h.state.attempts[0].state, "SUCCEEDED");
  }
});

test("legacy CARD ambiguity and legacy missing references never create a charge or invent a method", async () => {
  for (const method of ["PIX", "CREDIT_CARD"] as const) {
    const h = harness(method); h.state.access.source = "ADMIN_RECOVERY";
    h.state.access.requestFingerprint = null as any; h.state.access.requestedPaymentMethod = null;
    await assert.rejects(h.integration.resume(scope, h.key, { cpf }), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
    if (method !== "PIX") {
      h.state.graph.providerPaymentId = "provider-a"; h.state.graph.asaasId = "provider-a";
      await assert.rejects(h.integration.resume(scope, h.key, {}), /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
    }
    assert.equal(h.commands.length, 0); assert.equal(h.readCalls, 0); assert.equal(h.writes.length, 0);
  }
});

test("scope, revocation, expiry, invalid overrides and broken graph block before POST", async () => {
  for (const failure of ["scope", "revoked", "expired", "override", "graph", "cpf"]) {
    const h = harness();
    if (failure === "revoked") h.state.access.revokedAt = new Date();
    if (failure === "expired") { h.state.access.createdAt = new Date(Date.now() - CHECKOUT_ACCESS_TTL_MS - 1000);
      h.state.access.expiresAt = new Date(h.state.access.createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS); }
    if (failure === "graph") h.breakGraph();
    await assert.rejects(h.integration.resume(failure === "scope" ? { ...scope, churchId: "other" } : scope, h.key,
      failure === "override" ? { cpf, providerPaymentId: "forged", paymentMethod: "DEBIT_CARD" } : failure === "cpf" ? {} : { cpf }));
    assert.equal(h.commands.length, 0); assert.equal(h.writes.length, 0);
  }
});

test("revalidation after POST/GET suppresses expired/revoked access and stale financial checkout", async () => {
  for (const stage of ["create", "read"]) for (const change of ["revoked", "expired", "paid", "cancelled"]) {
    const h = harness();
    const mutate = () => {
      if (change === "revoked") h.state.access.revokedAt = new Date();
      if (change === "expired") { h.state.access.createdAt = new Date(Date.now() - CHECKOUT_ACCESS_TTL_MS - 1000);
        h.state.access.expiresAt = new Date(h.state.access.createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS); }
      if (change === "paid") { h.state.graph.registrationStatus = "CONFIRMED"; h.state.graph.registrationPaymentStatus = "PAID"; }
      if (change === "cancelled") h.state.graph.registrationStatus = "CANCELLED";
    };
    if (stage === "create") h.onCreate(mutate); else h.onRead(mutate);
    const result = h.integration.resume(scope, h.key, { cpf });
    if (change === "revoked" || change === "expired") await assert.rejects(result, /CHECKOUT_ACCESS_DENIED/);
    else assert.equal("paymentCheckout" in await result, false);
    assert.equal(h.commands.length, 1); assert.equal(h.state.attempts[0].state, "SUCCEEDED");
  }
});

test("free, paid, cancelled and waitlisted registrations do not start payment", async () => {
  for (const kind of ["free", "paid", "cancelled", "waitlisted"]) {
    const h = harness();
    if (kind === "free") h.state.graph.registrationPaymentStatus = "NOT_REQUIRED";
    if (kind === "paid") h.state.graph.registrationPaymentStatus = "PAID";
    if (kind === "cancelled") h.state.graph.registrationStatus = "CANCELLED";
    if (kind === "waitlisted") h.state.graph.waitlistedAt = new Date();
    await h.integration.resume(scope, h.key, {});
    assert.equal(h.commands.length, 0); assert.equal(h.readCalls, 0); assert.equal(h.writes.length, 0);
  }
});

test("reconciliation rejects wrong scope/expired keys/mismatched evidence and never issues a POST", async () => {
  for (const mismatch of ["reference", "amount", "method", "scope", "expired", "no-intent"]) {
    const h = harness(); h.onCreate(() => { throw new Error("response lost"); });
    if (mismatch !== "no-intent") await assert.rejects(h.integration.resume(scope, h.key, { cpf }));
    const posts = h.commands.length;
    if (mismatch === "reference") h.receipt({ id: "provider-a", externalReference: "other:payment:payment", amount: 100, method: "PIX" });
    if (mismatch === "amount") h.receipt({ id: "provider-a", externalReference: "church-a:payment-a:payment", amount: 101, method: "PIX" });
    if (mismatch === "method") h.receipt({ id: "provider-a", externalReference: "church-a:payment-a:payment", amount: 100, method: "CARD" });
    if (mismatch === "expired") {
      h.state.access.createdAt = new Date(Date.now() - CHECKOUT_ACCESS_TTL_MS - 1000);
      h.state.access.expiresAt = new Date(h.state.access.createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS);
    }
    await assert.rejects(h.integration.reconcile(mismatch === "scope" ? { ...scope, eventId: "other" } : scope, h.key, "provider-a"));
    assert.equal(h.commands.length, posts); assert.equal(h.state.graph.providerPaymentId, null);
  }
});

test("both public identities map guard/provider errors safely and reject public reconciliation IDs", async () => {
  for (const base of ["/public/events/event-a", "/public/churches/church-slug/events/event-slug"]) {
    for (const failure of ["cpf", "uncertain", "read", "url", "unsupported", "override"]) {
      const h = harness("CREDIT_CARD"), app = Fastify();
      if (failure === "uncertain") h.onCreate(() => { throw new Error(`private ${cpf} ${h.key}`); });
      if (failure === "read") h.failRead();
      if (failure === "url") h.payment({ redirectUrl: "not a URL" });
      if (failure === "unsupported") h.state.graph.provider = "OTHER";
      for (const route of prepareCheckoutV2Routes(h.prisma, h.provider, h.firstCharge)) app.route(route);
      try {
        const response = await app.inject({ method: "POST", url: `${base}/checkout/resume`, headers: { "x-event-checkout-key": h.key },
          payload: failure === "cpf" ? {} : failure === "override" ? { cpf, knownProviderId: "forged" } : { cpf } });
        assert.equal(response.statusCode, failure === "cpf" || failure === "override" ? 400 : failure === "uncertain" ? 409 : 502);
        assert.equal(response.headers["cache-control"], "no-store");
        assert.equal(response.body.includes(cpf), false); assert.equal(response.body.includes(h.key), false);
        assert.equal(response.body.includes("private"), false);
        assert.equal(app.hasRoute({ method: "POST", url: `${base}/checkout/reconcile` }), false);
      } finally { await app.close(); }
    }
  }
});

test("both dormant server compositions use the actual Asaas adapter through the guard with mocked transport only", async t => {
  for (const prepare of [prepareEventsApiCheckoutV2, prepareApiBrCheckoutV2]) for (const method of ["PIX", "CREDIT_CARD", "DEBIT_CARD"] as const) {
    const h = harness(method), app = Fastify(); const calls: { url: string; init: RequestInit | undefined }[] = [];
    const billingType = method === "PIX" ? "PIX" : "CREDIT_CARD";
    const routes = prepare(h.prisma); assert.equal(calls.length, 0); assert.equal(h.writes.length, 0); assert.equal(routes.length, 8);
    const mock = t.mock.method(globalThis, "fetch", async (input: unknown, init: RequestInit | undefined) => {
      assert.equal((init?.headers as Record<string, string>).access_token, "isolated-checkout-test-key");
      const url = String(input); assert.ok(url.startsWith("https://api-sandbox.asaas.com/v3/")); calls.push({ url, init });
      let result: unknown;
      if (init?.method === "POST") {
        assert.equal(h.state.attempts[0]?.state, "STARTED"); assert.ok(h.trace.includes("COMMIT:STARTED"));
        const body = JSON.parse(String(init.body));
        if (url.endsWith("/customers")) { assert.equal(body.email, "local@example.invalid"); result = { id: "customer-a" }; }
        else { assert.ok(url.endsWith("/payments")); assert.equal(body.billingType, billingType);
          result = { id: "provider-a", externalReference: "church-a:payment-a:payment", value: 100, billingType }; }
      } else if (url.endsWith("/payments/provider-a/pixQrCode")) {
        result = { encodedImage: "qr", payload: "copy-paste", expirationDate: "future" };
      } else {
        assert.ok(url.endsWith("/payments/provider-a"));
        result = { id: "provider-a", value: 100, billingType, status: "PENDING", invoiceUrl: "https://payments.example.invalid/invoice" };
      }
      return new Response(JSON.stringify(result), { status: 200 });
    });
    try {
      for (const route of routes) app.route(route);
      for (const base of ["/public/events/event-a", "/public/churches/church-slug/events/event-slug"]) {
        const response = await app.inject({ method: "POST", url: `${base}/checkout/resume`, headers: { "x-event-checkout-key": h.key }, payload: { cpf } });
        assert.equal(response.statusCode, 200); assert.equal(response.json().paymentCheckout.method, method);
        assert.equal(response.json().checkInToken, null);
      }
      assert.equal(calls.filter(c => c.init?.method === "POST").length, 2); // one customer + one payment
      const headers = calls.slice(0, 2).map(c => c.init?.headers as Record<string, string>);
      assert.equal(headers[0]!["Asaas-Idempotency-Key"], `${headers[1]!["Asaas-Idempotency-Key"]}:customer`);
      assert.equal(h.state.attempts[0].requestedMethod, method);
    } finally { mock.mock.restore(); await app.close(); }
  }
});
