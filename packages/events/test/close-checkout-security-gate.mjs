import Redis from "ioredis";
import { loadCheckoutSecurityOperational } from "../src/checkout-security.operational.ts";
import { CHECKOUT_SECURITY_GATE_KEY, createRedisCheckoutSecurityStore } from "../src/checkout-security.prepared.ts";

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

if (!process.argv.includes("--close-checkout-gate")) {
  console.error(JSON.stringify({ error: "EXPLICIT_CLOSE_FLAG_REQUIRED" }));
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
  await createRedisCheckoutSecurityStore(redis).close();
  if (await redis.get(CHECKOUT_SECURITY_GATE_KEY) !== "CLOSED") throw new Error("CHECKOUT_SECURITY_UNAVAILABLE");
  console.log(JSON.stringify({ result: "CLOSED", reopened: false, persisted: true }));
} catch {
  console.error(JSON.stringify({ error: "CHECKOUT_SECURITY_UNAVAILABLE" }));
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
