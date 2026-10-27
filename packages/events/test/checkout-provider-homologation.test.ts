import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { evaluateCheckoutProviderHomologation } from "../src/checkout-provider-homologation.ts";

const api = (file: string, patch: Record<string, unknown> = {}) => ({
  file,
  asaas: { environment: "sandbox", apiKeyPresent: true, webhookTokenPresent: true },
  resend: { apiKeyPresent: true, senderPresent: true, senderAddressValid: true, assistedSenderAcceptsSameFrom: true },
  participantUrl: "HTTPS_PUBLIC",
  paymentTestModeConfigured: false,
  paymentProviderMode: "EXTERNAL_OR_DEFAULT",
  ...patch
});

const ready = () => ({
  config: [api("apps/api-br/.env"), api("apps/events-api/.env")],
  frontend: [{ file: "apps/events-admin/.env.local", publicApiBaseUrl: "HTTPS_PUBLIC" },
    { file: "apps/web-br/.env.local", publicApiBaseUrl: "HTTP_LOOPBACK" }],
  consistency: {
    ASAAS_API_KEY: "MATCH", ASAAS_ENVIRONMENT: "MATCH", ASAAS_WEBHOOK_TOKEN: "MATCH",
    RESEND_API_KEY: "MATCH", EVENTS_EMAIL_FROM: "MATCH", EVENTS_APP_BASE_URL: "MATCH"
  },
  external: [
    { provider: "asaas", environment: "sandbox", enabledWebhooks: 1, enabledWebhooksAllHttps: true,
      enabledWebhookUrlClasses: ["HTTPS_PUBLIC"],
      interruptedWebhooks: 0, account: { general: "APPROVED", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED", documentation: "APPROVED" },
      tokenMatchBySource: [{ source: "apps/api-br/.env", matches: true }] },
    { provider: "resend", configuredSenderDomainVerified: true }
  ]
});

test("homologation verdict stays ready only when both APIs, webhook, sender and public URL classify as complete", () => {
  const ok = evaluateCheckoutProviderHomologation(ready());
  assert.equal(ok.ready, true);
  assert.deepEqual(ok.blockers, []);
  assert.ok(ok.decisions.includes("KEEP_ASAAS_SANDBOX_FOR_HOMOLOG"));
});

test("current local gaps become explicit blockers without leaking secrets or URLs", () => {
  const verdict = evaluateCheckoutProviderHomologation({
    config: [
      api("apps/api-br/.env", { resend: { apiKeyPresent: false, senderPresent: false, senderAddressValid: false, assistedSenderAcceptsSameFrom: false },
        participantUrl: "MISSING", paymentTestModeConfigured: true }),
      api("apps/events-api/.env", { asaas: { environment: "sandbox", apiKeyPresent: false, webhookTokenPresent: false },
        resend: { apiKeyPresent: false, senderPresent: false, senderAddressValid: false, assistedSenderAcceptsSameFrom: false },
        participantUrl: "MISSING" })
    ],
    frontend: [{ file: "apps/events-admin/.env.local", publicApiBaseUrl: "MISSING" },
      { file: "apps/web-br/.env.local", publicApiBaseUrl: "MISSING" }],
    consistency: {
      ASAAS_API_KEY: "MISSING_IN_ONE_OR_BOTH", ASAAS_ENVIRONMENT: "MATCH", ASAAS_WEBHOOK_TOKEN: "MISSING_IN_ONE_OR_BOTH",
      RESEND_API_KEY: "MISSING_IN_ONE_OR_BOTH", EVENTS_EMAIL_FROM: "MISSING_IN_ONE_OR_BOTH", EVENTS_APP_BASE_URL: "MISSING_IN_ONE_OR_BOTH"
    },
    external: [
      { provider: "asaas", environment: "sandbox", enabledWebhooks: 0, enabledWebhooksAllHttps: null, interruptedWebhooks: 0,
        account: { general: "APPROVED", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED", documentation: "APPROVED" },
        tokenMatchBySource: [{ source: "apps/api-br/.env", matches: false }] },
      { provider: "resend", unauthenticatedConnectivityOnly: true, authenticatedAccountVerified: false }
    ]
  });
  assert.equal(verdict.ready, false);
  for (const code of [
    "ASAAS_CREDENTIALS_MISSING_ON_EVENTS_API", "ASAAS_WEBHOOK_ABSENT_OR_TOKEN_UNMATCHED",
    "RESEND_API_KEY_MISSING", "RESEND_SENDER_MISSING_OR_INVALID",
    "EVENTS_APP_BASE_URL_NOT_HTTPS_PUBLIC", "FRONTEND_API_BASE_URL_MISSING"
  ]) assert.ok(verdict.blockers.includes(code), code);
  const serialized = JSON.stringify(verdict);
  for (const marker of ["private-", "http://", "@", "asaas.com", "resend.dev"]) assert.equal(serialized.includes(marker), false);
  assert.ok(verdict.decisions.includes("CONFIRM_TEST_PAYMENT_MODE_NOT_AUTO"));
  assert.ok(verdict.decisions.includes("ASAAS_WEBHOOK_PUBLIC_HTTPS_URL"));
  assert.ok(verdict.decisions.includes("RESEND_VERIFIED_BARE_SENDER"));
});

test("temporary, tunnel or Railway webhook HTTPS is a homologation blocker", () => {
  for (const urlClass of ["HTTPS_TEMPORARY", "HTTPS_TUNNEL", "HTTPS_RAILWAY"]) {
    const input = ready();
    input.external[0] = { ...input.external[0], enabledWebhookUrlClasses: [urlClass], enabledWebhooksAllHttps: false };
    const verdict = evaluateCheckoutProviderHomologation(input);
    assert.ok(verdict.blockers.includes("ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS"), urlClass);
  }
});

test("display-name sender is a homologation blocker because assisted recovery requires a bare email", () => {
  const input = ready();
  input.config = input.config.map(item => ({ ...item, resend: { ...item.resend, assistedSenderAcceptsSameFrom: false } }));
  const verdict = evaluateCheckoutProviderHomologation(input);
  assert.deepEqual(verdict.blockers, ["RESEND_SENDER_NOT_BARE_EMAIL"]);
});

test("builders and public page do not import provider homologation", async () => {
  for (const server of ["api-br", "events-api"]) for (const file of ["app.ts", "server.ts"]) {
    const source = await readFile(new URL(`../../../apps/${server}/src/${file}`, import.meta.url), "utf8");
    assert.equal(source.includes("checkout-provider-homologation"), false);
  }
});
