import Redis from "ioredis";
import { loadCheckoutSecurityOperational } from "../../../packages/events/src/checkout-security.operational.js";
import { createRedisCheckoutSecurityStore } from "../../../packages/events/src/checkout-security.prepared.js";
import { prepareEventsApiCheckoutSecurity } from "./checkout-security.prepared.js";

// Not imported by app.ts/server.ts. Creates a client only when this function is called.
export function prepareEventsApiCheckoutSecurityOperational(values: Record<string, string | undefined> = process.env) {
  const loaded = loadCheckoutSecurityOperational(values);
  const redis = new Redis(loaded.runtimeUrl, {
    lazyConnect: true, enableReadyCheck: false, enableOfflineQueue: false,
    retryStrategy: () => null, maxRetriesPerRequest: 0, connectTimeout: 1000
  });
  redis.on("error", () => {});
  return { ...prepareEventsApiCheckoutSecurity(loaded.config, createRedisCheckoutSecurityStore(redis)), redis };
}
