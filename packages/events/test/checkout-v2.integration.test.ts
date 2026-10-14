import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PrismaClient, Prisma } from "@prisma/client";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { CHECKOUT_ACCESS_TTL_MS } from "../src/checkout-access.schema.ts";
import { generateCheckoutCredential } from "../src/checkout-access.service.ts";
import { createCheckoutV2Integration, checkoutKeyFromHeaders, type CheckoutPaymentProvider } from "../src/checkout-v2.integration.ts";
import { prepareCheckoutV2Routes, assertNoLegacyCheckoutRoutes, CHECKOUT_V2_LOG_REDACTIONS, CHECKOUT_V2_ALLOWED_HEADERS } from "../src/checkout-v2.routes.ts";
import { createCheckoutRegistrationFactory, createPublicRegistration } from "../src/event.service.ts";

const scope = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a" };
const body = { name: "Participante", phone: "41999990001", email: "person@example.invalid", paymentMethod: "DEBIT_CARD" as const,
  ticketId: "ticket-a", ticketBatchId: "batch-a", answers: [] };

function harness() {
  const key = generateCheckoutCredential(), createdAt = new Date(Date.now() - 1000);
  const access = { ...scope, id: "access-a", credentialHash: createHash("sha256").update(key).digest("hex"),
    source: "PUBLIC_ATTEMPT", requestFingerprint: "b".repeat(64), requestedPaymentMethod: "PIX", createdAt,
    expiresAt: new Date(createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS), revokedAt: null as Date | null };
  const registration = { ...scope, id: scope.registrationId, status: "PENDING", paymentStatus: "PENDING", paymentId: "payment-a",
    registrationSource: "PUBLIC", waitlistedAt: null as Date | null, confirmedAt: null as Date | null,
    checkoutEmail: "specific@example.invalid", checkInToken: "participant-token", personId: null, visitorId: null,
    email: "private-contact@example.invalid", orderId: "order-a", formAnswers: [{ value: "private-answer" }],
    event: { id: scope.eventId, title: "Evento", date: createdAt, slug: "event-slug", publicSlug: "public-slug", isPaid: true,
      church: { slug: "church-slug", name: "Igreja" } } };
  let binding: any = { paymentId: "payment-a", transactionId: "transaction-a", orderId: "order-a", provider: "ASAAS",
    providerPaymentId: "provider-a", asaasId: "provider-a", amount: "100", method: "PIX", requestedMethod: "PIX",
    initialMethod: "PIX", attemptReference: null, attemptState: null };
  let account = { id: "admin-a", churchId: scope.churchId, role: "SUPER_ADMIN", status: "ACTIVE", person: null };
  const audits: any[] = [], queries: string[] = [], mutations: { sql: string; values: unknown[] }[] = [];
  let reads = 0, providerReads = 0, qrReads = 0;
  let providerPayment = { id: "provider-a", method: "PIX" as "PIX" | "CARD", amount: 100, status: "PENDING", redirectUrl: null as string | null };
  let onProviderRead: (() => void) | undefined;
  const tx = {
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); queries.push(sql);
      if (sql.includes("pg_advisory_xact_lock")) return [];
      if (sql.includes('FROM "UserAccount"')) return account.id === values[1] && account.churchId === values[0] &&
        account.role === "SUPER_ADMIN" && account.status === "ACTIVE" ? [{ id: account.id }] : [];
      if (sql.includes('FROM "EventCheckoutRecoveryAudit"')) return audits.filter(a => a.churchId === values[0] && a.operationId === values[1]);
      if (sql.includes('FROM "EventCheckoutAccess"')) return sql.includes('"credentialHash" =') ?
        access.credentialHash === values[0] ? [access] : [] : [access];
      if (sql.includes('JOIN "EventPayment"')) return binding ? [binding] : [];
      if (sql.includes('FROM "Registration" r')) return [{ personEmail: null, visitorEmail: null,
        personId: null, visitorId: null, linkedPersonId: null, linkedVisitorId: null }];
      if (sql.includes('FROM "Registration"') && sql.includes("FOR UPDATE")) return values[0] === scope.churchId &&
        values[1] === scope.eventId && values[2] === scope.registrationId ? [registration] : [];
      throw Error(`Unexpected SQL ${sql}`);
    },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      mutations.push({ sql: strings.join("?"), values }); return 1;
    },
    registration: { async findFirst({ where }: any) {
      reads++; return where.id === registration.id && where.churchId === scope.churchId && where.eventId === scope.eventId ? registration : null;
    } },
    event: { async findFirst({ where }: any) {
      reads++;
      if (where.id && where.id !== scope.eventId) return { id: where.id, churchId: "church-other" };
      return { id: scope.eventId, churchId: scope.churchId };
    } }
  };
  const prisma = { ...tx, userAccount: { async findUnique() { return account; } },
    church: { async findUnique() { return { id: scope.churchId, status: "ACTIVE", trialEndsAt: null }; } },
    async $transaction(operation: any) { return operation(tx); }
  } as unknown as PrismaClient;
  const provider: CheckoutPaymentProvider = {
    async read() { providerReads++; onProviderRead?.(); return providerPayment; },
    async pix() { qrReads++; return { encodedImage: "qr", payload: "pix", expirationDate: "future" }; }
  };
  return { key, access, registration, prisma, provider, queries, mutations, audits,
    get binding() { return binding; }, set binding(value) { binding = value; },
    get account() { return account; }, set account(value) { account = value; },
    get providerPayment() { return providerPayment; }, set providerPayment(value) { providerPayment = value; },
    get providerReads() { return providerReads; }, get qrReads() { return qrReads; }, get reads() { return reads; },
    onProviderRead(callback: () => void) { onProviderRead = callback; } };
}

test("strict private header rejects contacts, old tokens, duplicates and missing keys", () => {
  const key = generateCheckoutCredential(); assert.equal(checkoutKeyFromHeaders({ "x-event-checkout-key": key }), key);
  for (const value of [undefined, [key, key], "registration.old-token", "person@example.invalid", `${key},${key}`]) {
    assert.throws(() => checkoutKeyFromHeaders({ "x-event-checkout-key": value }), /CHECKOUT_ACCESS_DENIED/);
  }
});

test("status allowlist exposes a participant token only after backend eligibility, never legacy tokens/PII", async () => {
  const h = harness(), integration = createCheckoutV2Integration(h.prisma, h.provider);
  const pending = await integration.status(scope, h.key, {});
  assert.equal(pending.checkInToken, null);
  for (const key of ["checkoutToken", "email", "paymentId", "orderId", "formAnswers", "checkoutEmail", "credentialHash"]) assert.equal(key in pending, false);
  h.registration.paymentStatus = "PAID"; h.registration.status = "CONFIRMED";
  assert.equal((await integration.status(scope, h.key, {})).checkInToken, h.registration.checkInToken);
  h.registration.waitlistedAt = new Date(); assert.equal((await integration.status(scope, h.key, {})).checkInToken, null);
  assert.equal(h.providerReads, 0); assert.equal(h.mutations.length, 0);
});

test("status/resume reject contact authorization and all financial/method/registration overrides", async () => {
  const h = harness(), integration = createCheckoutV2Integration(h.prisma, h.provider);
  for (const value of [{ name: "Participante" }, { phone: body.phone }, { email: body.email }, { checkoutToken: "old" },
    { registrationId: "other" }, { paymentMethod: "DEBIT_CARD" }, { paymentId: "other" }, { amount: 1 }]) {
    await assert.rejects(integration.status(scope, h.key, value)); await assert.rejects(integration.resume(scope, h.key, value));
  }
  assert.equal(h.providerReads, 0); assert.equal(h.mutations.length, 0);
});

test("known PIX/card charges resume from persisted scope/graph without creation or mutation", async () => {
  for (const method of ["PIX", "CREDIT_CARD", "DEBIT_CARD"]) {
    const h = harness(); h.binding.requestedMethod = method; h.binding.initialMethod = method;
    const originalPix = h.provider.pix;
    h.provider.pix = async id => ({ ...await originalPix(id), privateProviderField: "must-not-escape" });
    h.binding.method = method === "PIX" ? "PIX" : "CARD";
    h.providerPayment.method = method === "PIX" ? "PIX" : "CARD"; h.providerPayment.redirectUrl = "https://payments.example.invalid/invoice";
    const value = await createCheckoutV2Integration(h.prisma, h.provider).resume(scope, h.key, {});
    assert.equal(value.paymentCheckout?.method, method); assert.equal(value.checkInToken, null);
    assert.equal(JSON.stringify(value).includes("privateProviderField"), false);
    assert.equal(h.mutations.length, 0); assert.equal(h.providerReads, 1);
    assert.ok(h.queries.some(sql => sql.includes('p."amount" = t."amount"') && sql.includes('p."amount" = o."totalAmount"')));
  }
});

test("new/uncertain/legacy charges and reference/method/amount disagreements fail closed", async () => {
  for (const change of ["new", "started", "uncertain", "reference", "amount", "legacy-card", "succeeded-reference", "method", "initial-method", "broken-graph"]) {
    const h = harness();
    if (change === "new") { h.binding.providerPaymentId = null; h.binding.asaasId = null; }
    if (change === "started") h.binding.attemptState = "STARTED";
    if (change === "uncertain") h.binding.attemptState = "UNCERTAIN";
    if (change === "reference") h.binding.asaasId = "other";
    if (change === "amount") h.providerPayment.amount = 101;
    if (change === "legacy-card") { h.binding.method = "CARD"; h.binding.requestedMethod = null; h.binding.initialMethod = null; }
    if (change === "succeeded-reference") { h.binding.attemptState = "SUCCEEDED"; h.binding.attemptReference = "other"; }
    if (change === "method") h.providerPayment.method = "CARD";
    if (change === "initial-method") h.binding.initialMethod = "DEBIT_CARD";
    if (change === "broken-graph") h.binding = null;
    await assert.rejects(createCheckoutV2Integration(h.prisma, h.provider).resume(scope, h.key, {}),
      change === "new" ? /CHECKOUT_CHARGE_CREATION_NOT_PREPARED/ : /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
    assert.equal(h.mutations.length, 0); assert.equal(h.qrReads, 0);
  }
});

test("revocation/expiry and financial changes during provider reads suppress stale checkout", async () => {
  for (const change of ["revoke", "expire", "paid", "cancel", "reference"]) {
    const h = harness(); h.onProviderRead(() => {
      if (change === "revoke") h.access.revokedAt = new Date();
      if (change === "expire") { h.access.createdAt = new Date(Date.now() - CHECKOUT_ACCESS_TTL_MS - 1); h.access.expiresAt = new Date(h.access.createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS); }
      if (change === "paid") { h.registration.paymentStatus = "PAID"; h.registration.status = "CONFIRMED"; }
      if (change === "cancel") h.registration.status = "CANCELLED";
      if (change === "reference") { h.binding.providerPaymentId = "other"; h.binding.asaasId = "other"; }
    });
    const call = createCheckoutV2Integration(h.prisma, h.provider).resume(scope, h.key, {});
    if (["revoke", "expire"].includes(change)) await assert.rejects(call, /CHECKOUT_ACCESS_DENIED/);
    else if (change === "reference") await assert.rejects(call, /CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED/);
    else assert.equal("paymentCheckout" in await call, false);
    assert.equal(h.mutations.length, 0);
  }
});

test("read-only provider confirmation does not grant or write financial/participant status", async () => {
  const h = harness(); h.providerPayment.status = "CONFIRMED";
  const value = await createCheckoutV2Integration(h.prisma, h.provider).resume(scope, h.key, {});
  assert.equal(value.paymentStatus, "PENDING"); assert.equal(value.checkInToken, null);
  assert.equal(h.mutations.length, 0); assert.equal(h.qrReads, 0);
});

test("prepared public route descriptors cover both identities, fail on old access and scope crossing", async () => {
  const h = harness(), app = Fastify(); assert.equal(h.reads, 0);
  const routes = prepareCheckoutV2Routes(h.prisma, h.provider);
  assert.equal(routes.length, 8); assert.equal(h.reads, 0); assert.equal(h.mutations.length, 0);
  assertNoLegacyCheckoutRoutes(app);
  for (const route of routes) app.route(route);
  try {
    for (const base of ["/public/events/event-a", "/public/churches/church-slug/events/event-slug"]) {
      const response = await app.inject({ method: "POST", url: `${base}/checkout/status`, headers: { "x-event-checkout-key": h.key }, payload: {} });
      assert.equal(response.statusCode, 200); assert.equal(response.json().checkInToken, null);
      assert.equal(response.headers["cache-control"], "no-store");
      const old = await app.inject({ method: "POST", url: `${base}/checkout/status`, payload: { checkoutToken: "old.token" } });
      assert.equal(old.statusCode, 403);
    }
    const crossed = await app.inject({ method: "POST", url: "/public/events/other/checkout/status", headers: { "x-event-checkout-key": h.key }, payload: {} });
    assert.equal(crossed.statusCode, 403); assert.equal(h.mutations.length, 0);
  } finally { await app.close(); }
});

test("exclusive replacement gate rejects legacy entrypoints without changing their behavior", async () => {
  for (const url of ["/public/events/:eventId/register", "/public/churches/:churchSlug/events/:eventSlug/register",
    "/public/churches/:churchSlug/events/:eventSlug/checkout/status"]) {
    const app = Fastify(); app.post(url, async () => ({ legacy: true }));
    assert.throws(() => assertNoLegacyCheckoutRoutes(app), /CHECKOUT_V2_REQUIRES_EXCLUSIVE_REPLACEMENT/);
    await app.close();
  }
  assert.ok(CHECKOUT_V2_LOG_REDACTIONS.includes('req.headers["x-event-checkout-key"]'));
  assert.ok(CHECKOUT_V2_ALLOWED_HEADERS.includes("X-Event-Checkout-Key"));
});

test("administrative descriptors require JWT/current SUPER_ADMIN and derive scope/actor only from middleware", async () => {
  const h = harness(), app = Fastify(); await app.register(jwt, { secret: "isolated-checkout-jwt-secret-for-tests-only" });
  for (const route of prepareCheckoutV2Routes(h.prisma, h.provider)) app.route(route);
  const url = "/api/events/event-a/registrations/registration-a/checkout/recovery";
  const payload = { operationId: randomUUID(), action: "REISSUE", verification: { ownershipVerified: true,
    verificationMethod: "Atendimento humano", evidenceReference: "case-123", verifiedChannelReference: "channel-123" } };
  try {
    assert.equal((await app.inject({ method: "POST", url, payload })).statusCode, 401);
    const token = app.jwt.sign({ userId: "admin-a", churchId: scope.churchId, role: "SUPER_ADMIN" });
    h.account.role = "PASTOR";
    assert.equal((await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${token}`, "x-event-checkout-key": generateCheckoutCredential() }, payload })).statusCode, 403);
    assert.equal(h.mutations.length, 0);
    h.account.role = "SUPER_ADMIN";
    const result = await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${token}`, "x-event-checkout-key": generateCheckoutCredential() }, payload });
    assert.equal(result.statusCode, 200);
    assert.ok(h.mutations.some(m => m.sql.includes('INSERT INTO "EventCheckoutRecoveryAudit"') && m.values[1] === scope.churchId && m.values[8] === "admin-a"));
    const forged = await app.inject({ method: "POST", url, headers: { authorization: `Bearer ${token}`, "x-event-checkout-key": generateCheckoutCredential() }, payload: { ...payload, churchId: "other", actorUserId: "other" } });
    assert.equal(forged.statusCode, 400);
  } finally { await app.close(); }
});

function saleFixture(price = 100) {
  const writes: { model: string; data: any }[] = [], findCalls: any[] = [];
  const batch = { id: "batch-a", price, quantity: 10, salesStart: new Date(Date.now() - 10000), salesEnd: new Date(Date.now() + 100000), _count: { registrations: 0 } };
  const event = { id: scope.eventId, churchId: scope.churchId, campusId: null, capacity: 10, title: "Evento",
    isPaid: price > 0, slug: "event-slug", publicSlug: "public-slug", date: new Date(), church: { slug: "church-slug", name: "Igreja" },
    registrations: [], waitlistEnabled: false, ticketTypes: [{ id: "ticket-a", batches: [batch] }], formFields: [] };
  let saved: any = null;
  const tx: any = { event: { async findFirst(input: any) { findCalls.push(input); return event; } },
    async $executeRaw() { return 1; }, ticketBatch: { async findFirst() { return batch; } },
    visitor: { async create({ data }: any) { writes.push({ model: "visitor", data }); return { id: "visitor-a" }; } },
    registration: { async count() { return 0; }, async findFirst(input: any) { findCalls.push(input);
        return input.where.visitor ? { id: "existing", paymentId: null, paymentStatus: "NOT_REQUIRED" } :
          saved && input.where.id === saved.id && input.where.churchId === saved.churchId && input.where.eventId === saved.eventId ? saved : null; },
      async create({ data }: any) { writes.push({ model: "registration", data }); saved = { id: scope.registrationId, ...data, paymentId: null, event, checkInToken: "participant-token" }; return saved; },
      async update({ data }: any) { Object.assign(saved, data); return saved; }, async findUniqueOrThrow() { return saved; } },
    church: { async findFirst() { return { platformFeePercent: 10 }; } },
    eventOrder: { async create({ data }: any) { writes.push({ model: "order", data }); return { id: "order-a" }; } },
    transaction: { async create({ data }: any) { writes.push({ model: "transaction", data }); return { id: "transaction-a" }; } },
    eventPayment: { async create({ data }: any) { writes.push({ model: "payment", data }); return { id: "payment-a" }; } } };
  const prisma = { ...tx, async $transaction(operation: any) { return operation(tx); } } as PrismaClient;
  return { tx: tx as Prisma.TransactionClient, prisma, writes, findCalls, batch, get saved() { return saved; } };
}

test("v2 factory reuses sale rules and one official graph inside the supplied transaction, without contact dedup", async () => {
  const h = saleFixture(); const result = await createCheckoutRegistrationFactory(h.prisma)(h.tx, scope, body);
  assert.deepEqual(result, { id: scope.registrationId });
  assert.equal(h.findCalls[0].where.churchId, scope.churchId);
  assert.equal(h.findCalls.some(c => c.where.visitor), false);
  for (const model of ["registration", "order", "transaction", "payment"]) assert.equal(h.writes.filter(w => w.model === model).length, 1);
  const financial = h.writes.find(w => w.model === "transaction")!.data;
  assert.equal(financial.method, "CARD"); assert.equal(financial.type, "EVENT"); assert.equal(financial.amount.toString(), "100");
  const payment = h.writes.find(w => w.model === "payment")!.data;
  assert.equal(payment.transactionId, "transaction-a"); assert.equal(payment.platformFeeAmount.toString(), "10"); assert.equal(payment.netAmount.toString(), "90");
  assert.equal(h.writes.find(w => w.model === "registration")!.data.paymentStatus, "PENDING");
});

test("free factory preserves eligibility without a ledger and sold-out sales leave no writes", async () => {
  const free = saleFixture(0); await createCheckoutRegistrationFactory(free.prisma)(free.tx, scope, body);
  assert.deepEqual(free.writes.map(w => w.model), ["visitor", "registration"]);
  assert.equal(free.writes[1]!.data.paymentStatus, "NOT_REQUIRED");
  const sold = saleFixture(); sold.batch._count.registrations = 10;
  await assert.rejects(createCheckoutRegistrationFactory(sold.prisma)(sold.tx, scope, body), /TICKET_BATCH_SOLD_OUT/);
  assert.equal(sold.writes.length, 0);
});

test("legacy wrapper keeps its existing contact deduplication and creates no new writes on retry", async () => {
  const h = saleFixture(); const result = await createPublicRegistration(h.prisma, scope.eventId, body);
  assert.equal(result.id, "existing"); assert.equal(h.writes.length, 0);
  assert.ok(h.findCalls.some(c => c.where.visitor));
});

test("both production builders remain unchanged and do not import/enable the prepared bundle", async () => {
  for (const server of ["events-api", "api-br"]) {
    const text = await readFile(new URL(`../../../apps/${server}/src/app.ts`, import.meta.url), "utf8");
    assert.equal(text.includes("checkout-v2"), false); assert.equal(text.includes("prepareCheckoutV2"), false);
    assert.equal((text.match(/await registerPublicEventRoutes\(/g) ?? []).length, 1);
    assert.equal(text.includes("resetPendingEventPaymentProviderReference("), true);
    const staged = await readFile(new URL(`../../../apps/${server}/src/checkout-v2.prepared.ts`, import.meta.url), "utf8");
    assert.equal(staged.includes("prepareCheckoutV2Routes(prisma"), true);
    assert.equal(staged.includes("createAsaasChargeForExistingTransaction"), false);
    assert.equal(staged.includes("deleteAsaasPayment"), false);
  }
});

test("both register route identities share atomic v2 creation and key retry, never contact fallback or provider calls", async () => {
  const sale = saleFixture(), tx = sale.tx as any, accesses: any[] = [];
  tx.$queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.includes('FROM "EventCheckoutAccess"')) return accesses.filter(a => a.credentialHash === values[0]);
    if (sql.includes('FROM "Registration" r')) return sale.saved ? [{ id: sale.saved.id }] : [];
    if (sql.includes("FOR UPDATE")) return sale.saved ? [sale.saved] : [];
    throw Error(`Unexpected query ${sql}`);
  };
  tx.$executeRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes('INSERT INTO "EventCheckoutAccess"')) accesses.push({ id: values[0], churchId: values[1], eventId: values[2],
      registrationId: values[3], credentialHash: values[4], source: "PUBLIC_ATTEMPT", requestFingerprint: values[5],
      requestedPaymentMethod: values[6], createdAt: values[7], expiresAt: values[8], revokedAt: null });
    if (sql.includes('UPDATE "Registration"')) sale.saved.checkoutEmail = values[0];
    return 1;
  };
  Object.assign(sale.prisma, { $queryRaw: tx.$queryRaw, $executeRaw: tx.$executeRaw });
  let calls = 0;
  const provider: CheckoutPaymentProvider = { async read() { calls++; throw Error("unexpected provider"); }, async pix() { calls++; throw Error("unexpected provider"); } };
  const app = Fastify(); for (const route of prepareCheckoutV2Routes(sale.prisma, provider)) app.route(route);
  const key = generateCheckoutCredential(), headers = { "x-event-checkout-key": key };
  try {
    const first = await app.inject({ method: "POST", url: "/public/events/event-a/register", headers, payload: body });
    assert.equal(first.statusCode, 201); assert.equal(first.json().paymentStatus, "PENDING");
    assert.equal(first.json().checkInToken, null); assert.equal(first.json().checkoutToken, undefined);
    const retry = await app.inject({ method: "POST", url: "/public/churches/church-slug/events/event-slug/register", headers, payload: body });
    assert.equal(retry.statusCode, 200); assert.equal(retry.json().id, first.json().id);
    assert.equal(retry.json().expiresAt, first.json().expiresAt);
    const conflict = await app.inject({ method: "POST", url: "/public/events/event-a/register", headers, payload: { ...body, paymentMethod: "CREDIT_CARD" } });
    assert.equal(conflict.statusCode, 409);
    const contact = await app.inject({ method: "POST", url: "/public/events/event-a/register",
      headers: { "x-event-checkout-key": generateCheckoutCredential() }, payload: body });
    assert.equal(contact.statusCode, 409); assert.equal(contact.json().error, "CHECKOUT_ASSISTANCE_REQUIRED");
    assert.equal(accesses.length, 1); assert.equal(sale.writes.filter(w => w.model === "payment").length, 1); assert.equal(calls, 0);
  } finally { await app.close(); }
});
