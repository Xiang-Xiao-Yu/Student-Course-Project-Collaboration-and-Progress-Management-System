// Run P4 against a new SQLite database, the real API, and the locked Electron version.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [playwrightArgument, electronArgument] = process.argv.slice(2);
assert(playwrightArgument && electronArgument, 'Required: playwright/package.json electron.exe');
const playwrightPackage = resolve(playwrightArgument);
const electronExe = resolve(electronArgument);
const runDirectory = process.env.P4_GATE_OUTPUT_DIR
  ? resolve(process.env.P4_GATE_OUTPUT_DIR)
  : join(root, 'tmp', 'ui-demo', `p4-gate-${Date.now()}`);
await mkdir(runDirectory, { recursive: true });
const databasePath = join(runDirectory, 'p4.sqlite');
await writeFile(databasePath, '', { flag: 'wx' });
const secret = randomBytes(48).toString('hex');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  APP_HOST: '127.0.0.1',
  CORS_ORIGINS: 'null,http://localhost:5173',
  DATABASE_URL: `file:${databasePath.replaceAll('\\', '/')}`,
  JWT_SECRET: secret,
  JWT_EXPIRES_IN: '2h',
  LOG_LEVEL: 'error',
};
delete env.ELECTRON_RUN_AS_NODE;

const summary = {
  commands: [],
  passed: false,
  sandboxOverride: process.env.P4_TEST_NO_SANDBOX === '1',
};
let apiProcess;
let apiOutput = '';
function redact(text) {
  return String(text)
    .replaceAll(secret, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
}
async function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return;
  }
  await new Promise((done) => {
    const cleanup = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    cleanup.once('error', () => {
      child.kill();
      done();
    });
    cleanup.once('close', done);
  });
}
async function command(name, executable, args, options = {}) {
  const child = spawn(executable, args, {
    cwd: root,
    env: options.env ?? env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void stopProcess(child);
  }, options.timeout ?? 120000);
  let exitCode;
  try {
    exitCode = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', (code) => done(code ?? -1));
    });
  } finally {
    clearTimeout(timer);
    await writeFile(join(runDirectory, `${name}-output.txt`), redact(output));
  }
  summary.commands.push({ exitCode, name, timedOut });
  console.log(JSON.stringify({ exitCode, name, timedOut }));
  return { exitCode, output };
}

try {
  const version = await command(
    'electron-version',
    electronExe,
    ['-p', 'process.versions.electron'],
    {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    },
  );
  const expected = JSON.parse(
    await readFile(join(root, 'apps/desktop/node_modules/electron/package.json'), 'utf8'),
  ).version;
  assert.equal(version.exitCode, 0);
  assert.equal(version.output.trim(), expected, 'Electron version must match the lockfile');
  summary.electron = expected;

  const migration = await command('migration', process.execPath, [
    join(root, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    join(root, 'prisma/schema.prisma'),
  ]);
  assert.equal(migration.exitCode, 0, 'Fresh SQLite migrations must succeed');
  const probe = createServer();
  await new Promise((done, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', done);
  });
  const port = probe.address().port;
  await new Promise((done) => probe.close(done));
  env.APP_PORT = String(port);
  const apiBaseUrl = `http://127.0.0.1:${port}/api/v1`;
  apiProcess = spawn(process.execPath, [join(root, 'apps/api/dist/main.js')], {
    cwd: join(root, 'apps/api'),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stdout.on('data', (data) => (apiOutput += data));
  apiProcess.stderr.on('data', (data) => (apiOutput += data));
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (apiProcess.exitCode !== null) throw new Error('Isolated API exited before health check');
    try {
      const response = await fetch(`${apiBaseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).success) {
        healthy = true;
        break;
      }
    } catch {
      // The isolated API may still be starting.
    }
    await delay(200);
  }
  assert(healthy, 'Real API must become healthy');
  const electron = await command(
    'electron',
    process.execPath,
    [
      join(root, 'apps/desktop/tests/p4-iterations-comments.mjs'),
      root,
      playwrightPackage,
      electronExe,
      apiBaseUrl,
      join(runDirectory, 'electron'),
    ],
    { timeout: 240000 },
  );
  let report;
  try {
    report = JSON.parse(await readFile(join(runDirectory, 'electron/results.json'), 'utf8'));
  } catch {
    throw new Error(`Electron test exited ${electron.exitCode}; see electron-output.txt`);
  }
  summary.cases = report.cases;
  summary.functionalPassed =
    electron.exitCode === 0 &&
    report.cases.length > 0 &&
    report.cases.every((item) => item.status === 'PASS');
  summary.passed = summary.functionalPassed && !summary.sandboxOverride;
  if (!summary.passed) process.exitCode = 1;
} catch (error) {
  summary.error = redact(error.message);
  process.exitCode = 1;
} finally {
  if (apiProcess && apiProcess.exitCode === null) {
    const stopped = new Promise((done) => apiProcess.once('close', done));
    await stopProcess(apiProcess);
    await Promise.race([stopped, delay(5000)]);
  }
  await writeFile(join(runDirectory, 'api-output.txt'), redact(apiOutput));
  await writeFile(join(runDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ runDirectory, passed: summary.passed, error: summary.error }));
}
