import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [playwrightArgument, electronArgument] = process.argv.slice(2);
assert(
  playwrightArgument && electronArgument,
  'Usage: node tests/p3/run-electron-gate.mjs <playwright/package.json> <electron.exe>',
);
const playwrightPackage = resolve(playwrightArgument);
const electronExe = resolve(electronArgument);
const runDirectory = join(root, 'tmp', 'ui-demo', `p3-electron-gate-${Date.now()}`);
await mkdir(runDirectory, { recursive: true });
const databasePath = join(runDirectory, 'p3.sqlite');
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
  P3_GATE_DATA_ROOT: runDirectory,
};
delete env.ELECTRON_RUN_AS_NODE;
let apiProcess;
let apiOutput = '';
const commands = [];
const summary = {
  base: process.env.P3_GATE_BASE ?? 'unspecified',
  node: process.version,
  runDirectory,
  commands,
};
function redact(text) {
  return String(text)
    .replaceAll(secret, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
}
async function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return;
  }
  await new Promise((resolveStopped) => {
    const cleanup = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    cleanup.once('error', () => {
      child.kill();
      resolveStopped();
    });
    cleanup.once('close', resolveStopped);
  });
}
async function command(name, executable, args, options = {}) {
  const startedAt = new Date().toISOString();
  let output = '';
  const child = spawn(executable, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void stopProcessTree(child);
  }, options.timeout ?? 240000);
  let exitCode;
  try {
    exitCode = await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolveExit(code ?? -1));
    });
  } finally {
    clearTimeout(timer);
    output = redact(output);
    await writeFile(join(runDirectory, `${name}-output.txt`), output);
  }
  if (timedOut) exitCode = -1;
  commands.push({ name, startedAt, finishedAt: new Date().toISOString(), exitCode, timedOut });
  console.log(JSON.stringify({ name, exitCode }));
  return { exitCode, output };
}
try {
  const electronVersion = await command(
    'electron-version',
    electronExe,
    ['-p', 'process.versions.electron'],
    {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 20000,
    },
  );
  const expectedVersion = JSON.parse(
    await readFile(join(root, 'apps/desktop/node_modules/electron/package.json'), 'utf8'),
  ).version;
  assert.equal(electronVersion.exitCode, 0, 'Electron binary must start');
  assert.equal(
    electronVersion.output.trim(),
    expectedVersion,
    'Electron must match the lockfile installation',
  );
  summary.electron = expectedVersion;

  const migration = await command('migration', process.execPath, [
    join(root, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    join(root, 'prisma/schema.prisma'),
  ]);
  assert.equal(
    migration.exitCode,
    0,
    'All checked-in Prisma migrations must apply to a fresh database',
  );

  const portProbe = createServer();
  await new Promise((resolveListening, reject) => {
    portProbe.once('error', reject);
    portProbe.listen(0, '127.0.0.1', resolveListening);
  });
  const port = portProbe.address().port;
  await new Promise((resolveClosed) => portProbe.close(resolveClosed));
  env.APP_PORT = String(port);
  const apiBaseUrl = `http://127.0.0.1:${port}/api/v1`;
  summary.apiBaseUrl = apiBaseUrl;
  apiProcess = spawn(process.execPath, [join(root, 'apps/api/dist/main.js')], {
    cwd: join(root, 'apps/api'),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stdout.on('data', (data) => {
    apiOutput += data;
  });
  apiProcess.stderr.on('data', (data) => {
    apiOutput += data;
  });
  let startupError;
  apiProcess.once('error', (error) => {
    startupError = error;
  });
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (startupError) throw startupError;
    if (apiProcess.exitCode !== null) throw new Error('Isolated API exited before health check');
    try {
      const response = await fetch(`${apiBaseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).success) {
        healthy = true;
        break;
      }
    } catch {
      /* API may still be starting. */
    }
    await delay(200);
  }
  assert(healthy, 'Real API must become healthy');
  console.log(JSON.stringify({ api: 'ready', apiBaseUrl }));
  const http = await command('http', process.execPath, [
    join(root, 'tests/p3/http-acceptance.mjs'),
    apiBaseUrl,
    join(runDirectory, 'http'),
  ]);
  const electron = await command(
    'electron',
    process.execPath,
    [
      join(root, 'apps/desktop/tests/p3-electron-acceptance.mjs'),
      root,
      playwrightPackage,
      electronExe,
      apiBaseUrl,
      join(runDirectory, 'electron'),
      join(root, 'tests/p3/comment-fixture.mjs'),
    ],
    { timeout: 420000 },
  );
  const httpReports = (await readdir(join(runDirectory, 'http'))).filter((name) =>
    /^http-acceptance-.+\.json$/.test(name),
  );
  assert.equal(httpReports.length, 1, 'HTTP acceptance must produce exactly one complete report');
  const httpReport = JSON.parse(await readFile(join(runDirectory, 'http', httpReports[0]), 'utf8'));
  const electronReport = JSON.parse(
    await readFile(join(runDirectory, 'electron', 'results.json'), 'utf8'),
  );
  summary.http = {
    passed: httpReport.passed,
    failed: httpReport.failed,
    aborted: httpReport.aborted,
  };
  summary.electronCases = electronReport.cases.map(({ id, name, status }) => ({
    id,
    name,
    status,
  }));
  summary.passed =
    http.exitCode === 0 &&
    electron.exitCode === 0 &&
    httpReport.passed > 0 &&
    httpReport.failed === 0 &&
    httpReport.aborted === false &&
    httpReport.results.length === httpReport.passed &&
    httpReport.results.every((item) => item.status === 'passed') &&
    electronReport.metadata.overall === 'PASS' &&
    electronReport.cases.length === 17 &&
    new Set(electronReport.cases.map((item) => item.id)).size === 17 &&
    electronReport.cases.every((item) => item.status === 'PASS');
  if (!summary.passed) process.exitCode = 1;
} catch (error) {
  summary.passed = false;
  summary.error = redact(error.message);
  process.exitCode = 1;
} finally {
  if (apiProcess && apiProcess.exitCode === null) {
    const stopped = new Promise((resolveStopped) => apiProcess.once('close', resolveStopped));
    await stopProcessTree(apiProcess);
    await Promise.race([stopped, delay(5000)]);
  }
  await writeFile(join(runDirectory, 'api-output.txt'), redact(apiOutput));
  await writeFile(join(runDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ runDirectory, passed: summary.passed, error: summary.error }));
}
