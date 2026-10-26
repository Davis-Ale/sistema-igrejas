import {
  CHECKOUT_SECURITY_GATE_KEY, createRedisCheckoutSecurityStore, prepareCheckoutSecurity,
  type CheckoutSecurityConfig, type CheckoutSecurityStore
} from "./checkout-security.prepared.js";

// Operational policy for both builders. Installed over legacy routes; no v2 or closed registrar.
export const CHECKOUT_SECURITY_OPERATIONAL_KEYS = [
  "REDIS_URL", "CHECKOUT_SECURITY_ORIGINS", "CHECKOUT_SECURITY_BUCKET_SECRET",
  "CHECKOUT_SECURITY_WINDOW_MS", "CHECKOUT_SECURITY_IP_LIMIT", "CHECKOUT_SECURITY_CREDENTIAL_LIMIT",
  "CHECKOUT_SECURITY_BODY_LIMIT", "CHECKOUT_SECURITY_STORE_TIMEOUT_MS", "CHECKOUT_SECURITY_REQUEST_TIMEOUT_MS",
  "CHECKOUT_SECURITY_ALLOW_LOCAL_HTTP", "CHECKOUT_SECURITY_HTTPS_ONLY"
] as const;

type Env = Record<string, string | undefined>;
const fail = (): never => { throw new Error("CHECKOUT_SECURITY_CONFIGURATION_INVALID"); };
const present = (value: string | undefined): value is string => typeof value === "string" && value.trim().length > 0;
const loopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
const unusedStore: CheckoutSecurityStore = {
  async consume() { throw new Error("CHECKOUT_SECURITY_UNAVAILABLE"); },
  async close() { throw new Error("CHECKOUT_SECURITY_UNAVAILABLE"); }
};

export function classifyCheckoutRedisUrl(value: string | undefined) {
  if (!present(value)) return "MISSING";
  try {
    const url = new URL(value);
    if (url.search || url.hash) return "UNSAFE_URL";
    const local = loopback(url.hostname);
    if (url.protocol === "rediss:") return local ? "REDISS_LOOPBACK" : "REDISS_PUBLIC";
    if (url.protocol === "redis:" && local) return "REDIS_LOOPBACK";
    return "OTHER";
  } catch { return "INVALID"; }
}

function integer(value: string | undefined) {
  if (!present(value) || !/^[1-9][0-9]*$/.test(value.trim())) return fail();
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fail();
  return parsed;
}

function flag(value: string | undefined): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fail();
}

function runtimeRedisUrl(value: string | undefined) {
  if (!present(value)) return fail();
  let url: URL;
  try { url = new URL(value.trim()); } catch { return fail(); }
  const local = loopback(url.hostname);
  if (url.search || url.hash || url.pathname !== "/0" || url.username !== "checkout_runtime" || !url.password
    || !(url.protocol === "rediss:" || (url.protocol === "redis:" && local))) return fail();
  return value.trim();
}

export function parseCheckoutSecurityOperationalConfig(values: Env): CheckoutSecurityConfig {
  const secret = values.CHECKOUT_SECURITY_BUCKET_SECRET;
  if (typeof secret !== "string" || secret.length < 32 || secret.trim() !== secret) return fail();
  const origins = (values.CHECKOUT_SECURITY_ORIGINS ?? "").split(",").map(origin => origin.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => origin.includes("*"))) return fail();
  return {
    origins,
    allowLocalHttp: flag(values.CHECKOUT_SECURITY_ALLOW_LOCAL_HTTP),
    httpsOnly: flag(values.CHECKOUT_SECURITY_HTTPS_ONLY),
    bucketSecret: secret,
    windowMs: integer(values.CHECKOUT_SECURITY_WINDOW_MS),
    ipLimit: integer(values.CHECKOUT_SECURITY_IP_LIMIT),
    credentialLimit: integer(values.CHECKOUT_SECURITY_CREDENTIAL_LIMIT),
    bodyLimit: integer(values.CHECKOUT_SECURITY_BODY_LIMIT),
    storeTimeoutMs: integer(values.CHECKOUT_SECURITY_STORE_TIMEOUT_MS),
    requestTimeoutMs: integer(values.CHECKOUT_SECURITY_REQUEST_TIMEOUT_MS)
  };
}

export function loadCheckoutSecurityOperational(values: Env) {
  const config = parseCheckoutSecurityOperationalConfig(values);
  const runtimeUrl = runtimeRedisUrl(values.REDIS_URL);
  return { config, runtimeUrl, policyFingerprint: prepareCheckoutSecurity(config, unusedStore).policyFingerprint };
}

export function summarizeCheckoutSecurityOperational(values: Env) {
  return {
    originsPresent: present(values.CHECKOUT_SECURITY_ORIGINS),
    bucketSecretPresent: present(values.CHECKOUT_SECURITY_BUCKET_SECRET),
    windowMsPresent: present(values.CHECKOUT_SECURITY_WINDOW_MS),
    ipLimitPresent: present(values.CHECKOUT_SECURITY_IP_LIMIT),
    credentialLimitPresent: present(values.CHECKOUT_SECURITY_CREDENTIAL_LIMIT),
    bodyLimitPresent: present(values.CHECKOUT_SECURITY_BODY_LIMIT),
    storeTimeoutMsPresent: present(values.CHECKOUT_SECURITY_STORE_TIMEOUT_MS),
    requestTimeoutMsPresent: present(values.CHECKOUT_SECURITY_REQUEST_TIMEOUT_MS),
    allowLocalHttpPresent: present(values.CHECKOUT_SECURITY_ALLOW_LOCAL_HTTP),
    httpsOnlyPresent: present(values.CHECKOUT_SECURITY_HTTPS_ONLY),
    redisUrl: classifyCheckoutRedisUrl(values.REDIS_URL),
    redisAdminUrl: classifyCheckoutRedisUrl(values.CHECKOUT_REDIS_ADMIN_URL)
  };
}

export const CHECKOUT_SECURITY_INIT_LEGACY_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == 'CLOSED' or (type(current) == 'string' and string.sub(current, 1, 3) == 'V2:') then
  return redis.error_reply('CHECKOUT_SECURITY_GATE_CLOSED')
end
if current == false or current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[1])
  return 'OK'
end
return redis.error_reply('CHECKOUT_SECURITY_GATE_MISMATCH')
`;

export const CHECKOUT_SECURITY_ACTIVATE_V2_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then return 'OK' end
if current ~= 'CLOSED' then
  if type(current) == 'string' and string.sub(current, 1, 3) == 'V2:' then
    return redis.error_reply('CHECKOUT_SECURITY_GATE_MISMATCH')
  end
  return redis.error_reply('CHECKOUT_SECURITY_GATE_NOT_CLOSED')
end
redis.call('SET', KEYS[1], ARGV[1])
return 'OK'
`;

export async function initializeCheckoutSecurityLegacyGate(
  redis: { eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown> },
  policyFingerprint: string
) {
  if (!/^[a-f0-9]{64}$/.test(policyFingerprint)) throw new Error("CHECKOUT_SECURITY_CONFIGURATION_INVALID");
  try {
    const result = await redis.eval(
      CHECKOUT_SECURITY_INIT_LEGACY_SCRIPT, 1, CHECKOUT_SECURITY_GATE_KEY, `LEGACY:${policyFingerprint}`
    );
    if (result !== "OK") throw new Error("CHECKOUT_SECURITY_UNAVAILABLE");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("CHECKOUT_SECURITY_GATE_CLOSED")) throw new Error("CHECKOUT_SECURITY_GATE_CLOSED");
    if (message.includes("CHECKOUT_SECURITY_GATE_MISMATCH")) throw new Error("CHECKOUT_SECURITY_GATE_MISMATCH");
    if (message === "CHECKOUT_SECURITY_UNAVAILABLE") throw error;
    throw new Error("CHECKOUT_SECURITY_UNAVAILABLE");
  }
}

export async function activateCheckoutSecurityV2Gate(
  redis: { eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown> },
  policyFingerprint: string
) {
  if (!/^[a-f0-9]{64}$/.test(policyFingerprint)) throw new Error("CHECKOUT_SECURITY_CONFIGURATION_INVALID");
  try {
    const result = await redis.eval(
      CHECKOUT_SECURITY_ACTIVATE_V2_SCRIPT, 1, CHECKOUT_SECURITY_GATE_KEY, `V2:${policyFingerprint}`
    );
    if (result !== "OK") throw new Error("CHECKOUT_SECURITY_UNAVAILABLE");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("CHECKOUT_SECURITY_GATE_NOT_CLOSED")) throw new Error("CHECKOUT_SECURITY_GATE_NOT_CLOSED");
    if (message.includes("CHECKOUT_SECURITY_GATE_MISMATCH")) throw new Error("CHECKOUT_SECURITY_GATE_MISMATCH");
    if (message === "CHECKOUT_SECURITY_UNAVAILABLE") throw error;
    throw new Error("CHECKOUT_SECURITY_UNAVAILABLE");
  }
}

export { createRedisCheckoutSecurityStore };
export { waitCheckoutPendingDrain } from "./checkout-security.containment.js";
