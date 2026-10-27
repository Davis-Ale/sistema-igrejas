import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  classifyCheckoutPublicHttpsUrl,
  parseApiPublicHost,
  parseAsaasWebhookPublicUrl
} from "../src/checkout-public-https.ts";

test("fixed HTTPS admits owned hosts and rejects Cloudflare tunnels, temporary hosts and Railway", () => {
  assert.equal(classifyCheckoutPublicHttpsUrl("https://events.example.invalid/webhooks/asaas"), "HTTPS_PUBLIC");
  assert.equal(classifyCheckoutPublicHttpsUrl("https://abc.cfargotunnel.com/webhooks/asaas"), "HTTPS_TUNNEL");
  assert.equal(classifyCheckoutPublicHttpsUrl("https://apt.trycloudflare.com/webhooks/asaas"), "HTTPS_TUNNEL");
  assert.equal(classifyCheckoutPublicHttpsUrl("https://abc.ngrok-free.app/webhooks/asaas"), "HTTPS_TEMPORARY");
  assert.equal(classifyCheckoutPublicHttpsUrl("https://app.up.railway.app/webhooks/asaas"), "HTTPS_RAILWAY");
  assert.equal(classifyCheckoutPublicHttpsUrl("http://127.0.0.1:3333/webhooks/asaas"), "HTTP_LOOPBACK");
  assert.equal(classifyCheckoutPublicHttpsUrl(undefined), "MISSING");
  assert.equal(parseAsaasWebhookPublicUrl("https://events.example.invalid/webhooks/asaas"),
    "https://events.example.invalid/webhooks/asaas");
  assert.equal(parseApiPublicHost("events.example.invalid"), "events.example.invalid");
  assert.throws(() => parseAsaasWebhookPublicUrl("https://abc.cfargotunnel.com/webhooks/asaas"), /ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS/);
  assert.throws(() => parseAsaasWebhookPublicUrl("https://apt.trycloudflare.com/webhooks/asaas"), /ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS/);
  assert.throws(() => parseAsaasWebhookPublicUrl("https://app.up.railway.app/webhooks/asaas"), /ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS/);
  assert.throws(() => parseApiPublicHost("abc.cfargotunnel.com"), /API_PUBLIC_HOST_NOT_FIXED_HTTPS/);
  assert.throws(() => parseApiPublicHost("https://events.example.invalid"), /API_PUBLIC_HOST_NOT_FIXED_HTTPS/);
});

test("apply webhook script stays sandbox-only, explicit and unpublished", async () => {
  const source = await readFile(new URL("./apply-checkout-asaas-webhook.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("--apply-asaas-sandbox-webhook"), true);
  assert.equal(source.includes("EXPLICIT_APPLY_WEBHOOK_FLAG_REQUIRED"), true);
  assert.equal(source.includes("parseAsaasWebhookPublicUrl"), true);
  assert.equal(source.includes("published: false"), true);
  assert.equal(source.includes("https://api-sandbox.asaas.com/v3"), true);
  assert.equal(source.includes("trycloudflare"), false);
  assert.equal(source.includes("cfargotunnel"), false);
  assert.equal(source.includes("up.railway.app"), false);
  for (const server of ["api-br", "events-api"]) {
    const app = await readFile(new URL(`../../../apps/${server}/src/app.ts`, import.meta.url), "utf8");
    assert.equal(app.includes("apply-checkout-asaas-webhook"), false);
    assert.equal(app.includes("checkout-public-https"), false);
  }
  const entry = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.equal(entry.includes("checkout-public-https"), false);
});

test("API HTTPS overlay stays optional, proxies only public paths and rejects tunnels", async () => {
  const main = await readFile(new URL("../../../docker-compose.yml", import.meta.url), "utf8");
  const overlay = await readFile(new URL("../../../docker-compose.api-https.yml", import.meta.url), "utf8");
  const caddy = await readFile(new URL("../../../deploy/api-https/Caddyfile", import.meta.url), "utf8");
  assert.equal(main.includes("caddy"), false);
  assert.equal(main.includes("api-https"), false);
  assert.match(overlay, /image:\s*caddy:2-alpine/);
  assert.match(overlay, /API_PUBLIC_HOST: \$\{API_PUBLIC_HOST:\?/);
  assert.match(overlay, /CADDY_ACME_EMAIL: \$\{CADDY_ACME_EMAIL:\?/);
  assert.match(overlay, /host\.docker\.internal:3333/);
  assert.match(overlay, /API_PUBLIC_HOST_NOT_FIXED_HTTPS/);
  assert.equal(overlay.includes("cfargotunnel"), true);
  assert.equal(overlay.includes("trycloudflare"), true);
  assert.equal(overlay.includes("railway"), true);
  assert.equal(overlay.includes("cloudflared"), false);
  assert.match(caddy, /path \/health/);
  assert.match(caddy, /path \/webhooks\/asaas/);
  assert.match(caddy, /path \/public\/\*/);
  assert.equal(caddy.includes("/api/"), false);
  assert.equal(caddy.includes("{$API_PUBLIC_HOST}"), true);
});
