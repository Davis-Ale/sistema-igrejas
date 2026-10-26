import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { prepareApiBrCheckoutSecurity } from "../../../apps/api-br/src/checkout-security.prepared.ts";
import { prepareEventsApiCheckoutSecurity } from "../../../apps/events-api/src/checkout-security.prepared.ts";
import {
  classifyCheckoutRedisUrl, initializeCheckoutSecurityLegacyGate, loadCheckoutSecurityOperational,
  parseCheckoutSecurityOperationalConfig, summarizeCheckoutSecurityOperational
} from "../src/checkout-security.operational.ts";
import { CHECKOUT_SECURITY_GATE_KEY } from "../src/checkout-security.prepared.ts";

const valid = (): Record<string, string> => ({
  REDIS_URL: "redis://checkout_runtime:operational-runtime-secret@127.0.0.1:55439/0",
  CHECKOUT_SECURITY_ORIGINS: "https://checkout.example.invalid,https://events.example.invalid",
  CHECKOUT_SECURITY_BUCKET_SECRET: "synthetic-operational-bucket-secret-32ch",
  CHECKOUT_SECURITY_WINDOW_MS: "60000",
  CHECKOUT_SECURITY_IP_LIMIT: "100",
  CHECKOUT_SECURITY_CREDENTIAL_LIMIT: "50",
  CHECKOUT_SECURITY_BODY_LIMIT: "4096",
  CHECKOUT_SECURITY_STORE_TIMEOUT_MS: "100",
  CHECKOUT_SECURITY_REQUEST_TIMEOUT_MS: "10000",
  CHECKOUT_SECURITY_ALLOW_LOCAL_HTTP: "false",
  CHECKOUT_SECURITY_HTTPS_ONLY: "true"
});

test("operational parser rejects missing, unsafe or production-default-like values and never returns secrets", () => {
  const env = valid();
  const loaded = loadCheckoutSecurityOperational(env);
  assert.match(loaded.policyFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(loaded.config.origins.length, 2);
  assert.equal(classifyCheckoutRedisUrl(env.REDIS_URL), "REDIS_LOOPBACK");
  assert.equal(classifyCheckoutRedisUrl("rediss://checkout_runtime:secret@redis.example.invalid/0"), "REDISS_PUBLIC");
  assert.equal(classifyCheckoutRedisUrl("redis://checkout_runtime:secret@redis.example.invalid/0"), "OTHER");
  assert.equal(classifyCheckoutRedisUrl("rediss://checkout_runtime:secret@host.invalid/0?extra=1"), "UNSAFE_URL");
  const summary = summarizeCheckoutSecurityOperational({
    ...env, REDIS_URL: "rediss://checkout_runtime:private-redis@private.host/0",
    CHECKOUT_SECURITY_BUCKET_SECRET: "private-operational-secret-32-characters"
  });
  const serialized = JSON.stringify(summary);
  for (const marker of ["private-redis", "private.host", "private-operational", env.REDIS_URL]) {
    assert.equal(serialized.includes(marker), false);
  }
  for (const patch of [
    { REDIS_URL: undefined },
    { REDIS_URL: "redis://checkout_runtime:secret@example.invalid/0" },
    { REDIS_URL: "redis://other:secret@127.0.0.1:55439/0" },
    { CHECKOUT_SECURITY_BUCKET_SECRET: "short" },
    { CHECKOUT_SECURITY_ORIGINS: "https://*.example.invalid" },
    { CHECKOUT_SECURITY_ORIGINS: "http://example.invalid" },
    { CHECKOUT_SECURITY_IP_LIMIT: "0" },
    { CHECKOUT_SECURITY_ALLOW_LOCAL_HTTP: "yes" },
    { CHECKOUT_SECURITY_HTTPS_ONLY: undefined }
  ]) {
    assert.throws(() => loadCheckoutSecurityOperational({ ...env, ...patch }), /CHECKOUT_SECURITY_CONFIGURATION_INVALID/);
  }
});

test("the same operational env produces one policy fingerprint for both prepared APIs", () => {
  const config = parseCheckoutSecurityOperationalConfig(valid());
  const unused = { async consume() { return { closed: true, retryAfterMs: 0 }; }, async close() {} };
  const apiBr = prepareApiBrCheckoutSecurity(config, unused);
  const eventsApi = prepareEventsApiCheckoutSecurity(config, unused);
  assert.equal(apiBr.policyFingerprint, eventsApi.policyFingerprint);
  assert.equal(apiBr.policyFingerprint, loadCheckoutSecurityOperational(valid()).policyFingerprint);
  const other = parseCheckoutSecurityOperationalConfig({ ...valid(), CHECKOUT_SECURITY_IP_LIMIT: "99" });
  assert.notEqual(prepareApiBrCheckoutSecurity(other, unused).policyFingerprint, apiBr.policyFingerprint);
});

test("legacy gate init is idempotent for the same fingerprint and never overwrites CLOSED", async () => {
  const stored: string[] = [];
  const redis = { async eval(_script: string, _keys: number, key: string | number, value?: string | number) {
    assert.equal(key, CHECKOUT_SECURITY_GATE_KEY);
    if (stored[0] === "CLOSED") throw new Error("CHECKOUT_SECURITY_GATE_CLOSED");
    if (!stored.length || stored[0] === value) { stored[0] = String(value); return "OK"; }
    throw new Error("CHECKOUT_SECURITY_GATE_MISMATCH");
  } };
  const fingerprint = loadCheckoutSecurityOperational(valid()).policyFingerprint;
  await initializeCheckoutSecurityLegacyGate(redis, fingerprint);
  await initializeCheckoutSecurityLegacyGate(redis, fingerprint);
  assert.equal(stored[0], `LEGACY:${fingerprint}`);
  stored[0] = "CLOSED";
  await assert.rejects(initializeCheckoutSecurityLegacyGate(redis, fingerprint), /CHECKOUT_SECURITY_GATE_CLOSED/);
  await assert.rejects(initializeCheckoutSecurityLegacyGate(redis, "not-a-fingerprint"), /CHECKOUT_SECURITY_CONFIGURATION_INVALID/);
});

test("builders import exclusive v2 with operational security; entrypoints stay without flags or closure registrar", async () => {
  for (const server of ["api-br", "events-api"]) {
    const app = await readFile(new URL(`../../../apps/${server}/src/app.ts`, import.meta.url), "utf8");
    assert.equal(app.includes("checkout-security.operational"), true);
    assert.equal(app.includes("checkout-v2.prepared"), true);
    assert.equal(app.includes("registerExclusiveCheckoutV2"), true);
    for (const marker of ["CHECKOUT_V2_ENABLED", "checkout-closure.prepared", "registerClosedPublicCheckout"]) {
      assert.equal(app.includes(marker), false);
    }
    const serverSource = await readFile(new URL(`../../../apps/${server}/src/server.ts`, import.meta.url), "utf8");
    for (const marker of ["checkout-security.operational", "checkout-v2.prepared", "CHECKOUT_V2_ENABLED"]) {
      assert.equal(serverSource.includes(marker), false);
    }
  }
  const entry = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.equal(entry.includes("checkout-security.operational"), false);
  const page = await readFile(new URL("../../../apps/events-admin/app/eventos/[eventId]/page.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("PreparedPublicEventV2"), true);
});

test("coordinated close script requires an explicit flag, stays loopback-admin and is not imported by builders", async () => {
  const source = await readFile(new URL("./close-checkout-security-gate.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("--close-checkout-gate"), true);
  assert.equal(source.includes("EXPLICIT_CLOSE_FLAG_REQUIRED"), true);
  assert.equal(source.includes(".close()"), true);
  assert.equal(source.includes("reopened: false"), true);
  assert.equal(source.includes("persisted: true"), true);
  assert.equal(source.includes("CHECKOUT_SECURITY_GATE_KEY"), true);
  assert.equal(source.includes("CHECKOUT_SECURITY_OPERATIONAL_LOOPBACK_ONLY"), true);
  assert.equal(source.includes("initializeCheckoutSecurityLegacyGate"), false);
  for (const server of ["api-br", "events-api"]) {
    const app = await readFile(new URL(`../../../apps/${server}/src/app.ts`, import.meta.url), "utf8");
    assert.equal(app.includes("close-checkout-security-gate"), false);
  }
});

test("default compose stays PostgreSQL-only and the checkout Redis overlay stays loopback", async () => {
  const main = await readFile(new URL("../../../docker-compose.yml", import.meta.url), "utf8");
  assert.equal(main.includes("redis"), false);
  const overlay = await readFile(new URL("../../../docker-compose.checkout-redis.yml", import.meta.url), "utf8");
  assert.match(overlay, /image:\s*redis:7-alpine/);
  assert.match(overlay, /127\.0\.0\.1:55439:6379/);
  assert.match(overlay, /appendfsync always/);
  assert.match(overlay, /checkout_runtime on >%s ~events:checkout-security:\{checkout\}:\* \+ping \+get \+incr \+pexpire \+pttl \+eval/);
  assert.equal(/checkout_runtime[^\n]*\+set/.test(overlay), false);
  assert.match(overlay, /CHECKOUT_REDIS_PASSWORD: \$\{CHECKOUT_REDIS_PASSWORD:\?/);
  assert.match(overlay, /CHECKOUT_REDIS_RUNTIME_PASSWORD: \$\{CHECKOUT_REDIS_RUNTIME_PASSWORD:\?/);
});
