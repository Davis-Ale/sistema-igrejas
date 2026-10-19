import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const present = value => typeof value === 'string' && value.trim().length > 0;
const classifyUrl = value => {
  if (!present(value)) return 'MISSING';
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return 'UNSAFE_URL';
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return url.protocol === 'https:' && !local ? 'HTTPS_PUBLIC' : url.protocol === 'http:' && local ? 'HTTP_LOOPBACK' : 'OTHER';
  } catch { return 'INVALID'; }
};
const senderAddress = value => /<([^<>]+)>/.exec(value ?? '')?.[1] ?? value?.trim();
const senderDomain = value => /^[^\s@]+@([^\s@]+)$/.exec(senderAddress(value) ?? '')?.[1]?.toLowerCase();

export function summarizeConfig(values) {
  const environment = values.ASAAS_ENVIRONMENT?.trim().toLowerCase();
  return {
    asaas: { environment: !environment ? 'MISSING_DEFAULTS_SANDBOX' : ['sandbox', 'production'].includes(environment) ? environment : 'INVALID_DEFAULTS_SANDBOX',
      apiKeyPresent: present(values.ASAAS_API_KEY), webhookTokenPresent: present(values.ASAAS_WEBHOOK_TOKEN) },
    resend: { apiKeyPresent: present(values.RESEND_API_KEY), senderPresent: present(values.EVENTS_EMAIL_FROM),
      senderHasDisplayName: /<[^<>]+>/.test(values.EVENTS_EMAIL_FROM ?? ''), senderAddressValid: !!senderDomain(values.EVENTS_EMAIL_FROM),
      assistedSenderAcceptsSameFrom: /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(values.EVENTS_EMAIL_FROM ?? '') },
    participantUrl: classifyUrl(values.EVENTS_APP_BASE_URL), databaseUrlPresent: present(values.DATABASE_URL),
    redisUrlPresent: present(values.REDIS_URL), redisTls: present(values.REDIS_URL) ? values.REDIS_URL.startsWith('rediss://') : null,
    jwtSecretPresent: present(values.JWT_SECRET), paymentTestModeConfigured: present(values.EVENTS_TEST_PAYMENT_MODE),
    paymentProviderMode: ['auto', 'pending'].includes(values.EVENTS_TEST_PAYMENT_MODE?.trim().toLowerCase()) && values.NODE_ENV !== 'production' ? 'TEST' : 'EXTERNAL_OR_DEFAULT'
  };
}

// The transport cannot create customers, charges, emails, domains, webhooks or keys.
const allowed = new Set(['https://api-sandbox.asaas.com/v3/myAccount/status', 'https://api.asaas.com/v3/myAccount/status',
  'https://api-sandbox.asaas.com/v3/webhooks', 'https://api.asaas.com/v3/webhooks', 'https://api.resend.com/domains']);
export async function readMetadata(url, headers, transport = fetch) {
  if (!allowed.has(url)) throw new Error('OPERATIONAL_READ_NOT_ALLOWED');
  try {
    const response = await transport(url, { method: 'GET', headers, redirect: 'error', credentials: 'omit',
      referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { await response.body?.cancel(); return { status: response.status, data: null }; }
    const reader = response.body?.getReader();
    if (!reader) return { status: response.status, data: null };
    const chunks = []; let size = 0;
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > 262144) { await reader.cancel(); return { status: response.status, data: null }; }
      chunks.push(next.value);
    }
    try { return { status: response.status, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; }
    catch { return { status: response.status, data: null }; }
  } catch { return { status: null, data: null, error: 'NETWORK_TIMEOUT_OR_TLS_FAILURE' }; }
}

export async function inspectOperational({ external = false } = {}) {
  const files = ['.env', 'apps/api-br/.env', 'apps/events-api/.env'];
  const inputs = [];
  for (const file of files) {
    let values = {};
    try { values = parse(await readFile(path.join(root, file))); } catch { /* Missing file is reported. */ }
    // Mirrors dotenv default: shell values win. Root is a separate view, never
    // silently substituted for an app's missing per-CWD environment.
    values = { ...values, ...process.env };
    inputs.push({ file, values });
  }
  const report = { scope: 'STATIC_ENV_FILES_AND_CALLING_PROCESS_NOT_RUNNING_SERVER_ENV',
    checkedAt: new Date().toISOString(), config: inputs.map(input => ({ file: input.file, ...summarizeConfig(input.values) })),
    frontend: [], consistency: {}, external: [] };
  for (const file of ['apps/events-admin/.env.local', 'apps/web-br/.env.local']) {
    let values = {}; try { values = parse(await readFile(path.join(root, file))); } catch { /* Report missing public config. */ }
    report.frontend.push({ file, publicApiBaseUrl: classifyUrl(process.env.NEXT_PUBLIC_API_BASE_URL ?? values.NEXT_PUBLIC_API_BASE_URL) });
  }
  const [a, b] = inputs.slice(1).map(input => input.values);
  for (const key of ['ASAAS_API_KEY', 'ASAAS_ENVIRONMENT', 'ASAAS_WEBHOOK_TOKEN', 'RESEND_API_KEY', 'EVENTS_EMAIL_FROM', 'EVENTS_APP_BASE_URL', 'REDIS_URL']) {
    report.consistency[key] = !present(a[key]) || !present(b[key]) ? 'MISSING_IN_ONE_OR_BOTH' : a[key] === b[key] ? 'MATCH' : 'DIFFERENT';
  }
  const dedup = new Map();
  if (external) for (const { file, values } of inputs) {
    const env = values.ASAAS_ENVIRONMENT?.trim().toLowerCase() || 'sandbox';
    if (present(values.ASAAS_API_KEY) && ['sandbox', 'production'].includes(env)) {
      const identity = `asaas:${env}:${values.ASAAS_API_KEY}`;
      if (!dedup.has(identity)) {
        const base = env === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
        const headers = { access_token: values.ASAAS_API_KEY, 'User-Agent': 'SistemaIgrejas-Operational-ReadOnly' };
        const account = await readMetadata(`${base}/myAccount/status`, headers);
        const states = ['APPROVED', 'PENDING', 'AWAITING_APPROVAL', 'REJECTED'];
        const webhook = await readMetadata(`${base}/webhooks`, headers);
        const entries = Array.isArray(webhook.data?.data) ? webhook.data.data : null;
        const item = { provider: 'asaas', environment: env, sources: [file], statusHttp: account.status,
          account: Object.fromEntries(['general', 'commercialInfo', 'bankAccountInfo', 'documentation'].map(key => [key, states.includes(account.data?.[key]) ? account.data[key] : 'UNKNOWN'])),
          webhookHttp: webhook.status, webhookMetadataReadable: !!entries,
          webhookHasMore: webhook.data?.hasMore === true,
          enabledWebhooks: entries?.filter(entry => entry.enabled === true).length ?? null,
          interruptedWebhooks: entries?.filter(entry => entry.interrupted === true).length ?? null,
          enabledWebhooksAllHttps: entries?.some(entry => entry.enabled === true) ? entries.filter(entry => entry.enabled === true).every(entry => classifyUrl(entry.url) === 'HTTPS_PUBLIC') : null,
          tokenMatchBySource: [{ source: file, matches: entries && present(values.ASAAS_WEBHOOK_TOKEN)
            ? entries.some(entry => entry.enabled === true && entry.authToken === values.ASAAS_WEBHOOK_TOKEN) : null }],
          error: account.error ?? webhook.error ?? null };
        dedup.set(identity, { item, entries }); report.external.push(item);
      } else {
        const cached = dedup.get(identity); cached.item.sources.push(file);
        cached.item.tokenMatchBySource.push({ source: file, matches: cached.entries && present(values.ASAAS_WEBHOOK_TOKEN)
          ? cached.entries.some(entry => entry.enabled === true && entry.authToken === values.ASAAS_WEBHOOK_TOKEN) : null });
      }
    }
    if (present(values.RESEND_API_KEY)) {
      const identity = `resend:${values.RESEND_API_KEY}`;
      let cached = dedup.get(identity);
      if (!cached) { const result = await readMetadata('https://api.resend.com/domains', { Authorization: `Bearer ${values.RESEND_API_KEY}` });
        cached = { result }; dedup.set(identity, cached); }
      const entries = Array.isArray(cached.result.data?.data) ? cached.result.data.data : null;
      const domain = senderDomain(values.EVENTS_EMAIL_FROM);
      report.external.push({ provider: 'resend', source: file, domainsHttp: cached.result.status,
        metadataReadable: !!entries, hasMoreDomains: cached.result.data?.has_more === true,
        configuredSenderDomainFound: domain && entries ? entries.some(entry => entry.name?.toLowerCase() === domain) : null,
        configuredSenderDomainVerified: domain && entries ? entries.some(entry => entry.name?.toLowerCase() === domain && entry.status === 'verified') : null,
        error: cached.result.error ?? null });
    }
  }
  if (external && !inputs.some(input => present(input.values.RESEND_API_KEY))) {
    const probe = await readMetadata('https://api.resend.com/domains', {});
    report.external.push({ provider: 'resend', unauthenticatedConnectivityOnly: true, domainsHttp: probe.status,
      authenticatedAccountVerified: false, error: probe.error ?? null });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await inspectOperational({ external: process.argv.includes('--provider-readonly') }), null, 2));
}
