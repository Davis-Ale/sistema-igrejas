import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { classifyCheckoutPublicHttpsUrl, parseAsaasWebhookPublicUrl } from "../src/checkout-public-https.ts";

test("fixed HTTPS admits named Cloudflare hosts and rejects temporary tunnels and Railway", () => {
  assert.equal(classifyCheckoutPublicHttpsUrl("https://abc.cfargotunnel.com/webhooks/asaas"), "HTTPS_PUBLIC");
  assert.equal(classifyCheckoutPublicHttpsUrl("https://events.example.invalid/webhooks/asaas"), "HTTPS_PUBLIC");
  assert.equal(classifyCheckoutPublicHttpsUrl("https://apt.trycloudflare.com/webhooks/asaas"), "HTTPS_TEMPORARY");
  assert.equal(classifyCheckoutPublicHttpsUrl("https://app.up.railway.app/webhooks/asaas"), "HTTPS_RAILWAY");
  assert.equal(classifyCheckoutPublicHttpsUrl("http://127.0.0.1:3333/webhooks/asaas"), "HTTP_LOOPBACK");
  assert.equal(classifyCheckoutPublicHttpsUrl(undefined), "MISSING");
  assert.equal(parseAsaasWebhookPublicUrl("https://abc.cfargotunnel.com/webhooks/asaas"),
    "https://abc.cfargotunnel.com/webhooks/asaas");
  assert.throws(() => parseAsaasWebhookPublicUrl("https://apt.trycloudflare.com/webhooks/asaas"), /ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS/);
  assert.throws(() => parseAsaasWebhookPublicUrl("https://app.up.railway.app/webhooks/asaas"), /ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS/);
  assert.throws(() => parseAsaasWebhookPublicUrl("https://abc.cfargotunnel.com/other"), /ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS/);
});

test("apply webhook script stays sandbox-only, explicit and unpublished", async () => {
  const source = await readFile(new URL("./apply-checkout-asaas-webhook.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("--apply-asaas-sandbox-webhook"), true);
  assert.equal(source.includes("EXPLICIT_APPLY_WEBHOOK_FLAG_REQUIRED"), true);
  assert.equal(source.includes("parseAsaasWebhookPublicUrl"), true);
  assert.equal(source.includes("published: false"), true);
  assert.equal(source.includes("https://api-sandbox.asaas.com/v3"), true);
  assert.equal(source.includes("trycloudflare"), false);
  assert.equal(source.includes("up.railway.app"), false);
  for (const server of ["api-br", "events-api"]) {
    const app = await readFile(new URL(`../../../apps/${server}/src/app.ts`, import.meta.url), "utf8");
    assert.equal(app.includes("apply-checkout-asaas-webhook"), false);
    assert.equal(app.includes("checkout-public-https"), false);
  }
  const entry = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.equal(entry.includes("checkout-public-https"), false);
});
