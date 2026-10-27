import { parseAsaasWebhookPublicUrl } from "../src/checkout-public-https.ts";

const present = value => typeof value === "string" && value.trim().length > 0;

if (!process.argv.includes("--apply-asaas-sandbox-webhook")) {
  console.error(JSON.stringify({ error: "EXPLICIT_APPLY_WEBHOOK_FLAG_REQUIRED" }));
  process.exit(1);
}

const environment = (process.env.ASAAS_ENVIRONMENT ?? "sandbox").trim().toLowerCase();
if (environment !== "sandbox") {
  console.error(JSON.stringify({ error: "ASAAS_NOT_SANDBOX" }));
  process.exit(1);
}
if (!present(process.env.ASAAS_API_KEY) || !present(process.env.ASAAS_WEBHOOK_TOKEN)) {
  console.error(JSON.stringify({ error: "CHECKOUT_SECURITY_CONFIGURATION_INVALID" }));
  process.exit(1);
}

let url;
try {
  url = parseAsaasWebhookPublicUrl(process.env.ASAAS_WEBHOOK_PUBLIC_URL);
} catch (error) {
  const code = error instanceof Error ? error.message : "ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS";
  console.error(JSON.stringify({ error: code }));
  process.exit(1);
}

const headers = {
  access_token: process.env.ASAAS_API_KEY,
  "Content-Type": "application/json",
  "User-Agent": "SistemaIgrejas-Checkout-Webhook"
};

async function asaas(method, path, body) {
  if (!path.startsWith("/webhooks")) throw new Error("OPERATIONAL_WRITE_NOT_ALLOWED");
  const response = await fetch(`https://api-sandbox.asaas.com/v3${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "error",
    credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("ASAAS_WEBHOOK_APPLY_FAILED");
  }
  return response.json();
}

const listed = await asaas("GET", "/webhooks");
const entries = Array.isArray(listed?.data) ? listed.data : [];
const current = entries.find(entry => entry && typeof entry.id === "string") ?? null;
if (!current) {
  console.error(JSON.stringify({ error: "ASAAS_WEBHOOK_ABSENT" }));
  process.exit(1);
}

const events = Array.isArray(current.events) ? current.events : [];
if (!events.length) {
  console.error(JSON.stringify({ error: "ASAAS_WEBHOOK_APPLY_FAILED" }));
  process.exit(1);
}

const updated = await asaas("PUT", `/webhooks/${encodeURIComponent(current.id)}`, {
  name: typeof current.name === "string" && current.name.trim() ? current.name : "Sistema Igrejas checkout",
  url,
  email: typeof current.email === "string" ? current.email : undefined,
  enabled: true,
  interrupted: false,
  authToken: process.env.ASAAS_WEBHOOK_TOKEN,
  sendType: current.sendType === "NON_SEQUENTIALLY" ? "NON_SEQUENTIALLY" : "SEQUENTIALLY",
  events
});

if (updated?.url !== url || updated?.enabled !== true || updated?.interrupted === true
  || updated?.authToken !== process.env.ASAAS_WEBHOOK_TOKEN) {
  console.error(JSON.stringify({ error: "ASAAS_WEBHOOK_APPLY_FAILED" }));
  process.exit(1);
}

console.log(JSON.stringify({
  result: "APPLIED",
  environment: "sandbox",
  path: "/webhooks/asaas",
  published: false,
  temporary: false,
  interrupted: false,
  tokenMatched: true
}));
