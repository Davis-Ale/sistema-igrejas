import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import { prepareEventsApiCheckoutSecurity } from "../../../apps/events-api/src/checkout-security.prepared.ts";
import { prepareApiBrCheckoutSecurity } from "../../../apps/api-br/src/checkout-security.prepared.ts";
import { prepareEventsApiCheckoutV2 } from "../../../apps/events-api/src/checkout-v2.prepared.ts";
import { prepareApiBrCheckoutV2 } from "../../../apps/api-br/src/checkout-v2.prepared.ts";
import { registerClosedPublicCheckout } from "../src/checkout-closure.prepared.ts";
import { registerExclusiveCheckoutV2 } from "../src/checkout-v2.cutover.prepared.ts";
import { registerPublicEventRoutes } from "../src/public.routes.ts";
import { CHECKOUT_PUBLIC_PATHS, CHECKOUT_SECURITY_CONSUME_SCRIPT, CHECKOUT_SECURITY_GATE_KEY,
  createRedisCheckoutSecurityStore, type CheckoutSecurityConfig, type CheckoutSecurityStore } from "../src/checkout-security.prepared.ts";
import { waitCheckoutPendingDrain } from "../src/checkout-security.containment.ts";

globalThis.fetch = async () => { throw new Error("EXTERNAL_NETWORK_FORBIDDEN"); };
const config = (): CheckoutSecurityConfig => ({ origins: ["https://checkout.example.invalid"], allowLocalHttp: false,
  httpsOnly: true, bucketSecret: "synthetic-test-bucket-secret-32-characters", windowMs: 60_000,
  ipLimit: 100, credentialLimit: 50, bodyLimit: 1024, storeTimeoutMs: 100, requestTimeoutMs: 10_000 });
const key = `ec2_${"A".repeat(43)}`;
const path = "/public/events/event-a/register";
const route = "/public/events/:eventId/register";
const factories = [prepareEventsApiCheckoutSecurity, prepareApiBrCheckoutSecurity];

// Synchronous, shared double: proves the protocol, NOT real Redis/Lua atomicity.
function storeDouble() {
  let closed = false, now = 0, fingerprint: string | undefined;
  const counts = new Map<string, { count: number; expires: number }>();
  const calls: Array<{ key: string; limit: number }[]> = [];
  const store: CheckoutSecurityStore = {
    async consume(buckets, windowMs, policy) {
      calls.push(buckets);
      fingerprint ??= policy;
      if (closed || policy !== fingerprint) return { closed: true, retryAfterMs: 0 };
      let retryAfterMs = 0;
      for (const bucket of buckets) {
        let value = counts.get(bucket.key);
        if (!value || value.expires <= now) { value = { count: 0, expires: now + windowMs }; counts.set(bucket.key, value); }
        value.count++;
        if (value.count > bucket.limit) retryAfterMs = Math.max(retryAfterMs, value.expires - now);
      }
      return { closed: false, retryAfterMs };
    },
    async close() { closed = true; }
  };
  return { store, calls, advance(ms: number) { now += ms; } };
}
async function harness(factory = factories[0]!, options = config(), shared = storeDouble()) {
  const security = factory(options, shared.store);
  const lines: string[] = [];
  const app = Fastify({ ...security.fastifyOptions, logger: {
    ...(security.fastifyOptions.logger as object), stream: { write(line: string) { lines.push(line); } }
  } });
  await security.install(app);
  return { app, security, shared, lines };
}

test("both prepared API policies have no side effects and reject unsafe or incomplete configuration", () => {
  for (const factory of factories) {
    const h = storeDouble(); factory(config(), h.store); assert.equal(h.calls.length, 0);
    for (const origins of [[], ["*"], ["null"], ["https://checkout.example.invalid/path"], ["https://user:secret@checkout.example.invalid"], ["http://remote.example.invalid"]]) {
      assert.throws(() => factory({ ...config(), origins }, h.store));
    }
    for (const patch of [{ ipLimit: 0 }, { windowMs: Infinity }, { bodyLimit: -1 }, { storeTimeoutMs: 6000 },
      { bucketSecret: "short" }, { requestTimeoutMs: 0 }]) assert.throws(() => factory({ ...config(), ...patch }, h.store));
    assert.throws(() => factory({ ...config(), origins: ["http://localhost:3001"] }, h.store));
    factory({ ...config(), origins: ["http://localhost:3001"], allowLocalHttp: true, httpsOnly: false }, h.store);
  }
});

test("CORS preflight allows only exact configured origins and headers, without credentials or private header exposure", async () => {
  for (const factory of factories) {
    const h = await harness(factory);
    h.app.post(route, async () => ({ ok: true }));
    try {
      const response = await h.app.inject({ method: "OPTIONS", url: path,
        headers: { origin: config().origins[0]!, "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-event-checkout-key" } });
      assert.equal(response.statusCode, 204);
      assert.equal(response.headers["access-control-allow-origin"], config().origins[0]);
      assert.match(String(response.headers["access-control-allow-headers"]), /X-Event-Checkout-Key/);
      assert.equal(response.headers["access-control-allow-credentials"], undefined);
      assert.equal(response.headers["access-control-expose-headers"], "Retry-After");
      assert.equal(h.shared.calls.length, 0);
      for (const origin of ["null", "https://checkout.example.invalid.evil.invalid", "http://checkout.example.invalid", "https://evil.invalid"]) {
        const denied = await h.app.inject({ method: "POST", url: path, headers: { origin }, payload: {} });
        assert.equal(denied.statusCode, 403); assert.equal(denied.headers["access-control-allow-origin"], undefined);
      }
      assert.equal(h.shared.calls.length, 0);
      const server = await h.app.inject({ method: "POST", url: path, payload: {} });
      assert.equal(server.statusCode, 200); assert.equal(server.headers["access-control-allow-origin"], undefined);
    } finally { await h.app.close(); }
  }
});

test("prepared headers cover success, denial, malformed JSON, large bodies and sanitized errors on both APIs", async () => {
  for (const factory of factories) {
    const h = await harness(factory);
    h.app.post(route, async request => { if ((request.body as any)?.fail) throw new Error(`private ${key}`); return { ok: true }; });
    try {
      const responses = [
        await h.app.inject({ method: "POST", url: path, payload: {} }),
        await h.app.inject({ method: "POST", url: path, payload: { fail: true } }),
        await h.app.inject({ method: "POST", url: path, headers: { "content-type": "application/json" }, payload: "{" }),
        await h.app.inject({ method: "POST", url: path, payload: { large: "x".repeat(2000) } }),
        await h.app.inject({ method: "POST", url: path, headers: { origin: "https://evil.invalid" }, payload: {} })
      ];
      assert.deepEqual(responses.map(response => response.statusCode), [200, 500, 400, 413, 403]);
      for (const response of responses) {
        assert.equal(response.headers["cache-control"], "no-store");
        assert.equal(response.headers["x-content-type-options"], "nosniff");
        assert.equal(response.headers["referrer-policy"], "no-referrer");
        assert.equal(response.headers["x-frame-options"], "DENY");
        assert.match(String(response.headers["content-security-policy"]), /frame-ancestors 'none'/);
        assert.equal(response.headers["strict-transport-security"], "max-age=31536000");
        assert.equal(response.body.includes(key), false);
      }
      assert.equal(h.security.pendingRequests(), 0);
    } finally { await h.app.close(); }
  }
});

test("shared IP quota spans both APIs, IDs/slugs, actions and events; forwarded headers cannot reset it", async () => {
  const shared = storeDouble(), options = { ...config(), ipLimit: 2 };
  const a = await harness(factories[0], options, shared), b = await harness(factories[1], options, shared);
  let handlers = 0;
  for (const h of [a, b]) for (const url of CHECKOUT_PUBLIC_PATHS) h.app.post(url, async () => { handlers++; return { ok: true }; });
  try {
    const first = await a.app.inject({ method: "POST", url: path, payload: {} });
    const second = await b.app.inject({ method: "POST", url: "/public/churches/other/events/other/checkout/status", payload: {} });
    const third = await b.app.inject({ method: "POST", url: "/public/events/other/checkout/resume", headers: { "x-forwarded-for": "203.0.113.77" }, payload: {} });
    assert.deepEqual([first.statusCode, second.statusCode, third.statusCode], [200, 200, 429]);
    assert.equal(third.headers["retry-after"], "60"); assert.equal(handlers, 2);
    assert.equal(shared.calls[0]![0]!.key, shared.calls[2]![0]!.key);
    shared.advance(options.windowMs);
    assert.equal((await a.app.inject({ method: "POST", url: path, payload: {} })).statusCode, 200);
  } finally { await a.app.close(); await b.app.close(); }
});

test("one capability budget covers different IPs and API instances; only HMAC digests reach the store", async () => {
  const shared = storeDouble(), options = { ...config(), credentialLimit: 1 };
  const a = await harness(factories[0], options, shared), b = await harness(factories[1], options, shared);
  for (const h of [a, b]) h.app.post(route, async () => ({ ok: true }));
  try {
    const responses = await Promise.all([a.app.inject({ method: "POST", url: path, remoteAddress: "203.0.113.1", headers: { "x-event-checkout-key": key }, payload: {} }),
      b.app.inject({ method: "POST", url: path, remoteAddress: "203.0.113.2", headers: { "x-event-checkout-key": key }, payload: {} })]);
    assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 429]);
    const stored = JSON.stringify(shared.calls);
    for (const secret of [key, "203.0.113.1", "203.0.113.2"]) assert.equal(stored.includes(secret), false);
    assert.equal(shared.calls[0]![1]!.key, shared.calls[1]![1]!.key);
  } finally { await a.app.close(); await b.app.close(); }
});

test("policy mismatch cannot bypass shared limits or independently reopen an API", async () => {
  const shared = storeDouble();
  const a = await harness(factories[0], config(), shared);
  const b = await harness(factories[1], { ...config(), ipLimit: 999 }, shared);
  for (const h of [a, b]) h.app.post(route, async () => ({ ok: true }));
  try {
    assert.equal((await a.app.inject({ method: "POST", url: path, payload: {} })).statusCode, 200);
    assert.equal((await b.app.inject({ method: "POST", url: path, payload: {} })).statusCode, 503);
    await a.security.close();
    assert.equal((await a.app.inject({ method: "POST", url: path, payload: {} })).statusCode, 503);
  } finally { await a.app.close(); await b.app.close(); }
});

test("store failure and deadline fail closed before backend work, including transports ignoring cancellation", async () => {
  for (const factory of factories) for (const mode of ["throw", "hang"] as const) {
    const h = await harness(factory, { ...config(), storeTimeoutMs: 10 });
    let called = 0;
    h.shared.store.consume = async () => { if (mode === "throw") throw new Error(`private ${key}`); return new Promise(() => {}); };
    h.app.post(route, async () => { called++; return {}; });
    try {
      const result = await h.app.inject({ method: "POST", url: path, payload: {} });
      assert.equal(result.statusCode, 503); assert.equal(result.json().error, "CHECKOUT_SECURITY_UNAVAILABLE");
      assert.equal(called, 0); assert.equal(result.body.includes(key), false);
    } finally { await h.app.close(); }
  }
});

test("shared close blocks both APIs immediately and drain waits for already admitted handlers", async () => {
  const shared = storeDouble();
  const a = await harness(factories[0], config(), shared), b = await harness(factories[1], config(), shared);
  let started!: () => void, finish!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  a.app.post(route, async () => { started(); await blocked; return { ok: true }; });
  b.app.post(route, async () => ({ ok: true }));
  try {
    const ongoing = a.app.inject({ method: "POST", url: path, payload: {} });
    void ongoing.then(() => undefined); await entered;
    await b.security.close(); assert.equal(a.security.pendingRequests(), 1);
    for (const h of [a, b]) assert.equal((await h.app.inject({ method: "POST", url: path, payload: {} })).statusCode, 503);
    assert.equal(a.security.pendingRequests(), 1);
    finish(); assert.equal((await ongoing).statusCode, 200);
    await waitCheckoutPendingDrain(a.security.pendingRequests, config().requestTimeoutMs);
    assert.equal(a.security.pendingRequests(), 0); assert.equal(b.security.pendingRequests(), 0);
  } finally { finish(); await a.app.close(); await b.app.close(); }
});

test("closure composition replaces every critical alias, rejects coexistence and never accesses Prisma/provider", async () => {
  for (const factory of factories) {
    const h = await harness(factory);
    let calls = 0;
    const prisma = new Proxy({}, { get() { calls++; throw new Error("DATABASE_FORBIDDEN"); } }) as PrismaClient;
    await registerClosedPublicCheckout(h.app, prisma);
    try {
      for (const url of CHECKOUT_PUBLIC_PATHS) {
        const concrete = url.replace(":eventId", "event-a").replace(":churchSlug", "church-a").replace(":eventSlug", "event-a");
        for (const headers of [{}, { "x-event-checkout-key": key }]) {
          const result = await h.app.inject({ method: "POST", url: concrete, headers, payload: { checkoutToken: "legacy", email: "synthetic@example.invalid" } });
          assert.equal(result.statusCode, 503); assert.equal(result.json().error, "CHECKOUT_CLOSED");
          assert.equal(result.headers["cache-control"], "no-store");
        }
      }
      for (const url of ["/public/event-pages/:publicSlug", "/public/events/:eventId", "/public/churches/:churchSlug/events/:eventSlug"]) {
        assert.equal(h.app.hasRoute({ method: "GET", url }), true);
      }
      for (const suffix of ["access", "discounts/validate"]) assert.equal(h.app.hasRoute({ method: "POST", url: `/public/churches/:churchSlug/events/:eventSlug/${suffix}` }), true);
      assert.equal(calls, 0);
    } finally { await h.app.close(); }
    const duplicate = Fastify(); duplicate.post("/public/events/:eventId/register", async () => ({}));
    await assert.rejects(registerClosedPublicCheckout(duplicate, prisma), /EXCLUSIVE_REPLACEMENT/); await duplicate.close();
  }
});

test("installed policy keeps legacy checkout routes until close() contains them without swapping registrars", async () => {
  for (const factory of factories) {
    const h = await harness(factory);
    await registerPublicEventRoutes(h.app, {} as PrismaClient);
    try {
      assert.equal(h.app.hasRoute({ method: "POST", url: "/public/events/:eventId/register" }), true);
      const admitted = await h.app.inject({ method: "POST", url: path, payload: {} });
      assert.equal(admitted.statusCode, 400);
      assert.notEqual(admitted.json().error, "CHECKOUT_CLOSED");
      await h.security.close();
      const closed = await h.app.inject({ method: "POST", url: path, payload: {} });
      assert.equal(closed.statusCode, 503);
      assert.equal(closed.json().error, "CHECKOUT_CLOSED");
    } finally { await h.app.close(); }
  }
});

test("legacy default stays unchanged; ordinary JWT, health, webhook and participant routes keep their own policy", async () => {
  const legacy = Fastify();
  await registerPublicEventRoutes(legacy, {} as PrismaClient);
  try {
    assert.equal((await legacy.inject({ method: "POST", url: path, payload: {} })).statusCode, 400);
    assert.equal(legacy.hasRoute({ method: "POST", url: "/public/events/:eventId/checkout/resume" }), false);
  } finally { await legacy.close(); }
  for (const factory of factories) {
    const h = await harness(factory); await h.app.register(jwt, { secret: "synthetic-test-secret-at-least-32-characters" });
    h.app.get("/health", async () => ({ ok: true }));
    h.app.post("/webhook", async () => ({ ok: true }));
    h.app.get("/participant", async () => ({ ok: true }));
    h.app.get("/api/protected", { preHandler: async request => { await request.jwtVerify(); } }, async () => ({ ok: true }));
    h.shared.store.consume = async () => { throw new Error("SHOULD_NOT_USE_CHECKOUT_STORE"); };
    try {
      await h.security.close();
      for (const [method, url] of [["GET", "/health"], ["POST", "/webhook"], ["GET", "/participant"]] as const) assert.equal((await h.app.inject({ method, url })).statusCode, 200);
      assert.equal((await h.app.inject({ method: "GET", url: "/api/protected" })).statusCode, 401);
      assert.equal((await h.app.inject({ method: "GET", url: "/api/protected", headers: { authorization: `Bearer ${h.app.jwt.sign({ userId: "user-a", churchId: "church-a", role: "SUPER_ADMIN" })}` } })).statusCode, 200);
    } finally { await h.app.close(); }
  }
});

test("real Fastify logs omit private/legacy tokens, PII, query/path secrets and provider error messages", async () => {
  for (const factory of factories) {
    const h = await harness(factory);
    h.app.post(route, async request => { request.log.info({ req: request, body: request.body, headers: request.headers }, "safe structured record"); throw new Error(`private-provider-${key}`); });
    try {
      await h.app.inject({ method: "POST", url: path, headers: { "x-event-checkout-key": key, authorization: "Bearer synthetic-auth-secret", "x-api-key": "synthetic-api-secret", "x-request-id": "synthetic-request-id-secret" },
        payload: { cpf: "synthetic-cpf", email: "synthetic-email", checkoutToken: "synthetic-legacy-secret" } });
      assert.equal((await h.app.inject({ method: "POST", url: `${path}?key=synthetic-query-secret`, payload: {} })).statusCode, 400);
      await h.app.inject({ method: "POST", url: "/unknown/synthetic-path-secret?key=synthetic-query-secret", payload: {} });
      h.app.log.error({ err: new Error(`private-provider-${key}`) });
      const logs = h.lines.join(""); assert.ok(logs.length > 0);
      for (const secret of [key, "synthetic-auth-secret", "synthetic-api-secret", "synthetic-request-id-secret", "synthetic-cpf", "synthetic-email", "synthetic-legacy-secret", "synthetic-query-secret", "synthetic-path-secret", "private-provider"]) assert.equal(logs.includes(secret), false, secret);
    } finally { await h.app.close(); }
  }
});

test("administrative checkout still requires JWT and is limited before authorization or business work", async () => {
  for (const factory of factories) {
    const h = await harness(factory, { ...config(), ipLimit: 2 });
    await h.app.register(jwt, { secret: "synthetic-test-secret-at-least-32-characters" });
    let calls = 0;
    h.app.post("/api/events/:eventId/registrations/:registrationId/checkout/recovery", {
      preHandler: async request => { await request.jwtVerify(); }
    }, async () => { calls++; return { ok: true }; });
    try {
      const url = "/api/events/event-a/registrations/registration-a/checkout/recovery";
      const denied = await h.app.inject({ method: "POST", url, payload: {} });
      assert.equal(denied.statusCode, 401); assert.equal(denied.headers["cache-control"], "no-store");
      const headers = { authorization: `Bearer ${h.app.jwt.sign({ userId: "operator-a", churchId: "church-a", role: "SUPER_ADMIN" })}` };
      assert.equal((await h.app.inject({ method: "POST", url, headers, payload: {} })).statusCode, 200);
      assert.equal((await h.app.inject({ method: "POST", url, headers, payload: {} })).statusCode, 429);
      assert.equal(calls, 1);
    } finally { await h.app.close(); }
  }
});

test("prepared policy snapshots configuration and loopback HTTP never receives HSTS", async () => {
  const options = { ...config(), origins: ["http://localhost:3001"], httpsOnly: false, allowLocalHttp: true };
  const h = await harness(factories[0], options);
  h.app.post(route, async () => ({ ok: true }));
  options.origins.push("https://evil.invalid"); options.ipLimit = 1; options.bucketSecret = "changed";
  try {
    for (let i = 0; i < 2; i++) {
      const result = await h.app.inject({ method: "POST", url: path, headers: { origin: "http://localhost:3001" }, payload: {} });
      assert.equal(result.statusCode, 200); assert.equal(result.headers["strict-transport-security"], undefined);
    }
    assert.equal((await h.app.inject({ method: "POST", url: path, headers: { origin: "https://evil.invalid" }, payload: {} })).statusCode, 403);
  } finally { await h.app.close(); }
});

test("security composes with both actual dormant v2 bundles without authorizing by CORS, quota or legacy tokens", async () => {
  for (const [factory, prepareV2] of [[prepareEventsApiCheckoutSecurity, prepareEventsApiCheckoutV2], [prepareApiBrCheckoutSecurity, prepareApiBrCheckoutV2]] as const) {
    const h = await harness(factory);
    await h.app.register(jwt, { secret: "synthetic-test-secret-at-least-32-characters" });
    let databaseCalls = 0;
    const prisma = new Proxy({}, { get() { databaseCalls++; throw new Error("DATABASE_FORBIDDEN"); } }) as PrismaClient;
    for (const descriptor of prepareV2(prisma)) h.app.route(descriptor);
    try {
      for (const url of [path, "/public/churches/church-a/events/event-a/checkout/status"]) {
        const result = await h.app.inject({ method: "POST", url, headers: { origin: config().origins[0]! }, payload: { checkoutToken: "synthetic-legacy", email: "synthetic@example.invalid" } });
        assert.equal(result.statusCode, 403); assert.equal(result.json().error, "CHECKOUT_ACCESS_DENIED");
        assert.equal(result.headers["cache-control"], "no-store");
        assert.equal(result.headers["access-control-allow-origin"], config().origins[0]);
      }
      assert.equal(databaseCalls, 0);
      await h.security.close();
      assert.equal((await h.app.inject({ method: "POST", url: path, headers: { "x-event-checkout-key": key }, payload: {} })).statusCode, 503);
      assert.equal(databaseCalls, 0);
    } finally { await h.app.close(); }
  }
});

test("Redis adapter sends one atomic shared-slot gate/quota operation with expiry and validates replies", async () => {
  const calls: unknown[][] = []; let reply: unknown = [0, 1200];
  const adapter = createRedisCheckoutSecurityStore({ async eval(...args) { calls.push(args); return reply; } });
  const buckets = [{ key: "ip:digest-a", limit: 3 }, { key: "capability:digest-b", limit: 2 }];
  assert.deepEqual(await adapter.consume(buckets, 60_000, "fingerprint"), { closed: false, retryAfterMs: 1200 });
  assert.equal(calls[0]![0], CHECKOUT_SECURITY_CONSUME_SCRIPT); assert.equal(calls[0]![1], 3);
  assert.equal(calls[0]![2], CHECKOUT_SECURITY_GATE_KEY);
  assert.deepEqual(calls[0]!.slice(-4), [60_000, "fingerprint", 3, 2]);
  assert.match(CHECKOUT_SECURITY_CONSUME_SCRIPT, /PEXPIRE/); assert.match(CHECKOUT_SECURITY_CONSUME_SCRIPT, /gate ~= 'LEGACY:'/);
  for (const invalid of [null, [], [0, -1], [2, 0], [0, NaN], [0, "12"], [0, 60_001]]) { reply = invalid; await assert.rejects(adapter.consume(buckets, 60_000, "fingerprint")); }
  reply = [1, 0]; assert.equal((await adapter.consume(buckets, 60_000, "fingerprint")).closed, true);
  reply = "OK"; await adapter.close(); assert.match(String(calls.at(-1)![0]), /'CLOSED'/);
  assert.equal(calls.at(-1)![2], CHECKOUT_SECURITY_GATE_KEY);
  reply = null; await assert.rejects(adapter.close());
});

test("exclusive v2 on both policies closes only to CLOSED, drains and never restores the legacy callback", async () => {
  const shared = storeDouble();
  const a = await harness(factories[0], config(), shared);
  const b = await harness(factories[1], config(), shared);
  const prisma = new Proxy({}, { get() { throw new Error("DATABASE_FORBIDDEN"); } }) as PrismaClient;
  await registerExclusiveCheckoutV2(a.app, prisma, prepareEventsApiCheckoutV2(prisma));
  await registerExclusiveCheckoutV2(b.app, prisma, prepareApiBrCheckoutV2(prisma));
  try {
    const first = await a.app.inject({ method: "POST", url: path, payload: {} });
    assert.equal(first.statusCode, 403);
    assert.equal(first.json().error, "CHECKOUT_ACCESS_DENIED");
    await shared.store.close();
    for (const h of [a, b]) {
      const closed = await h.app.inject({ method: "POST", url: path, headers: { "x-event-checkout-key": key }, payload: {} });
      assert.equal(closed.statusCode, 503);
      assert.equal(closed.json().error, "CHECKOUT_CLOSED");
    }
    await assert.rejects(registerClosedPublicCheckout(a.app, prisma), /EXCLUSIVE_REPLACEMENT/);
    await waitCheckoutPendingDrain(a.security.pendingRequests, config().requestTimeoutMs);
    await waitCheckoutPendingDrain(b.security.pendingRequests, config().requestTimeoutMs);
  } finally {
    await a.app.close();
    await b.app.close();
  }
});

test("builders install exclusive v2 with operational security and no activation flag", async () => {
  for (const server of ["api-br", "events-api"]) {
    const app = await readFile(new URL(`../../../apps/${server}/src/app.ts`, import.meta.url), "utf8");
    assert.equal(app.includes("checkout-security.operational"), true);
    assert.equal(app.includes("security.fastifyOptions"), true);
    assert.equal(app.includes("security.install(app)"), true);
    assert.equal(app.includes("waitCheckoutPendingDrain"), true);
    assert.equal(app.includes("registerExclusiveCheckoutV2"), true);
    assert.equal(app.includes("checkout-v2.prepared"), true);
    assert.equal(app.includes("registerPublicEventRoutes("), false);
    assert.equal(app.includes("deleteAsaasPayment("), true);
    for (const marker of ["checkout-closure.prepared", "registerClosedPublicCheckout", "CHECKOUT_V2_ENABLED", "origin: true"]) {
      assert.equal(app.includes(marker), false);
    }
    const serverSource = await readFile(new URL(`../../../apps/${server}/src/server.ts`, import.meta.url), "utf8");
    for (const marker of ["checkout-security.operational", "checkout-closure.prepared", "checkout-v2.prepared", "CHECKOUT_V2_ENABLED"]) {
      assert.equal(serverSource.includes(marker), false);
    }
  }
  const entry = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.equal(entry.includes("checkout-security.prepared"), false); assert.equal(entry.includes("checkout-closure.prepared"), false);
  const page = await readFile(new URL("../../../apps/events-admin/app/eventos/[eventId]/page.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("PreparedPublicEventV2"), true);
});
