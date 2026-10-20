import Redis from "ioredis";
import { loadCheckoutSecurityOperational, initializeCheckoutSecurityLegacyGate } from "../src/checkout-security.operational.ts";

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

if (!process.argv.includes("--initialize-legacy-gate")) {
  console.error(JSON.stringify({ error: "EXPLICIT_INITIALIZE_FLAG_REQUIRED" }));
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
  await initializeCheckoutSecurityLegacyGate(redis, loaded.policyFingerprint);
  console.log(JSON.stringify({ result: "INITIALIZED_OR_IDENTICAL", closed: false }));
} catch (error) {
  const code = error instanceof Error && /^CHECKOUT_[A-Z_]+$/.test(error.message) ? error.message : "CHECKOUT_SECURITY_UNAVAILABLE";
  console.error(JSON.stringify({ error: code }));
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
