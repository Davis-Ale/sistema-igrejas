import assert from 'node:assert/strict';
import test from 'node:test';
import { readMetadata, summarizeConfig } from './inspect-checkout-operational.mjs';

test('operational report exposes only booleans/classifications, never env values or URL credentials', () => {
  const result = summarizeConfig({ ASAAS_API_KEY: 'private-asaas', ASAAS_WEBHOOK_TOKEN: 'private-webhook',
    RESEND_API_KEY: 'private-resend', DATABASE_URL: 'private-database', JWT_SECRET: 'private-jwt',
    REDIS_URL: 'rediss://user:private-redis@private.host/0', EVENTS_APP_BASE_URL: 'https://user:private-url@host.invalid/?key=secret',
    EVENTS_EMAIL_FROM: 'Private Name <private-person@example.invalid>', ASAAS_ENVIRONMENT: 'sandbox',
    CHECKOUT_SECURITY_BUCKET_SECRET: 'private-operational-secret-32-characters',
    CHECKOUT_SECURITY_ORIGINS: 'https://private-origin.invalid', CHECKOUT_REDIS_ADMIN_URL: 'redis://default:private-admin@private.host/0' });
  assert.equal(result.participantUrl, 'UNSAFE_URL'); assert.equal(result.resend.assistedSenderAcceptsSameFrom, false);
  assert.equal(result.checkoutSecurity.bucketSecretPresent, true); assert.equal(result.checkoutSecurity.originsPresent, true);
  const serialized = JSON.stringify(result);
  for (const marker of ['private-', 'private.host', 'Private Name', 'example.invalid', '?key=secret', 'private-origin']) assert.equal(serialized.includes(marker), false);
});

test('read-only provider transport rejects every mutation URL and never sends a body or follows redirects', async () => {
  let calls = 0;
  const transport = (async (_url: any, init: RequestInit) => {
    calls++; assert.equal(init.method, 'GET'); assert.equal(init.body, undefined); assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit'); return new Response(JSON.stringify({ general: 'APPROVED' }));
  }) as typeof fetch;
  for (const url of ['https://api-sandbox.asaas.com/v3/payments', 'https://api-sandbox.asaas.com/v3/customers',
    'https://api.resend.com/emails', 'https://evil.invalid/domains', 'http://api.resend.com/domains']) await assert.rejects(readMetadata(url, {}, transport));
  assert.equal(calls, 0);
  assert.equal((await readMetadata('https://api-sandbox.asaas.com/v3/myAccount/status', {}, transport)).status, 200);
  assert.equal(calls, 1);
});

test('provider read failures omit raw bodies/errors and bound response size', async () => {
  const url = 'https://api.resend.com/domains';
  const failed = await readMetadata(url, {}, (async () => new Response('private-provider-secret', { status: 403 })) as typeof fetch);
  assert.deepEqual(failed, { status: 403, data: null });
  const network = await readMetadata(url, {}, (async () => { throw new Error('private-network-secret'); }) as typeof fetch);
  assert.equal(JSON.stringify(network).includes('private-'), false);
  const large = await readMetadata(url, {}, (async () => new Response('x'.repeat(262145))) as typeof fetch);
  assert.equal(large.data, null);
});
