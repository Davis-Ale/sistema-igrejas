import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import Fastify from 'fastify';
import { createRedisCheckoutSecurityStore, CHECKOUT_SECURITY_GATE_KEY, type CheckoutSecurityConfig } from '../src/checkout-security.prepared.ts';
import { prepareEventsApiCheckoutSecurity } from '../../../apps/events-api/src/checkout-security.prepared.ts';
import { prepareApiBrCheckoutSecurity } from '../../../apps/api-br/src/checkout-security.prepared.ts';

function guardedUrl(value: string | undefined, user: string) {
  assert.ok(value, 'Explicit isolated Redis URL required');
  const url = new URL(value);
  assert.equal(url.protocol, 'redis:'); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55438');
  assert.equal(url.pathname, '/0'); assert.equal(url.username, user); assert.match(url.password, /^[a-f0-9]{64}$/);
  assert.equal(url.search, ''); assert.equal(url.hash, '');
  assert.equal(process.env.REDIS_URL, undefined); assert.equal(process.env.DATABASE_URL, undefined);
  assert.match(process.env.CHECKOUT_REDIS_TEST_MARKER ?? '', /^checkout-redis-isolated-[a-f0-9]{32}$/);
  assert.match(process.env.CHECKOUT_REDIS_TEST_CONTAINER ?? '', /^[a-f0-9]{64}$/);
  return value;
}
const runtimeUrl = guardedUrl(process.env.CHECKOUT_REDIS_TEST_URL, 'checkout_runtime');
const adminUrl = guardedUrl(process.env.CHECKOUT_REDIS_TEST_ADMIN_URL, 'default');
const options = { lazyConnect: true, enableReadyCheck: false, enableOfflineQueue: false, retryStrategy: () => null,
  maxRetriesPerRequest: 0, connectTimeout: 1000 };
const connect = async (url: string) => {
  const redis = new Redis(url, options); redis.on('error', () => {}); await redis.connect(); return redis;
};
let admin: Redis;
const clients: Redis[] = [];
const markerKey = 'events:checkout-security:{checkout}:isolated-marker';
const config = (patch: Partial<CheckoutSecurityConfig> = {}): CheckoutSecurityConfig => ({
  origins: ['https://checkout.example.invalid'], allowLocalHttp: false, httpsOnly: true,
  bucketSecret: 'synthetic-cut6-redis-bucket-secret-32-characters', ipLimit: 2, credentialLimit: 1,
  windowMs: 1000, bodyLimit: 4096, storeTimeoutMs: 100, requestTimeoutMs: 10_000, ...patch
});
const route = '/public/events/:eventId/register', url = '/public/events/synthetic/register';
before(async () => {
  admin = await connect(adminUrl);
  assert.equal(await admin.get(markerKey), process.env.CHECKOUT_REDIS_TEST_MARKER);
  assert.match(await admin.info('server'), /redis_version:7\./);
  assert.match(await admin.info('persistence'), /aof_enabled:1/);
  assert.equal(await admin.config('GET', 'appendfsync').then(result => (result as string[])[1]), 'always');
});
after(() => { clients.forEach(client => client.disconnect()); admin?.disconnect(); });
async function appFixture(factory: typeof prepareEventsApiCheckoutSecurity, patch: Partial<CheckoutSecurityConfig> = {}) {
  const client = await connect(runtimeUrl); clients.push(client);
  assert.equal(await client.get(markerKey), process.env.CHECKOUT_REDIS_TEST_MARKER);
  const store = createRedisCheckoutSecurityStore(client);
  const security = factory(config(patch), store);
  const app = Fastify({ ...security.fastifyOptions, logger: false });
  await security.install(app);
  let calls = 0;
  app.post(route, async () => { calls++; return { ok: true }; });
  return { app, security, client, store, calls: () => calls };
}
const prime = (fingerprint: string) => admin.set(CHECKOUT_SECURITY_GATE_KEY, `V2:${fingerprint}`);

test('real Lua missing gate fails closed and runtime ACL rejects keys outside its namespace', async () => {
  const h = await appFixture(prepareEventsApiCheckoutSecurity);
  try {
    assert.equal(await admin.exists(CHECKOUT_SECURITY_GATE_KEY), 0);
    assert.equal((await h.app.inject({ method: 'POST', url, payload: {} })).statusCode, 503);
    assert.equal(h.calls(), 0);
    await assert.rejects(h.client.get('outside-checkout-namespace'), /NOPERM/);
    await assert.rejects(h.client.config('GET', '*'), /NOPERM/);
    await assert.rejects(h.client.eval('return redis.call("GET", KEYS[1])', 1, 'outside-checkout-namespace'), /NOPERM/);
  } finally { await h.app.close(); }
});

test('two real Redis connections enforce one atomic shared IP budget across API instances and forwarded spoofing', async () => {
  const a = await appFixture(prepareEventsApiCheckoutSecurity), b = await appFixture(prepareApiBrCheckoutSecurity);
  await prime(a.security.policyFingerprint);
  try {
    const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).app.inject({
      method: 'POST', url: `/public/events/synthetic-${i}/register`, payload: {},
      remoteAddress: '203.0.113.1', headers: { 'x-forwarded-for': `198.51.100.${i + 1}` }
    })));
    assert.equal(replies.filter(reply => reply.statusCode === 200).length, 2);
    assert.equal(replies.filter(reply => reply.statusCode === 429).length, 10);
    assert.equal(a.calls() + b.calls(), 2);
    for (const reply of replies) assert.equal(reply.headers['cache-control'], 'no-store');
  } finally { await a.app.close(); await b.app.close(); }
});

test('real capability quota spans distinct IPs and Redis keys contain neither IP nor private capability', async () => {
  const a = await appFixture(prepareEventsApiCheckoutSecurity), b = await appFixture(prepareApiBrCheckoutSecurity);
  await prime(a.security.policyFingerprint);
  const credential = `ec2_${'A'.repeat(43)}`;
  try {
    const responses = await Promise.all([a.app.inject({ method: 'POST', url, remoteAddress: '203.0.113.20', headers: { 'x-event-checkout-key': credential }, payload: {} }),
      b.app.inject({ method: 'POST', url, remoteAddress: '203.0.113.21', headers: { 'x-event-checkout-key': credential }, payload: {} })]);
    assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 429]);
    const keys = await admin.keys('events:checkout-security:{checkout}:*');
    for (const secret of [credential, '203.0.113.20', '203.0.113.21']) assert.equal(JSON.stringify(keys).includes(secret), false);
  } finally { await a.app.close(); await b.app.close(); }
});

test('real counters expire and an exhausted IP cannot allocate unlimited capability buckets', async () => {
  const client = await connect(runtimeUrl); clients.push(client);
  const store = createRedisCheckoutSecurityStore(client), fingerprint = randomUUID().replaceAll('-', '');
  await prime(fingerprint);
  const bucket = `ip:${randomUUID()}`, firstCap = `capability:${randomUUID()}`, blockedCap = `capability:${randomUUID()}`;
  assert.equal((await store.consume([{ key: bucket, limit: 1 }, { key: firstCap, limit: 10 }], 150, fingerprint)).retryAfterMs, 0);
  assert.ok((await store.consume([{ key: bucket, limit: 1 }, { key: blockedCap, limit: 10 }], 150, fingerprint)).retryAfterMs > 0);
  assert.equal(await admin.exists(`events:checkout-security:{checkout}:${blockedCap}`), 0);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal((await store.consume([{ key: bucket, limit: 1 }], 150, fingerprint)).retryAfterMs, 0);
});

test('policy mismatch and shared close block both APIs using the real store', async () => {
  const a = await appFixture(prepareEventsApiCheckoutSecurity), b = await appFixture(prepareApiBrCheckoutSecurity, { ipLimit: 3 });
  await prime(a.security.policyFingerprint);
  try {
    assert.equal((await b.app.inject({ method: 'POST', url, payload: {} })).statusCode, 503);
    await a.security.close();
    for (const h of [a, b]) assert.equal((await h.app.inject({ method: 'POST', url, payload: {} })).statusCode, 503);
    assert.equal(await admin.pttl(CHECKOUT_SECURITY_GATE_KEY), -1);
  } finally { await a.app.close(); await b.app.close(); }
});

test('Redis pause exceeding the policy deadline fails closed and late Lua completion never runs the handler', async () => {
  const h = await appFixture(prepareEventsApiCheckoutSecurity, { storeTimeoutMs: 10 });
  await prime(h.security.policyFingerprint);
  try {
    await admin.call('CLIENT', 'PAUSE', '150', 'ALL');
    const response = await h.app.inject({ method: 'POST', url, remoteAddress: '203.0.113.80', payload: {} });
    assert.equal(response.statusCode, 503); assert.equal(response.json().error, 'CHECKOUT_SECURITY_UNAVAILABLE');
    await new Promise(resolve => setTimeout(resolve, 200)); assert.equal(h.calls(), 0);
  } finally { await h.app.close(); }
});

test('AOF and ACL survive a Redis process restart and the closed gate stays closed', async () => {
  const h = await appFixture(prepareEventsApiCheckoutSecurity);
  await h.security.close();
  const oldInfo = await admin.info('server');
  try { await admin.shutdown('NOSAVE'); } catch { /* Server closes its connection. */ }
  admin.disconnect();
  for (let attempt = 0; ; attempt++) {
    try {
      admin = await connect(adminUrl);
      assert.equal(await admin.get(markerKey), process.env.CHECKOUT_REDIS_TEST_MARKER);
      assert.notEqual((await admin.info('server')).match(/run_id:(\w+)/)?.[1], oldInfo.match(/run_id:(\w+)/)?.[1]);
      break;
    } catch { admin?.disconnect(); if (attempt >= 30) throw new Error('ISOLATED_REDIS_RESTART_FAILED'); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  try {
    const client = await connect(runtimeUrl); clients.push(client);
    const store = createRedisCheckoutSecurityStore(client);
    assert.equal((await store.consume([{ key: `ip:${randomUUID()}`, limit: 1 }], 1000, h.security.policyFingerprint)).closed, true);
    assert.equal(await client.get(CHECKOUT_SECURITY_GATE_KEY), 'CLOSED');
    await assert.rejects(client.get('outside-checkout-namespace'), /NOPERM/);
  } finally { await h.app.close(); }
});

test('a disconnected real Redis client causes admission failure without local fallback', async () => {
  const h = await appFixture(prepareApiBrCheckoutSecurity);
  await prime(h.security.policyFingerprint); h.client.disconnect();
  try {
    assert.equal((await h.app.inject({ method: 'POST', url, payload: {} })).statusCode, 503);
    assert.equal(h.calls(), 0);
  } finally { await h.app.close(); }
});
