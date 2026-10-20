// Homologation verdict only. Not imported by app.ts/server.ts. Never logs or returns secrets.

export type HomologationBlocker =
  | "ASAAS_CREDENTIALS_MISSING_ON_EVENTS_API"
  | "ASAAS_CREDENTIALS_INCONSISTENT"
  | "ASAAS_WEBHOOK_ABSENT_OR_TOKEN_UNMATCHED"
  | "ASAAS_ACCOUNT_NOT_APPROVED"
  | "ASAAS_READONLY_UNAVAILABLE"
  | "RESEND_API_KEY_MISSING"
  | "RESEND_SENDER_MISSING_OR_INVALID"
  | "RESEND_SENDER_NOT_BARE_EMAIL"
  | "RESEND_DOMAIN_NOT_VERIFIED"
  | "EVENTS_APP_BASE_URL_NOT_HTTPS_PUBLIC"
  | "FRONTEND_API_BASE_URL_MISSING";

export type HomologationDecision =
  | "KEEP_ASAAS_SANDBOX_FOR_HOMOLOG"
  | "ASAAS_WEBHOOK_PUBLIC_HTTPS_URL"
  | "RESEND_VERIFIED_BARE_SENDER"
  | "EVENTS_APP_PUBLIC_HTTPS_URL"
  | "CONFIRM_TEST_PAYMENT_MODE_NOT_AUTO";

type Consistency = "MISSING_IN_ONE_OR_BOTH" | "MATCH" | "DIFFERENT" | string;
type UrlClass = "MISSING" | "UNSAFE_URL" | "HTTPS_PUBLIC" | "HTTP_LOOPBACK" | "OTHER" | "INVALID" | string;

export type ProviderHomologationInput = {
  config: Array<{
    file: string;
    asaas: { environment: string; apiKeyPresent: boolean; webhookTokenPresent: boolean };
    resend: { apiKeyPresent: boolean; senderPresent: boolean; senderAddressValid: boolean; assistedSenderAcceptsSameFrom: boolean };
    participantUrl: UrlClass;
    paymentTestModeConfigured: boolean;
    paymentProviderMode: string;
  }>;
  frontend: Array<{ file: string; publicApiBaseUrl: UrlClass }>;
  consistency: Record<string, Consistency>;
  external: Array<Record<string, unknown>>;
};

export function evaluateCheckoutProviderHomologation(input: ProviderHomologationInput) {
  const blockers = new Set<HomologationBlocker>();
  const decisions = new Set<HomologationDecision>();
  const apis = input.config.filter(item => item.file === "apps/api-br/.env" || item.file === "apps/events-api/.env");
  const apiBr = apis.find(item => item.file === "apps/api-br/.env");
  const eventsApi = apis.find(item => item.file === "apps/events-api/.env");

  if (input.consistency.ASAAS_API_KEY === "DIFFERENT" || input.consistency.ASAAS_WEBHOOK_TOKEN === "DIFFERENT"
    || input.consistency.ASAAS_ENVIRONMENT === "DIFFERENT") blockers.add("ASAAS_CREDENTIALS_INCONSISTENT");
  if (!eventsApi?.asaas.apiKeyPresent || !eventsApi.asaas.webhookTokenPresent) blockers.add("ASAAS_CREDENTIALS_MISSING_ON_EVENTS_API");

  const asaas = input.external.filter(item => item.provider === "asaas");
  if (apiBr?.asaas.apiKeyPresent && asaas.length === 0) blockers.add("ASAAS_READONLY_UNAVAILABLE");
  for (const item of asaas) {
    const account = item.account as Record<string, string> | undefined;
    if (!account || Object.values(account).some(state => state !== "APPROVED")) blockers.add("ASAAS_ACCOUNT_NOT_APPROVED");
    const matches = Array.isArray(item.tokenMatchBySource)
      ? item.tokenMatchBySource.some(entry => entry && typeof entry === "object" && "matches" in entry && entry.matches === true)
      : false;
    if (item.enabledWebhooks !== 1 || item.enabledWebhooksAllHttps !== true || item.interruptedWebhooks !== 0 || !matches) {
      blockers.add("ASAAS_WEBHOOK_ABSENT_OR_TOKEN_UNMATCHED");
    }
    if (item.environment === "sandbox") decisions.add("KEEP_ASAAS_SANDBOX_FOR_HOMOLOG");
    decisions.add("ASAAS_WEBHOOK_PUBLIC_HTTPS_URL");
  }

  if (input.consistency.RESEND_API_KEY !== "MATCH" || apis.some(item => !item.resend.apiKeyPresent)) {
    blockers.add("RESEND_API_KEY_MISSING");
  }
  if (apis.some(item => !item.resend.senderPresent || !item.resend.senderAddressValid)) {
    blockers.add("RESEND_SENDER_MISSING_OR_INVALID");
  } else if (apis.some(item => !item.resend.assistedSenderAcceptsSameFrom)) {
    blockers.add("RESEND_SENDER_NOT_BARE_EMAIL");
  }
  const resend = input.external.filter(item => item.provider === "resend" && item.unauthenticatedConnectivityOnly !== true);
  if (apis.every(item => item.resend.apiKeyPresent) && resend.length === 0) blockers.add("RESEND_DOMAIN_NOT_VERIFIED");
  if (resend.some(item => item.configuredSenderDomainVerified !== true)) blockers.add("RESEND_DOMAIN_NOT_VERIFIED");
  decisions.add("RESEND_VERIFIED_BARE_SENDER");

  if (apis.some(item => item.participantUrl !== "HTTPS_PUBLIC") || input.consistency.EVENTS_APP_BASE_URL !== "MATCH") {
    blockers.add("EVENTS_APP_BASE_URL_NOT_HTTPS_PUBLIC");
  }
  decisions.add("EVENTS_APP_PUBLIC_HTTPS_URL");
  if (input.frontend.some(item => item.publicApiBaseUrl === "MISSING" || item.publicApiBaseUrl === "UNSAFE_URL"
    || item.publicApiBaseUrl === "INVALID")) blockers.add("FRONTEND_API_BASE_URL_MISSING");

  if (apis.some(item => item.paymentTestModeConfigured)) decisions.add("CONFIRM_TEST_PAYMENT_MODE_NOT_AUTO");

  return {
    ready: blockers.size === 0,
    asaasEnvironment: apiBr?.asaas.environment ?? "MISSING",
    blockers: [...blockers],
    decisions: [...decisions]
  };
}
