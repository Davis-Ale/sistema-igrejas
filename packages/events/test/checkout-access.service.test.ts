import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { CHECKOUT_ACCESS_TTL_MS, checkoutCredentialSchema, type CheckoutAccessRecord } from "../src/checkout-access.schema.ts";
import { createCheckoutAttempt, generateCheckoutCredential, withCheckoutAuthorization } from "../src/checkout-access.service.ts";

const scope = { churchId: "church-a", eventId: "event-a" };
const now = new Date("2026-10-14T12:00:00.000Z");
const clock = () => new Date(now);
const body = { name: "Participante", phone: "41999990001", email: "person@example.invalid",
  cpf: "52998224725", paymentMethod: "PIX", ticketId: "ticket", ticketBatchId: "batch",
  discountCode: "cupom", answers: [{ fieldId: "b", value: ["one", "two"] }, { fieldId: "a", value: "text" }] };
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
type Registration = { id: string; churchId: string; eventId: string; registrationSource: string;
  phone: string; email: string; checkoutEmail: string | null };

// Protocol double: queues transactions and rolls all writes back on failure.
// It does not implement/prove PostgreSQL isolation, constraints or lock behavior.
function harness() {
  let state = { accesses: [] as CheckoutAccessRecord[], registrations: [] as Registration[],
    financial: [] as { registrationId: string; paymentId: string; transactionId: string;
      amount: number; fee: number; net: number; providerPaymentId: string | null }[] };
  let tail = Promise.resolve();
  let transactions = 0;
  let factories = 0;
  let saleReads = 0;
  let closed = false;
  let commitFailure: unknown = null;
  let insertFailure: unknown = null;
  const queries: { sql: string; values: unknown[] }[] = [];
  const options: unknown[] = [];
  const tx = {
    event: { async findFirst({ where }: any) {
      saleReads++;
      return !closed && where.churchId === scope.churchId && where.id === scope.eventId ? { id: scope.eventId } : null;
    } },
    registration: { async findFirst({ where }: any) {
      return state.registrations.find(r => r.id === where.id && r.churchId === where.churchId &&
        r.eventId === where.eventId && r.registrationSource === where.registrationSource) ?? null;
    } },
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); queries.push({ sql, values });
      if (sql.includes("pg_advisory_xact_lock")) return [];
      if (sql.includes('FROM "EventCheckoutAccess"')) return state.accesses.filter(a => a.credentialHash === values[0]);
      if (sql.includes('FROM "Registration" r')) {
        return state.registrations.filter(r => r.churchId === values[0] && r.eventId === values[1] &&
          (r.phone === values[2] || r.email === values[4] || r.checkoutEmail === values[6])).slice(0, 1);
      }
      if (sql.includes("FOR UPDATE")) return state.registrations.filter(r =>
        r.churchId === values[0] && r.eventId === values[1] && r.id === values[2]);
      throw new Error(`Unexpected query: ${sql}`);
    },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?"); queries.push({ sql, values });
      if (sql.includes('UPDATE "Registration"')) {
        const r = state.registrations.find(r => r.churchId === values[1] && r.eventId === values[2] && r.id === values[3]);
        if (r && r.checkoutEmail === null) r.checkoutEmail = values[0] as string;
        return 1;
      }
      if (sql.includes('INSERT INTO "EventCheckoutAccess"')) {
        if (insertFailure) { const error = insertFailure; insertFailure = null; throw error; }
        state.accesses.push({ id: values[0] as string, churchId: values[1] as string,
          eventId: values[2] as string, registrationId: values[3] as string, credentialHash: values[4] as string,
          source: "PUBLIC_ATTEMPT", requestFingerprint: values[5] as string,
          requestedPaymentMethod: values[6] as "PIX", createdAt: values[7] as Date,
          expiresAt: values[8] as Date, revokedAt: null });
        return 1;
      }
      throw new Error(`Unexpected mutation: ${sql}`);
    }
  };
  const database = { async $transaction(operation: any, option: unknown) {
    options.push(option); transactions++;
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const snapshot = structuredClone(state);
    try {
      const result = await operation(tx);
      if (commitFailure) { const error = commitFailure; commitFailure = null; throw error; }
      return result;
    } catch (error) { state = snapshot; throw error; }
    finally { release(); }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  const factory = async (received: Prisma.TransactionClient, resolved: typeof scope, input: any) => {
    assert.equal(received, tx); factories++;
    const id = `registration-${state.registrations.length + 1}`;
    state.registrations.push({ ...resolved, id, registrationSource: "PUBLIC", phone: input.phone,
      email: input.email, checkoutEmail: null });
    state.financial.push({ registrationId: id, paymentId: `payment-${id}`, transactionId: `transaction-${id}`,
      amount: 100, fee: 10, net: 90, providerPaymentId: null });
    return { id };
  };
  return { database, factory, queries, options, get state() { return state; },
    get factories() { return factories; }, get transactions() { return transactions; }, get saleReads() { return saleReads; },
    closeSale() { closed = true; }, failCommit(error: unknown) { commitFailure = error; },
    failInsert(error: unknown) { insertFailure = error; } };
}

test("generation supplies canonical 256-bit private keys", () => {
  const keys = Array.from({ length: 100 }, () => generateCheckoutCredential());
  assert.equal(new Set(keys).size, 100);
  for (const key of keys) {
    assert.equal(checkoutCredentialSchema.safeParse(key).success, true);
    assert.equal(Buffer.from(key.slice(4), "base64url").length, 32);
  }
});

test("creation stores only digests, local email and absolute 24h access atomically", async () => {
  const h = harness(), key = generateCheckoutCredential();
  const result = await createCheckoutAttempt(h.database, scope, key, body, h.factory, clock);
  assert.equal(result.wasExisting, false);
  assert.equal(result.expiresAt.getTime(), now.getTime() + CHECKOUT_ACCESS_TTL_MS);
  assert.deepEqual(Object.keys(result).sort(), ["expiresAt", "registrationId", "wasExisting"]);
  assert.equal(h.state.accesses[0]?.credentialHash, hash(key));
  assert.equal(h.state.registrations[0]?.checkoutEmail, body.email);
  const accessData = JSON.stringify(h.state.accesses);
  for (const privateValue of [key, body.cpf, body.phone, body.email, "text"]) assert.equal(accessData.includes(privateValue), false);
  assert.deepEqual(h.options, [{ isolationLevel: "Serializable" }]);
  assert.deepEqual(h.queries.slice(0, 2).map(q => q.values[0]), [`checkout-key:${hash(key)}`, `public-registration:${scope.eventId}`]);
  assert.ok(h.queries.every(q => !q.sql.includes(key) && !q.sql.includes(body.email)));
});

test("normalized retry reuses the graph before closed/new-sale validation without renewing expiry", async () => {
  const h = harness(), key = generateCheckoutCredential();
  const first = await createCheckoutAttempt(h.database, scope, key, body, h.factory, clock);
  const financial = structuredClone(h.state.financial);
  h.closeSale();
  const retry = await createCheckoutAttempt(h.database, scope, key, {
    ...body, name: ` ${body.name} `, email: ` ${body.email.toUpperCase()} `, phone: "(41) 99999-0001",
    cpf: "529.982.247-25", discountCode: " CUPOM ", answers: [...body.answers].reverse()
  }, h.factory, () => new Date(now.getTime() + 1000));
  assert.deepEqual(retry, { ...first, wasExisting: true });
  assert.equal(h.factories, 1); assert.equal(h.saleReads, 1);
  assert.deepEqual(h.state.financial, financial);
});

test("payload/method changes conflict and do not create, replace or modify financial records", async () => {
  const h = harness(), key = generateCheckoutCredential();
  await createCheckoutAttempt(h.database, scope, key, body, h.factory, clock);
  const before = structuredClone(h.state);
  for (const patch of [{ name: "Other" }, { paymentMethod: "CREDIT_CARD" }, { paymentMethod: "DEBIT_CARD" },
    { email: "other@example.invalid" }, { cpf: "11144477735" }, { ticketBatchId: "other" }, { answers: [] }]) {
    await assert.rejects(createCheckoutAttempt(h.database, scope, key, { ...body, ...patch }, h.factory, clock), /CHECKOUT_ATTEMPT_CONFLICT/);
  }
  assert.equal(h.factories, 1); assert.deepEqual(h.state, before);
});

test("key reuse across church/event/registration and all legacy/contact credentials fail closed", async () => {
  const h = harness(), key = generateCheckoutCredential();
  await createCheckoutAttempt(h.database, scope, key, body, h.factory, clock);
  let authorized = 0;
  const operation = async () => { authorized++; };
  for (const other of [{ ...scope, churchId: "other" }, { ...scope, eventId: "other" }]) {
    await assert.rejects(createCheckoutAttempt(h.database, other, key, body, h.factory, clock), /CHECKOUT_ACCESS_DENIED/);
    await assert.rejects(withCheckoutAuthorization(h.database, other, key, operation, clock), /CHECKOUT_ACCESS_DENIED/);
  }
  await assert.rejects(withCheckoutAuthorization(h.database, { ...scope, registrationId: "other" }, key, operation, clock), /CHECKOUT_ACCESS_DENIED/);
  for (const invalid of [body.phone, body.email, "Participante", `registration-1.${"a".repeat(64)}`, generateCheckoutCredential()]) {
    await assert.rejects(withCheckoutAuthorization(h.database, scope, invalid, operation, clock), /CHECKOUT_ACCESS_DENIED/);
  }
  assert.equal(authorized, 0); assert.equal(h.factories, 1);
});

test("expiry boundary, future issuance and revocation never authorize or start fresh attempts", async () => {
  for (const kind of ["expiry", "future", "revoke"]) {
    const h = harness(), key = generateCheckoutCredential();
    await createCheckoutAttempt(h.database, scope, key, body, h.factory, clock);
    if (kind === "revoke") h.state.accesses[0]!.revokedAt = now;
    const deniedClock = kind === "expiry" ? () => new Date(now.getTime() + CHECKOUT_ACCESS_TTL_MS) :
      kind === "future" ? () => new Date(now.getTime() - 1) : clock;
    await assert.rejects(withCheckoutAuthorization(h.database, scope, key, async () => assert.fail("unauthorized"), deniedClock), /CHECKOUT_ACCESS_DENIED/);
    await assert.rejects(createCheckoutAttempt(h.database, scope, key, body, h.factory, deniedClock), /CHECKOUT_ACCESS_DENIED/);
    assert.equal(h.factories, 1); assert.equal(h.state.accesses.length, 1);
  }
});

test("matching contacts without the private key require assistance, including legacy registrations", async () => {
  for (const match of ["phone", "email", "checkoutEmail"]) {
    const h = harness();
    h.state.registrations.push({ ...scope, id: "legacy", registrationSource: "PUBLIC",
      phone: match === "phone" ? body.phone : "other", email: match === "email" ? body.email : "other",
      checkoutEmail: match === "checkoutEmail" ? body.email : null });
    await assert.rejects(createCheckoutAttempt(h.database, scope, generateCheckoutCredential(), body, h.factory, clock), /CHECKOUT_ASSISTANCE_REQUIRED/);
    assert.equal(h.factories, 0); assert.equal(h.state.accesses.length, 0); assert.equal(h.state.financial.length, 0);
  }
});

test("concurrent equivalent requests yield one graph and one grant in the serialized protocol", async () => {
  const h = harness(), key = generateCheckoutCredential();
  const results = await Promise.all(Array.from({ length: 20 }, () => createCheckoutAttempt(h.database, scope, key, body, h.factory, clock)));
  assert.equal(h.factories, 1); assert.equal(h.state.financial.length, 1); assert.equal(h.state.accesses.length, 1);
  assert.equal(results.filter(r => !r.wasExisting).length, 1);
  assert.equal(new Set(results.map(r => r.registrationId)).size, 1);
});

test("competing different keys with coincident contacts do not create duplicates", async () => {
  const h = harness();
  const results = await Promise.allSettled(Array.from({ length: 10 }, () =>
    createCheckoutAttempt(h.database, scope, generateCheckoutCredential(), body, h.factory, clock)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(h.factories, 1); assert.equal(h.state.accesses.length, 1);
  for (const r of results) if (r.status === "rejected") assert.match(r.reason.message, /CHECKOUT_ASSISTANCE_REQUIRED/);
});

test("access-insert failure rolls back registration, local email and the whole financial graph", async () => {
  const h = harness(); h.failInsert(new Error("isolated insert failure"));
  await assert.rejects(createCheckoutAttempt(h.database, scope, generateCheckoutCredential(), body, h.factory, clock), /isolated insert failure/);
  assert.deepEqual(h.state, { registrations: [], financial: [], accesses: [] }); assert.equal(h.transactions, 1);
});

test("serialization and stale-key unique conflict retry rolled-back database work only", async () => {
  for (const failure of [{ code: "P2034" }, { code: "P2010", meta: { code: "23505", message: "EventCheckoutAccess_credentialHash_key" } }]) {
    const h = harness(), key = generateCheckoutCredential(); h.failCommit(failure);
    await createCheckoutAttempt(h.database, scope, key, body, h.factory, clock);
    assert.equal(h.transactions, 2); assert.equal(h.factories, 2);
    assert.equal(h.state.registrations.length, 1); assert.equal(h.state.financial.length, 1); assert.equal(h.state.accesses.length, 1);
  }
});

test("unrelated unique conflicts/timeouts are not retried and serialization retries are bounded", async () => {
  for (const failure of [{ code: "P2002" }, { code: "P2028" }, { code: "P2010", meta: { code: "23505", message: "other_constraint" } }]) {
    const h = harness(); h.failCommit(failure);
    await assert.rejects(createCheckoutAttempt(h.database, scope, generateCheckoutCredential(), body, h.factory, clock));
    assert.equal(h.transactions, 1); assert.equal(h.state.accesses.length, 0);
  }
  const h = harness();
  const alwaysFail = async () => { throw { code: "P2034" }; };
  await assert.rejects(createCheckoutAttempt(h.database, scope, generateCheckoutCredential(), body, alwaysFail, clock));
  assert.equal(h.transactions, 3); assert.equal(h.state.accesses.length, 0);
});

test("authorized operation receives only scoped identity under row lock, with immutable expiry", async () => {
  const h = harness(), key = generateCheckoutCredential();
  await createCheckoutAttempt(h.database, scope, key, body, h.factory, clock);
  const before = structuredClone(h.state);
  const value = await withCheckoutAuthorization(h.database, scope, key, async (_tx, resolved) => {
    assert.ok(h.queries.at(-2)?.sql.includes("FOR UPDATE"));
    assert.deepEqual(resolved, { ...scope, registrationId: "registration-1" }); return "authorized";
  }, clock);
  assert.equal(value, "authorized"); assert.deepEqual(h.state, before);
});

test("wrong factory scope and duplicate form answers fail without leaving writes", async () => {
  const h = harness();
  await assert.rejects(createCheckoutAttempt(h.database, scope, generateCheckoutCredential(), body,
    async tx => h.factory(tx, { ...scope, churchId: "other" }, body), clock), /CHECKOUT_REGISTRATION_SCOPE_INVALID/);
  assert.equal(h.state.registrations.length, 0); assert.equal(h.state.financial.length, 0);
  await assert.rejects(createCheckoutAttempt(h.database, scope, generateCheckoutCredential(),
    { ...body, answers: [{ fieldId: "a", value: "one" }, { fieldId: "a", value: "two" }] }, h.factory, clock), /INVALID_FORM_ANSWER/);
});
