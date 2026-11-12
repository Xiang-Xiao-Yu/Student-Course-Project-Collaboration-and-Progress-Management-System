// Starts only disposable local services; never uses the caller's DATABASE_URL.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const [playwrightPackage, electronExe] = process.argv.slice(2);
assert(process.argv.length === 4, 'Usage: node tests/p7/run-p5.mjs playwrightPackage electronExe');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
for (const path of [
  playwrightPackage,
  electronExe,
  join(root, 'apps/api/dist/main.js'),
  join(root, 'apps/desktop/out/main/index.js'),
]) {
  assert(existsSync(path), 'Missing runtime or build; see docs/test/p7-frontend-regression.md');
}
const output = join(
  root,
  'tmp',
  `p7-mvp-regression-${Date.now()}-${randomBytes(3).toString('hex')}`,
);
mkdirSync(output, { recursive: true });
const databaseFile = join(output, 'p7.sqlite');
writeFileSync(databaseFile, '', { flag: 'wx' });
const secret = randomBytes(48).toString('hex');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  APP_HOST: '127.0.0.1',
  DATABASE_URL: `file:${databaseFile.replaceAll('\\', '/')}`,
  JWT_SECRET: secret,
  JWT_EXPIRES_IN: '2h',
  CORS_ORIGINS: 'null,http://localhost:5173',
  LOG_LEVEL: 'error',
  ELECTRON_RENDERER_URL: '',
  P7_OUTPUT_DIRECTORY: output,
};
delete env.ELECTRON_RUN_AS_NODE;
let api;
let regression;
let apiLog = '';
let regressionLog = '';
let regressionTimer;
const redact = (value) =>
  String(value)
    .replaceAll(secret, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');

function start(args, cwd = root) {
  return spawn(process.execPath, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function exitCode(child) {
  return new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', (code) => done(code));
  });
}

async function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    await exitCode(killer);
  } else {
    child.kill('SIGTERM');
    await Promise.race([exitCode(child), delay(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

try {
  const migration = start([
    join(root, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    'prisma/schema.prisma',
  ]);
  let migrationLog = '';
  migration.stdout.on('data', (chunk) => {
    migrationLog += chunk;
  });
  migration.stderr.on('data', (chunk) => {
    migrationLog += chunk;
  });
  const migrationCode = await exitCode(migration);
  writeFileSync(join(output, 'migration.txt'), redact(migrationLog));
  assert.equal(migrationCode, 0, 'Isolated SQLite migration failed');

  const probe = createServer();
  await new Promise((done, fail) => {
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', done);
  });
  env.APP_PORT = String(probe.address().port);
  await new Promise((done) => probe.close(done));
  const base = `http://127.0.0.1:${env.APP_PORT}/api/v1`;
  api = start([join(root, 'apps/api/dist/main.js')], join(root, 'apps/api'));
  api.stdout.on('data', (chunk) => {
    apiLog += chunk;
  });
  api.stderr.on('data', (chunk) => {
    apiLog += chunk;
  });
  const apiExit = exitCode(api);
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(api.exitCode, null, 'API exited before becoming healthy');
    try {
      healthy = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      /* Keep waiting until the bounded startup deadline. */
    }
    if (healthy) break;
    await delay(150);
  }
  assert(healthy, 'API health check timed out');
  console.log(`P7 evidence directory: ${output}`);
  regression = start([
    join(root, 'apps/desktop/tests/p5-meetings-acceptance.mjs'),
    root,
    resolve(playwrightPackage),
    resolve(electronExe),
    base,
  ]);
  regression.stdout.on('data', (chunk) => {
    regressionLog += chunk;
    process.stdout.write(redact(chunk));
  });
  regression.stderr.on('data', (chunk) => {
    regressionLog += chunk;
    process.stderr.write(redact(chunk));
  });
  const code = await Promise.race([
    exitCode(regression),
    new Promise((_done, fail) => {
      regressionTimer = setTimeout(
        () => fail(new Error('P7 regression exceeded 180 seconds')),
        180000,
      );
    }),
    apiExit.then(() => {
      throw new Error('API exited during regression');
    }),
  ]);
  writeFileSync(join(output, 'regression.txt'), redact(regressionLog));
  assert.equal(code, 0, 'P7 desktop regression failed');
} finally {
  clearTimeout(regressionTimer);
  await stop(regression);
  await stop(api);
  writeFileSync(join(output, 'regression.txt'), redact(regressionLog));
  writeFileSync(join(output, 'api.txt'), redact(apiLog));
}
