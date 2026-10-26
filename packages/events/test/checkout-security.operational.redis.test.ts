import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Redis from "ioredis";
import { prepareApiBrCheckoutSecurityOperational } from "../../../apps/api-br/src/checkout-security.operational.ts";
import { prepareEventsApiCheckoutSecurityOperational } from "../../../apps/events-api/src/checkout-security.operational.ts";
import { activateCheckoutSecurityV2Gate, initializeCheckoutSecurityLegacyGate, loadCheckoutSecurityOperational } from "../src/checkout-security.operational.ts";
import { CHECKOUT_SECURITY_GATE_KEY } from "../src/checkout-security.prepared.ts";
import { waitCheckoutPendingDrain } from "../src/checkout-security.containment.ts";

function guardedUrl(value: string | undefined, user: string) {
  assert.ok(value, "Explicit isolated Redis URL required");
  const url = new URL(value);
  assert.equal(url.protocol, "redis:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55438");
  assert.equal(url.pathname, "/0"); assert.equal(url.username, user); assert.match(url.password, /^[a-f0-9]{64}$/);
  assert.equal(process.env.REDIS_URL, undefined); assert.equal(process.env.DATABASE_URL, undefined);
  return value;
}

const runtimeUrl = guardedUrl(process.env.CHECKOUT_REDIS_TEST_URL, "checkout_runtime");
const adminUrl = guardedUrl(process.env.CHECKOUT_REDIS_TEST_ADMIN_URL, "default");
const env = {
  REDIS_URL: runtimeUrl,
  CHECKOUT_SECURITY_ORIGINS: "https://checkout.example.invalid",
  CHECKOUT_SECURITY_BUCKET_SECRET: "synthetic-cut6-redis-bucket-secret-32-characters",
  CHECKOUT_SECURITY_WINDOW_MS: "1000",
  CHECKOUT_SECURITY_IP_LIMIT: "2",
  CHECKOUT_SECURITY_CREDENTIAL_LIMIT: "1",
  CHECKOUT_SECURITY_BODY_LIMIT: "4096",
  CHECKOUT_SECURITY_STORE_TIMEOUT_MS: "100",
  CHECKOUT_SECURITY_REQUEST_TIMEOUT_MS: "10000",
  CHECKOUT_SECURITY_ALLOW_LOCAL_HTTP: "false",
  CHECKOUT_SECURITY_HTTPS_ONLY: "true"
};
const options = { lazyConnect: true, enableReadyCheck: false, enableOfflineQueue: false, retryStrategy: () => null,
  maxRetriesPerRequest: 0, connectTimeout: 1000 };

let admin: Redis;
const clients: Array<{ redis: Redis; close: () => Promise<void> }> = [];
before(async () => {
  admin = new Redis(adminUrl, options); admin.on("error", () => {}); await admin.connect();
  await admin.del(CHECKOUT_SECURITY_GATE_KEY);
});
after(() => { clients.forEach(client => client.redis.disconnect()); admin?.disconnect(); });

test("operational wrappers share one fingerprint and one real Redis budget after CLOSED→V2", async () => {
  const loaded = loadCheckoutSecurityOperational(env);
  await admin.set(CHECKOUT_SECURITY_GATE_KEY, "CLOSED");
  await activateCheckoutSecurityV2Gate(admin, loaded.policyFingerprint);
  const a = prepareEventsApiCheckoutSecurityOperational(env);
  const b = prepareApiBrCheckoutSecurityOperational(env);
  clients.push(a, b);
  assert.equal(a.policyFingerprint, b.policyFingerprint);
  assert.equal(a.policyFingerprint, loaded.policyFingerprint);
  await a.redis.connect(); await b.redis.connect();
  const route = "/public/events/:eventId/register";
  const install = async (security: typeof a) => {
    const Fastify = (await import("fastify")).default;
    const app = Fastify({ ...security.fastifyOptions, logger: false });
    await security.install(app);
    let calls = 0;
    app.post(route, async () => { calls++; return { ok: true }; });
    return { app, calls: () => calls };
  };
  const left = await install(a), right = await install(b);
  try {
    const replies = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? left : right).app.inject({
      method: "POST", url: `/public/events/synthetic-${i}/register`, payload: {}, remoteAddress: "203.0.113.40"
    })));
    assert.equal(replies.filter(reply => reply.statusCode === 200).length, 2);
    assert.equal(replies.filter(reply => reply.statusCode === 429).length, 4);
    assert.equal(left.calls() + right.calls(), 2);
  } finally { await left.app.close(); await right.app.close(); }
});

test("operational init refuses CLOSED and runtime ACL still cannot write keys outside the namespace", async () => {
  const a = prepareApiBrCheckoutSecurityOperational(env);
  clients.push(a);
  await a.redis.connect();
  await a.close();
  await assert.rejects(
    initializeCheckoutSecurityLegacyGate(admin, a.policyFingerprint),
    /CHECKOUT_SECURITY_GATE_CLOSED/
  );
  assert.equal(await admin.get(CHECKOUT_SECURITY_GATE_KEY), "CLOSED");
  await assert.rejects(a.redis.get("outside-checkout-namespace"), /NOPERM/);
});

function runScript(file: string, flag: string) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const safeEnv = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE"]
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(process.execPath, ["--import", "tsx", path.join(root, "packages/events/test", file), flag], {
      cwd: root,
      env: { ...safeEnv, ...env, REDIS_URL: runtimeUrl, CHECKOUT_REDIS_ADMIN_URL: adminUrl },
      encoding: "utf8"
    }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(new Error(stderr || error.message), { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

test("admin close script persists CLOSED for both APIs, drain finishes in-flight work, and rollback cannot reopen", async () => {
  const loaded = loadCheckoutSecurityOperational(env);
  await admin.set(CHECKOUT_SECURITY_GATE_KEY, "CLOSED");
  await activateCheckoutSecurityV2Gate(admin, loaded.policyFingerprint);
  const a = prepareEventsApiCheckoutSecurityOperational(env);
  const b = prepareApiBrCheckoutSecurityOperational(env);
  clients.push(a, b);
  await a.redis.connect(); await b.redis.connect();
  const route = "/public/events/:eventId/register";
  const install = async (security: typeof a) => {
    const Fastify = (await import("fastify")).default;
    const app = Fastify({ ...security.fastifyOptions, logger: false });
    await security.install(app);
    let finish!: () => void;
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    app.post(route, async () => { started(); await blocked; return { ok: true }; });
    return { app, security, finish: () => finish(), entered };
  };
  const left = await install(a), right = await install(b);
  try {
    const ongoing = left.app.inject({ method: "POST", url: "/public/events/containment-a/register", payload: {} });
    void ongoing.then(() => undefined); await left.entered;
    const closed = await runScript("close-checkout-security-gate.mjs", "--close-checkout-gate");
    assert.match(closed.stdout, /"result":"CLOSED"/);
    assert.match(closed.stdout, /"reopened":false/);
    assert.match(closed.stdout, /"persisted":true/);
    assert.equal(await admin.get(CHECKOUT_SECURITY_GATE_KEY), "CLOSED");
    assert.equal(left.security.pendingRequests(), 1);
    assert.equal((await right.app.inject({ method: "POST", url: "/public/events/containment-b/register", payload: {} })).statusCode, 503);
    await assert.rejects(initializeCheckoutSecurityLegacyGate(admin, loaded.policyFingerprint), /CHECKOUT_SECURITY_GATE_CLOSED/);
    left.finish();
    assert.equal((await ongoing).statusCode, 200);
    await waitCheckoutPendingDrain(left.security.pendingRequests, 1000);
    assert.equal(left.security.pendingRequests(), 0);
    await admin.del(CHECKOUT_SECURITY_GATE_KEY);
    assert.equal((await left.app.inject({ method: "POST", url: "/public/events/containment-c/register", payload: {} })).statusCode, 503);
    assert.equal(await admin.get(CHECKOUT_SECURITY_GATE_KEY), null);
  } finally { left.finish(); await left.app.close(); await right.app.close(); }
});

test("admin V2 script activates only from CLOSED, shares fingerprint and refuses LEGACY reopen", async () => {
  const loaded = loadCheckoutSecurityOperational(env);
  await admin.del(CHECKOUT_SECURITY_GATE_KEY);
  await assert.rejects(
    runScript("activate-checkout-security-v2-gate.mjs", "--activate-checkout-v2-gate"),
    /CHECKOUT_SECURITY_GATE_NOT_CLOSED/
  );
  await initializeCheckoutSecurityLegacyGate(admin, loaded.policyFingerprint);
  await assert.rejects(
    runScript("activate-checkout-security-v2-gate.mjs", "--activate-checkout-v2-gate"),
    /CHECKOUT_SECURITY_GATE_NOT_CLOSED/
  );
  await admin.set(CHECKOUT_SECURITY_GATE_KEY, "CLOSED");
  const activated = await runScript("activate-checkout-security-v2-gate.mjs", "--activate-checkout-v2-gate");
  assert.match(activated.stdout, /"result":"V2"/);
  assert.match(activated.stdout, /"from":"CLOSED"/);
  assert.match(activated.stdout, /"reopenedLegacy":false/);
  assert.match(activated.stdout, /"persisted":true/);
  assert.equal(activated.stdout.includes(loaded.policyFingerprint), false);
  assert.equal(await admin.get(CHECKOUT_SECURITY_GATE_KEY), `V2:${loaded.policyFingerprint}`);
  const again = await runScript("activate-checkout-security-v2-gate.mjs", "--activate-checkout-v2-gate");
  assert.match(again.stdout, /"from":"V2"/);
  await assert.rejects(initializeCheckoutSecurityLegacyGate(admin, loaded.policyFingerprint), /CHECKOUT_SECURITY_GATE_CLOSED/);
  const a = prepareApiBrCheckoutSecurityOperational(env);
  clients.push(a);
  await a.redis.connect();
  const Fastify = (await import("fastify")).default;
  const app = Fastify({ ...a.fastifyOptions, logger: false });
  await a.install(app);
  app.post("/public/events/:eventId/register", async () => ({ ok: true }));
  try {
    assert.equal((await app.inject({ method: "POST", url: "/public/events/v2-admit/register", payload: {} })).statusCode, 200);
    await a.close();
    assert.equal(await admin.get(CHECKOUT_SECURITY_GATE_KEY), "CLOSED");
    assert.equal((await app.inject({ method: "POST", url: "/public/events/v2-closed/register", payload: {} })).statusCode, 503);
    await assert.rejects(initializeCheckoutSecurityLegacyGate(admin, loaded.policyFingerprint), /CHECKOUT_SECURITY_GATE_CLOSED/);
  } finally { await app.close(); }
});
