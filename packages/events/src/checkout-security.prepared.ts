import { createHmac, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyServerOptions, FastifyRequest } from "fastify";

// Preparation only: neither production buildApp imports this module.
export const CHECKOUT_PUBLIC_BASES = ["/public/events/:eventId", "/public/churches/:churchSlug/events/:eventSlug"] as const;
export const CHECKOUT_PUBLIC_PATHS = CHECKOUT_PUBLIC_BASES.flatMap(base => [
  `${base}/register`, `${base}/checkout/status`, `${base}/checkout/resume`
]);
export const CHECKOUT_SECURITY_ALLOWED_HEADERS = ["Authorization", "Content-Type", "X-Api-Key", "X-Event-Checkout-Key"];
export const CHECKOUT_SECURITY_REDACTIONS = [
  "req.headers.authorization", 'req.headers["x-api-key"]', 'req.headers["x-event-checkout-key"]',
  "headers.authorization", 'headers["x-api-key"]', 'headers["x-event-checkout-key"]',
  "req.body", "req.query", "req.params", "res.body", "headers", "body", "query", "params", "msg"
];

export type CheckoutSecurityDecision = { closed: boolean; retryAfterMs: number };
export type CheckoutSecurityStore = {
  consume(buckets: Array<{ key: string; limit: number }>, windowMs: number, policyFingerprint: string): Promise<CheckoutSecurityDecision>;
  close(): Promise<void>;
};
export type CheckoutSecurityConfig = {
  origins: readonly string[];
  allowLocalHttp: boolean;
  httpsOnly: boolean;
  bucketSecret: string;
  windowMs: number;
  ipLimit: number;
  credentialLimit: number;
  bodyLimit: number;
  storeTimeoutMs: number;
  requestTimeoutMs: number;
};

// No in-memory production fallback. The already installed Redis client is injected;
// no connection, new dependency, URL discovery or environment read happens here.
type RedisCommands = { eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown> };
const redisRoot = "events:checkout-security:{checkout}:";
export const CHECKOUT_SECURITY_GATE_KEY = `${redisRoot}gate`;
export const CHECKOUT_SECURITY_CONSUME_SCRIPT = `
local gate = redis.call('GET', KEYS[1])
if gate ~= 'LEGACY:' .. ARGV[2] then return {1, 0} end
for i = 2, #KEYS do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('PEXPIRE', KEYS[i], ARGV[1]) end
  local ttl = redis.call('PTTL', KEYS[i])
  if ttl < 0 then return {1, 0} end
  if count > tonumber(ARGV[i + 1]) then return {0, math.max(1, ttl)} end
end
return {0, 0}
`;
export function createRedisCheckoutSecurityStore(redis: RedisCommands): CheckoutSecurityStore {
  return {
    async consume(buckets, windowMs, policyFingerprint) {
      const result = await redis.eval(CHECKOUT_SECURITY_CONSUME_SCRIPT, buckets.length + 1,
        CHECKOUT_SECURITY_GATE_KEY, ...buckets.map(bucket => `${redisRoot}${bucket.key}`), windowMs, policyFingerprint, ...buckets.map(bucket => bucket.limit));
      if (!Array.isArray(result) || result.length !== 2 || ![0, 1].includes(result[0]) ||
        !Number.isSafeInteger(result[1]) || result[1] < 0 || result[1] > windowMs) throw new Error("CHECKOUT_SECURITY_UNAVAILABLE");
      return { closed: result[0] === 1, retryAfterMs: result[1] };
    },
    async close() {
      // Monotonic close. No open/reopen method, local flag or v2 activation path.
      const result = await redis.eval("return redis.call('SET', KEYS[1], 'CLOSED')", 1, CHECKOUT_SECURITY_GATE_KEY);
      if (result !== "OK") throw new Error("CHECKOUT_SECURITY_UNAVAILABLE");
    }
  };
}

function critical(request: FastifyRequest) {
  const path = request.routeOptions.url;
  return !!path && (CHECKOUT_PUBLIC_PATHS.includes(path) ||
    /^\/api\/events\/:eventId\/registrations\/:registrationId\/checkout\/(recovery|revocation)$/.test(path));
}
function positive(value: number) { return Number.isSafeInteger(value) && value > 0; }
async function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("CHECKOUT_SECURITY_UNAVAILABLE")), ms);
  })]); } finally { if (timer) clearTimeout(timer); }
}

export function prepareCheckoutSecurity(config: CheckoutSecurityConfig, store: CheckoutSecurityStore) {
  if (!store || typeof store.consume !== "function" || typeof store.close !== "function" ||
    ![config.windowMs, config.ipLimit, config.credentialLimit, config.bodyLimit, config.storeTimeoutMs, config.requestTimeoutMs].every(positive) ||
    config.storeTimeoutMs > 5000 || config.windowMs > 86400_000 || config.bodyLimit > 1024 * 1024 || config.requestTimeoutMs > 2147483647 ||
    typeof config.allowLocalHttp !== "boolean" || typeof config.httpsOnly !== "boolean" || !Array.isArray(config.origins) ||
    typeof config.bucketSecret !== "string" || config.bucketSecret.length < 32 || !config.origins.length) {
    throw new Error("CHECKOUT_SECURITY_CONFIGURATION_INVALID");
  }
  const origins = new Set(config.origins.map(origin => {
    const url = new URL(origin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== origin || url.username || url.password ||
      !(url.protocol === "https:" || (config.allowLocalHttp && !config.httpsOnly && local && url.protocol === "http:"))) {
      throw new Error("CHECKOUT_SECURITY_CONFIGURATION_INVALID");
    }
    return origin;
  }));
  // Snapshot caller configuration: changing an input object cannot reopen a gate.
  const settings = { ...config };
  const policyFingerprint = createHmac("sha256", settings.bucketSecret).update(JSON.stringify({
    origins: [...origins].sort(), allowLocalHttp: settings.allowLocalHttp, httpsOnly: settings.httpsOnly,
    windowMs: settings.windowMs, ipLimit: settings.ipLimit, credentialLimit: settings.credentialLimit,
    bodyLimit: settings.bodyLimit, storeTimeoutMs: settings.storeTimeoutMs, requestTimeoutMs: settings.requestTimeoutMs
  })).digest("hex");
  const pending = new Set<FastifyRequest>();
  const executing = new Set<FastifyRequest>();
  const fastifyOptions: FastifyServerOptions = {
    trustProxy: false,
    requestIdHeader: false,
    requestTimeout: settings.requestTimeoutMs,
    genReqId: () => randomUUID(),
    logger: {
      redact: { paths: [...CHECKOUT_SECURITY_REDACTIONS], remove: true },
      serializers: {
        req: request => ({ method: request.method }),
        res: reply => ({ statusCode: reply.statusCode }),
        err: () => ({ type: "Error", message: "Request failed", stack: "" })
      }
    }
  };
  const corsOptions = {
    origin: (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) => callback(null, origin !== undefined && origins.has(origin)),
    credentials: false, methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [...CHECKOUT_SECURITY_ALLOWED_HEADERS], exposedHeaders: ["Retry-After"],
    strictPreflight: true, maxAge: 0
  };
  return {
    fastifyOptions, corsOptions, policyFingerprint,
    pendingRequests: () => pending.size,
    close: () => bounded(store.close(), settings.storeTimeoutMs),
    install(app: FastifyInstance) {
      // Must run at root BEFORE CORS and all route registration. This is deliberately
      // not fastify.register(): encapsulating it would leave sibling routes unguarded.
      app.addHook("onRoute", route => {
        if (CHECKOUT_PUBLIC_PATHS.includes(route.url) || route.url.endsWith("/checkout/recovery") || route.url.endsWith("/checkout/revocation")) {
          route.bodyLimit = settings.bodyLimit;
          const handler = route.handler;
          route.handler = async function(request, reply) {
            executing.add(request);
            try { return await handler.call(this, request, reply); }
            finally { executing.delete(request); pending.delete(request); }
          };
        }
      });
      app.addHook("onSend", async (request, reply, payload) => {
        reply.header("X-Content-Type-Options", "nosniff");
        reply.header("Referrer-Policy", "no-referrer");
        reply.header("X-Frame-Options", "DENY");
        reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        if (settings.httpsOnly) reply.header("Strict-Transport-Security", "max-age=31536000");
        if (critical(request)) reply.header("Cache-Control", "no-store");
        return payload;
      });
      const parentErrorHandler = app.errorHandler;
      app.setErrorHandler((error, request, reply) => {
        if (!critical(request)) return parentErrorHandler(error, request, reply);
        const code = error instanceof Error && "statusCode" in error ? error.statusCode : undefined;
        const status = typeof code === "number" && [400, 401, 403, 404, 409, 413, 415, 429, 503].includes(code) ? code : 500;
        return reply.code(status).send({ error: status === 500 ? "INTERNAL_SERVER_ERROR" : "CHECKOUT_REQUEST_INVALID", message: "Não foi possível concluir esta operação de checkout." });
      });
      app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "NOT_FOUND" }));
      app.addHook("onRequest", async (request, reply) => {
        const origin = request.headers.origin;
        if (origin !== undefined && !origins.has(origin)) return reply.code(403).send({ error: "ORIGIN_DENIED" });
        if (!critical(request) || request.method === "OPTIONS") return;
        // The existing backend remains responsible for JWT/RBAC and capability
        // validation. CORS, quotas and this gate never authorize a registration.
        if (request.raw.url?.includes("?")) return reply.code(400).send({ error: "CHECKOUT_QUERY_NOT_ALLOWED" });
        pending.add(request);
        const digest = (value: string) => createHmac("sha256", settings.bucketSecret).update(value).digest("hex");
        // One IP budget for all aliases/actions/events/APIs. Forged forwarded IP,
        // route IDs, contacts and caller tenant cannot create a fresh budget.
        const buckets = [{ key: `ip:${digest(request.ip)}`, limit: settings.ipLimit }];
        const key = request.headers["x-event-checkout-key"];
        if (typeof key === "string" && /^ec2_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(key)) {
          buckets.push({ key: `capability:${digest(key)}`, limit: settings.credentialLimit });
        }
        try {
          const result = await bounded(store.consume(buckets, settings.windowMs, policyFingerprint), settings.storeTimeoutMs);
          if (result.closed) { pending.delete(request); return reply.code(503).send({ error: "CHECKOUT_CLOSED" }); }
          if (result.retryAfterMs > 0) { pending.delete(request); return reply.header("Retry-After", Math.max(1, Math.ceil(result.retryAfterMs / 1000))).code(429).send({ error: "CHECKOUT_RATE_LIMITED" }); }
        } catch { pending.delete(request); return reply.code(503).send({ error: "CHECKOUT_SECURITY_UNAVAILABLE" }); }
      });
      const release = (request: FastifyRequest) => { if (!executing.has(request)) pending.delete(request); };
      app.addHook("onResponse", async request => release(request));
      // An abort/timeout is not evidence that DB/provider work stopped. A handler
      // still executing remains pending until its finally; do not fake a drain.
    }
  };
}
