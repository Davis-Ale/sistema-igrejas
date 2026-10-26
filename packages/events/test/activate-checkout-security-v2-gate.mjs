import Redis from "ioredis";
import { activateCheckoutSecurityV2Gate, loadCheckoutSecurityOperational } from "../src/checkout-security.operational.ts";
import { CHECKOUT_SECURITY_GATE_KEY } from "../src/checkout-security.prepared.ts";

const present = value => typeof value === "string" && value.trim().length > 0;
const loopback = hostname => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

function adminLoopbackUrl(value) {
  if (!present(value)) throw new Error("CHECKOUT_SECURITY_CONFIGURATION_INVALID");
  const url = new URL(value.trim());
  if (!loopback(url.hostname) || url.username !== "default" || !url.password || url.pathname !== "/0"
    || url.search || url.hash || (url.protocol !== "redis:" && url.protocol !== "rediss:")) {
    throw new Error("CHECKOUT_SECURITY_OPERATIONAL_LOOPBACK_ONLY");
  }
  return value.trim();
}

if (!process.argv.includes("--activate-checkout-v2-gate")) {
  console.error(JSON.stringify({ error: "EXPLICIT_ACTIVATE_V2_FLAG_REQUIRED" }));
  process.exit(1);
}

const loaded = loadCheckoutSecurityOperational(process.env);
const adminUrl = adminLoopbackUrl(process.env.CHECKOUT_REDIS_ADMIN_URL);
const runtime = new URL(loaded.runtimeUrl);
if (!loopback(runtime.hostname)) throw new Error("CHECKOUT_SECURITY_OPERATIONAL_LOOPBACK_ONLY");

const redis = new Redis(adminUrl, {
  lazyConnect: true, enableReadyCheck: false, enableOfflineQueue: false,
  retryStrategy: () => null, maxRetriesPerRequest: 0, connectTimeout: 1000
});
redis.on("error", () => {});
try {
  await redis.connect();
  const before = await redis.get(CHECKOUT_SECURITY_GATE_KEY);
  await activateCheckoutSecurityV2Gate(redis, loaded.policyFingerprint);
  const after = await redis.get(CHECKOUT_SECURITY_GATE_KEY);
  if (after !== `V2:${loaded.policyFingerprint}`) throw new Error("CHECKOUT_SECURITY_UNAVAILABLE");
  console.log(JSON.stringify({
    result: "V2",
    from: before === "CLOSED" ? "CLOSED" : "V2",
    reopenedLegacy: false,
    persisted: true
  }));
} catch (error) {
  const code = error instanceof Error && /^CHECKOUT_[A-Z_]+$/.test(error.message) ? error.message : "CHECKOUT_SECURITY_UNAVAILABLE";
  console.error(JSON.stringify({ error: code }));
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
