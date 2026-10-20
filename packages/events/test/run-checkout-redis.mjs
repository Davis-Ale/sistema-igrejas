import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Redis from 'ioredis';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const nonce = randomUUID().replaceAll('-', ''), name = `checkout-redis-test-${nonce}`;
const password = randomBytes(32).toString('hex'), runtimePassword = randomBytes(32).toString('hex');
const marker = `checkout-redis-isolated-${nonce}`, port = '55438';
const adminUrl = `redis://default:${password}@127.0.0.1:${port}/0`;
const runtimeUrl = `redis://checkout_runtime:${runtimePassword}@127.0.0.1:${port}/0`;
const safeEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const redact = text => String(text).replaceAll(password, '[TEST_SECRET]').replaceAll(runtimePassword, '[TEST_SECRET]');
const run = (bin, args, extra = {}) => new Promise((resolve, reject) => {
  execFile(bin, args, { cwd: root, env: { ...safeEnv, ...extra }, encoding: 'utf8', maxBuffer: 2_000_000 }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(new Error('ISOLATED_REDIS_COMMAND_FAILED'), { stdout, stderr })); else resolve({ stdout, stderr });
  });
});
const inventory = async () => (await run('docker', ['ps', '-a', '--format', '{{.ID}} {{.Names}}'])).stdout.trim().split('\n').filter(Boolean).sort();
let containerId, before, admin;
async function inspect() {
  assert.match(containerId, /^[a-f0-9]{64}$/);
  const [data] = JSON.parse((await run('docker', ['inspect', containerId])).stdout);
  assert.equal(data.Id, containerId); assert.equal(data.Name, `/${name}`);
  assert.equal(data.Config.Labels['codex.checkout-redis-test'], nonce);
  assert.equal(data.HostConfig.AutoRemove, true);
  assert.ok(data.HostConfig.Tmpfs['/data']); assert.ok(data.Mounts.every(mount => mount.Type === 'tmpfs'));
  assert.deepEqual(data.NetworkSettings.Ports['6379/tcp'], [{ HostIp: '127.0.0.1', HostPort: port }]);
}
try {
  before = await inventory();
  // Restart the Redis PROCESS within this owned container to retain its tmpfs.
  // This does not claim durability across container/host loss or HA failover.
  const supervisor = 'umask 077; printf "user default on >%s ~* &* +@all\\n" "$1" > /data/users.acl; shift; trap "exit 0" TERM INT; while redis-server "$@"; do sleep 0.1; done';
  containerId = (await run('docker', ['run', '--pull', 'never', '--rm', '--detach', '--name', name,
    '--label', `codex.checkout-redis-test=${nonce}`, '--publish', `127.0.0.1:${port}:6379`,
    '--tmpfs', '/data:rw,nosuid,size=64m', '--memory', '192m', '--cpus', '1', '--entrypoint', 'sh',
    'redis:7-alpine', '-c', supervisor, 'checkout-redis-supervisor', password, '--bind', '0.0.0.0', '--protected-mode', 'yes',
    '--requirepass', password, '--aclfile', '/data/users.acl', '--dir', '/data', '--appendonly', 'yes', '--appendfsync', 'always', '--save', ''])).stdout.trim();
  await inspect();
  admin = new Redis(adminUrl, { lazyConnect: true, enableReadyCheck: false, retryStrategy: null, maxRetriesPerRequest: 0, connectTimeout: 1000 });
  admin.on('error', () => {});
  for (let attempt = 0; ; attempt++) {
    try { await admin.connect(); await admin.ping(); break; }
    catch { if (attempt >= 30) throw new Error('ISOLATED_REDIS_NOT_READY'); admin.disconnect(); await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  await admin.set('events:checkout-security:{checkout}:isolated-marker', marker);
  await admin.acl('SETUSER', 'checkout_runtime', 'on', `>${runtimePassword}`, '~events:checkout-security:{checkout}:*',
    '+ping', '+get', '+set', '+incr', '+pexpire', '+pttl', '+eval');
  // ACL changes must survive the process restart; save in the same owned tmpfs.
  await admin.acl('SAVE');
  admin.disconnect(); admin = undefined;
  console.log('ISOLATED_REDIS_READY host=127.0.0.1 port=55438 auth=ACL aof=always storage=tmpfs');
  for (const file of ['checkout-security.redis.test.ts', 'checkout-security.operational.redis.test.ts']) {
    const result = await run(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig',
      path.join(root, 'tsconfig.base.json'), '--test', path.join(root, 'packages/events/test', file)], {
      CHECKOUT_REDIS_TEST_URL: runtimeUrl, CHECKOUT_REDIS_TEST_ADMIN_URL: adminUrl, CHECKOUT_REDIS_TEST_MARKER: marker,
      CHECKOUT_REDIS_TEST_CONTAINER: containerId, NODE_ENV: 'test'
    });
    console.log(redact(result.stdout)); console.log(redact(result.stderr));
  }
} catch (error) {
  console.error(redact(error.stdout || '')); console.error(redact(error.stderr || error.message)); process.exitCode = 1;
} finally {
  admin?.disconnect();
  if (containerId) {
    try { await inspect(); await run('docker', ['stop', '--time', '3', containerId]); console.log('DISPOSABLE_REDIS_REMOVED'); }
    catch { console.error('REDIS_CLEANUP_BLOCKED'); process.exitCode = 1; }
  }
  if (before) {
    try { assert.deepEqual(await inventory(), before); console.log('OTHER_CONTAINERS_PRESERVED'); }
    catch { console.error('REDIS_INVENTORY_CHECK_FAILED'); process.exitCode = 1; }
  }
}
