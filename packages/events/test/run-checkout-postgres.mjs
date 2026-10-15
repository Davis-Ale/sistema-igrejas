import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const cleanupMode = process.argv[2] === '--cleanup';
const concurrencyOnly = process.argv.includes('--concurrency-only');
const affectedOnly = process.argv.includes('--affected-only');
assert.ok(!(concurrencyOnly && affectedOnly), 'Choose one focused test scope');
const nonce = cleanupMode ? process.argv[4] : randomUUID().replaceAll('-', '');
assert.match(nonce, /^[a-f0-9]{32}$/);
const name = 'checkout-v2-test-' + nonce;
const database = 'checkout_v2_test_' + nonce;
const marker = 'checkout-v2-isolated-' + nonce;
const password = randomBytes(32).toString('hex');
const runtimePassword = randomBytes(32).toString('hex');
const port = '55437'; // Fail on collision; never use 5433 or the shared Compose.
let containerId = cleanupMode ? process.argv[3] : undefined;
if (containerId) assert.match(containerId, /^[a-f0-9]{12,64}$/);
const safeEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
function run(bin, args, extraEnv = {}, cwd = root) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, env: { ...safeEnv, ...extraEnv }, encoding: 'utf8', maxBuffer: 4_000_000 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(new Error(stderr || error.message), { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}
function redact(text) { return String(text).replaceAll(password, '[TEST_SECRET]').replaceAll(runtimePassword, '[TEST_SECRET]'); }
async function inspect(cleanup = false) {
  const { stdout } = await run('docker', ['inspect', containerId]);
  const [metadata] = JSON.parse(stdout);
  assert.ok(metadata.Id.startsWith(containerId));
  containerId = metadata.Id;
  assert.equal(metadata.Name, '/' + name);
  assert.equal(metadata.Config.Labels['codex.checkout-test'], nonce);
  assert.equal(metadata.HostConfig.AutoRemove, true);
  if (cleanup) return;
  assert.ok(metadata.HostConfig.Tmpfs['/var/lib/postgresql/data']);
  assert.ok(metadata.Mounts.every(m => m.Type === 'tmpfs')); // No existing volume or host bind.
  const ports = metadata.NetworkSettings.Ports['5432/tcp'];
  assert.deepEqual(ports, [{ HostIp: '127.0.0.1', HostPort: port }]);
}
let admin;
let protectedContainers;
try {
  if (cleanupMode) { await inspect(); } else {
  const initial = await run('docker', ['ps', '-a', '--format', '{{.ID}} {{.Names}} {{.Status}}']);
  protectedContainers = initial.stdout.trim().split('\n').filter(Boolean).map(line => line.split(' ').slice(0, 2).join(' ')).sort();
  const created = await run('docker', ['run', '--rm', '--detach', '--name', name,
    '--label', 'codex.checkout-test=' + nonce, '--publish', '127.0.0.1:' + port + ':5432',
    '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=512m', '--tmpfs', '/var/run/postgresql:rw,nosuid,size=16m',
    '--memory', '768m', '--cpus', '2', '-e', 'POSTGRES_USER=checkout_migrator', '-e', 'POSTGRES_PASSWORD=' + password,
    '-e', 'POSTGRES_DB=' + database, 'postgres:17-alpine', 'postgres', '-c', 'cluster_name=' + marker]);
  containerId = created.stdout.trim(); assert.match(containerId, /^[a-f0-9]{64}$/);
  await inspect();
  for (let i = 0; ; i++) {
    try { await run('docker', ['exec', containerId, 'pg_isready', '-h', '127.0.0.1', '-U', 'checkout_migrator', '-d', database]); break; }
    catch (error) { if (i >= 40) throw error; await new Promise(r => setTimeout(r, 250)); }
  }
  const migrationUrl = 'postgresql://checkout_migrator:' + password + '@127.0.0.1:' + port + '/' + database;
  admin = new Client({ connectionString: migrationUrl, connectionTimeoutMillis: 3000 }); await admin.connect();
  const identity = (await admin.query("SELECT current_database() AS db, current_user AS usr, current_setting('cluster_name') AS marker, current_setting('server_version_num')::int AS version")).rows[0];
  assert.equal(identity.db, database); assert.equal(identity.usr, 'checkout_migrator'); assert.equal(identity.marker, marker);
  assert.ok(identity.version >= 170000 && identity.version < 180000);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = \'public\'')).rows[0].n, 0);
  console.log('ISOLATION_OK postgres=17 host=127.0.0.1 port=' + port + ' storage=tmpfs database=' + database);
  // Explicit DATABASE_URL only in this isolated child. No inherited application environment or seed.
  const migrationArgs = [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(root, 'packages/database/prisma.config.ts')];
  const deployed = await run(process.execPath, migrationArgs, { DATABASE_URL: migrationUrl }, path.join(root, 'packages/database'));
  console.log(redact(deployed.stdout)); console.log(redact(deployed.stderr));
  const replay = await run(process.execPath, migrationArgs, { DATABASE_URL: migrationUrl }, path.join(root, 'packages/database'));
  assert.match(replay.stdout, /No pending migrations/); console.log('MIGRATION_REPLAY_OK');
  await admin.query('CREATE ROLE checkout_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ' + "'" + runtimePassword + "'");
  await admin.query('REVOKE ALL ON DATABASE "' + database + '" FROM PUBLIC');
  await admin.query('GRANT CONNECT ON DATABASE "' + database + '" TO checkout_runtime');
  await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await admin.query('GRANT USAGE ON SCHEMA public TO checkout_runtime');
  await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO checkout_runtime');
  await admin.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO checkout_runtime');
  await admin.end(); admin = undefined;
  const runtimeUrl = 'postgresql://checkout_runtime:' + runtimePassword + '@127.0.0.1:' + port + '/' + database;
  console.log(affectedOnly ? 'TEST_SCOPE affected-4' : concurrencyOnly ? 'TEST_SCOPE concurrent-first-charge' : 'TEST_SCOPE full-24');
  const result = await run(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', path.join(root, 'tsconfig.base.json'), '--test',
    ...(concurrencyOnly ? ['--test-name-pattern', '^concurrent first-charge calls have one durable owner/one simulated POST$'] : []),
    ...(affectedOnly ? ['--test-name-pattern', '^(concurrent independent Prisma clients|concurrent first-charge calls|timeout is durable UNCERTAIN|SUPER_ADMIN recovery persists)'] : []),
    path.join(root, 'packages/events/test/checkout-postgres.integration.test.ts')], {
    CHECKOUT_TEST_DATABASE_URL: runtimeUrl, CHECKOUT_TEST_DATABASE: database,
    CHECKOUT_TEST_MARKER: marker, CHECKOUT_TEST_PORT: port
  });
  console.log(redact(result.stdout)); console.log(redact(result.stderr));
  const final = await run('docker', ['ps', '-a', '--format', '{{.ID}} {{.Names}} {{.Status}}']);
  const beforeOther = initial.stdout.trim().split('\n').filter(Boolean).map(line => line.split(' ').slice(0, 2).join(' ')).sort();
  const afterOther = final.stdout.trim().split('\n').filter(line => line && !line.includes(name)).map(line => line.split(' ').slice(0, 2).join(' ')).sort();
  assert.deepEqual(afterOther, beforeOther); console.log('OTHER_CONTAINERS_PRESERVED');
  }
} catch (error) {
  console.error(redact(error.stdout || '')); console.error(redact(error.stderr || error.message)); process.exitCode = 1;
} finally {
  if (admin) await admin.end().catch(() => {});
  if (containerId) {
    // Verify ownership again; remove only this exact disposable container ID.
    try { await inspect(true); await run('docker', ['stop', '--time', '3', containerId]); console.log('DISPOSABLE_CONTAINER_REMOVED'); }
    catch (error) { console.error('CLEANUP_BLOCKED ' + redact(error.message)); process.exitCode = 1; }
  }
  if (protectedContainers) {
    try { const remaining = await run('docker', ['ps', '-a', '--format', '{{.ID}} {{.Names}}']);
      assert.deepEqual(remaining.stdout.trim().split('\n').filter(Boolean).sort(), protectedContainers);
      console.log('OTHER_CONTAINERS_PRESERVED_AFTER_CLEANUP');
    } catch (error) { console.error('OTHER_CONTAINER_INVENTORY_CHECK_FAILED ' + redact(error.message)); process.exitCode = 1; }
  }
}

if (cleanupMode && process.argv.includes('--then-run') && !process.exitCode) {
  try { const next = await run(process.execPath, [fileURLToPath(import.meta.url)]); console.log(next.stdout); console.log(next.stderr); }
  catch (error) { console.log(error.stdout || ''); console.error(error.stderr || error.message); process.exitCode = 1; }
}
