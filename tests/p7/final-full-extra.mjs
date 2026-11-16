// Final acceptance supplements. All writes are restricted to synthetic databases/profiles.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [sourceArgument, playwrightPackage, electronArgument] = process.argv.slice(2);
assert(
  sourceArgument && playwrightPackage && electronArgument,
  'sourceRoot playwright/package.json electron.exe required',
);
const source = resolve(sourceArgument);
const electronExe = resolve(electronArgument);
const baseline = process.env.P7_ACCEPTANCE_BASE ?? '0932ae204533ec50ec0237b81a2343e39e15dd43';
const startupOnly = process.argv.includes('--startup-only');
const uiOnly = process.argv.includes('--ui-only');
const output = join(
  process.env.P7_EVIDENCE_ROOT
    ? resolve(process.env.P7_EVIDENCE_ROOT)
    : join(root, 'tmp/final-full-2026-11-12'),
  `extra-${Date.now()}`,
);
mkdirSync(output, { recursive: true });
for (const path of [
  'apps/api/dist/main.js',
  'apps/desktop/out/main/index.js',
  'prisma/schema.prisma',
])
  assert(existsSync(join(source, path)), `Missing source/build: ${path}`);
assert(existsSync(electronExe));
const { PrismaClient } = createRequire(join(source, 'package.json'))('@prisma/client');
const { _electron } = createRequire(resolve(playwrightPackage))('playwright');
const secret = randomBytes(48).toString('hex');
const password = randomBytes(24).toString('base64url');
const database = join(output, 'upgrade.sqlite');
writeFileSync(database, '', { flag: 'wx' });
const env = {
  ...process.env,
  NODE_ENV: 'test',
  APP_HOST: '127.0.0.1',
  APP_PORT: '3000',
  DATABASE_URL: 'file:' + database.replaceAll('\\', '/'),
  JWT_SECRET: secret,
  JWT_EXPIRES_IN: '2h',
  CORS_ORIGINS: 'null,http://localhost:5173',
  LOG_LEVEL: 'error',
  ELECTRON_RENDERER_URL: '',
};
delete env.ELECTRON_RUN_AS_NODE;
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const results = [],
  rendererErrors = [],
  network = [],
  resources = [];
let api, desktop, page, base, owner, smallProject, largeProject, resourceTimer;
const apiLogs = [];
function redact(value) {
  return String(value)
    .replaceAll(secret, '[REDACTED]')
    .replaceAll(password, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
}
function save() {
  writeFileSync(
    join(output, 'results.json'),
    JSON.stringify(
      { baseline, source, output, results, rendererErrors, network, resources },
      null,
      2,
    ),
  );
}
async function test(id, name, action) {
  const started = performance.now();
  try {
    results.push({
      id,
      name,
      status: 'PASS',
      details: await action(),
      milliseconds: Math.round(performance.now() - started),
    });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', reason: redact(error.message).slice(-2000) });
    await page
      ?.screenshot({ path: join(output, id + '-failure.png'), timeout: 10000 })
      .catch(() => {});
  }
  save();
  console.log(JSON.stringify(results.at(-1)));
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  await new Promise((done) => {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    killer.once('error', () => {
      child.kill();
      done();
    });
    killer.once('close', done);
  });
}
async function command(name, args, environment = env, timeout = 30000) {
  let text = '';
  const child = spawn(process.execPath, args, {
    cwd: source,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (x) => (text += x));
  child.stderr.on('data', (x) => (text += x));
  const timer = setTimeout(() => void stop(child), timeout);
  const code = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', done);
  });
  clearTimeout(timer);
  text = redact(text);
  writeFileSync(join(output, name + '.txt'), text);
  return { code, text };
}
async function migrate(name, schema = join(source, 'prisma/schema.prisma'), environment = env) {
  const result = await command(
    name,
    [join(source, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema],
    environment,
  );
  assert.equal(result.code, 0, name + ': ' + result.text.slice(-600));
}
async function port() {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const number = server.address().port;
  await new Promise((done) => server.close(done));
  return number;
}
async function startApi() {
  let text = '';
  api = spawn(process.execPath, [join(source, 'apps/api/dist/main.js')], {
    cwd: join(source, 'apps/api'),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout.on('data', (x) => (text += x));
  api.stderr.on('data', (x) => (text += x));
  apiLogs.push(() => text);
  for (let i = 0; i < 100; i++) {
    assert.equal(api.exitCode, null, 'API exited before healthy');
    try {
      if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* Startup is bounded by the loop. */
    }
    await delay(100);
  }
  throw new Error('API did not become healthy');
}
async function request(path, method = 'GET', user, body, expected = 200) {
  const started = performance.now();
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(user ? { authorization: `Bearer ${user.token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const text = Buffer.from(await response.arrayBuffer()).toString('utf8');
  network.push({
    path,
    method,
    status: response.status,
    milliseconds: Math.round(performance.now() - started),
  });
  assert.equal(response.status, expected, `${method} ${path}: ${redact(text).slice(0, 250)}`);
  if (response.headers.get('content-type')?.includes('text/csv')) return text;
  return JSON.parse(text).data;
}
async function account(label) {
  const username = 'full-' + label + '-' + randomBytes(4).toString('hex');
  const user = await request(
    '/auth/register',
    'POST',
    undefined,
    { username, nickname: '全面测试' + label, password },
    201,
  );
  const session = await request('/auth/login', 'POST', undefined, { username, password });
  return { ...user, username, token: session.accessToken };
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    maximum: sorted.at(-1) ?? 0,
  };
}
async function navigate(projectId, route) {
  await page.evaluate((hash) => {
    globalThis.location.hash = hash;
  }, `#/projects/${projectId}/${route}`);
}
async function snapshot() {
  return {
    user: await prisma.user.findUnique({ where: { id: 'full-legacy-user' } }),
    project: await prisma.project.findUnique({ where: { id: 'full-legacy-project' } }),
    task: await prisma.task.findUnique({ where: { id: 'full-legacy-task' } }),
    activity: await prisma.activityLog.findUnique({ where: { id: 'full-legacy-activity' } }),
  };
}
try {
  if (!startupOnly)
    await test('X01', '旧库升级、重复迁移及合成历史保留', async () => {
      const files = execFileSync(
        'git',
        ['ls-tree', '-r', '--name-only', '2d4d6004ceffdf2099f8bb75f10f01f0cb94800c', 'prisma'],
        { cwd: root },
      )
        .toString()
        .trim()
        .split('\n');
      for (const file of files.filter(
        (x) => x.endsWith('schema.prisma') || x.includes('/migrations/'),
      )) {
        const target = join(output, 'legacy', file);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(
          target,
          execFileSync('git', ['show', `2d4d6004ceffdf2099f8bb75f10f01f0cb94800c:${file}`], {
            cwd: root,
          }),
        );
      }
      await migrate('legacy-migrate', join(output, 'legacy/prisma/schema.prisma'));
      const salt = randomBytes(16),
        passwordHash = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
      await prisma.user.create({
        data: {
          id: 'full-legacy-user',
          username: 'full-legacy-user',
          nickname: '升级保留用户',
          passwordHash,
        },
      });
      await prisma.project.create({
        data: {
          id: 'full-legacy-project',
          name: '升级保留项目',
          ownerId: 'full-legacy-user',
          status: 'ACTIVE',
        },
      });
      await prisma.projectMember.create({
        data: { projectId: 'full-legacy-project', userId: 'full-legacy-user', role: 'OWNER' },
      });
      await prisma.task.create({
        data: {
          id: 'full-legacy-task',
          projectId: 'full-legacy-project',
          createdById: 'full-legacy-user',
          title: '升级保留任务',
        },
      });
      await prisma.activityLog.create({
        data: {
          id: 'full-legacy-activity',
          projectId: 'full-legacy-project',
          actorId: 'full-legacy-user',
          action: 'TASK_CREATED',
          targetType: 'TASK',
          targetId: 'full-legacy-task',
          afterValue: JSON.stringify({ title: '升级保留任务' }),
        },
      });
      const before = await snapshot();
      await migrate('upgrade-migrate');
      assert.deepEqual(await snapshot(), before);
      await migrate('repeat-migrate');
      assert.deepEqual(await snapshot(), before);
      assert.equal(await prisma.userDisableAudit.count(), 0);
      const migrations = await prisma.$queryRawUnsafe(
        'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name',
      );
      assert.equal(migrations.length, 5);
      assert(migrations.every((x) => x.finished_at !== null));
      return {
        oldMigrations: 4,
        currentMigrations: 5,
        preservedModels: Object.keys(before),
        repeatNoDataChange: true,
      };
    });
  env.APP_PORT = String(await port());
  base = `http://127.0.0.1:${env.APP_PORT}/api/v1`;
  await test('X02', '配置缺失与端口占用安全退出，错误数据库请求安全失败', async () => {
    const missing = { ...env };
    missing.JWT_SECRET = '';
    const a = await command(
      'startup-missing-secret',
      [join(source, 'apps/api/dist/main.js')],
      missing,
    );
    assert.notEqual(a.code, 0);
    assert.match(a.text, /JWT_SECRET is required/);
    // Prisma connects lazily: exercise a real database request after health is ready.
    const badPort = await port();
    const badBase = `http://127.0.0.1:${badPort}/api/v1`;
    let badLog = '';
    const badApi = spawn(process.execPath, [join(source, 'apps/api/dist/main.js')], {
      cwd: join(source, 'apps/api'),
      env: {
        ...env,
        APP_PORT: String(badPort),
        DATABASE_URL: 'file:' + join(output, 'absent-parent/not-a-db.sqlite').replaceAll('\\', '/'),
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    badApi.stdout.on('data', (x) => (badLog += x));
    badApi.stderr.on('data', (x) => (badLog += x));
    let badResponse;
    try {
      let healthy = false;
      for (let i = 0; i < 100; i++) {
        try {
          healthy = (await fetch(badBase + '/health', { signal: AbortSignal.timeout(1000) })).ok;
        } catch {
          /* Startup is bounded by this loop. */
        }
        if (healthy) break;
        await delay(100);
      }
      assert(healthy, 'Invalid database probe API did not start');
      const response = await fetch(badBase + '/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'synthetic-probe', password }),
        signal: AbortSignal.timeout(10000),
      });
      badResponse = { status: response.status, body: await response.text() };
      assert.equal(badResponse.status, 500);
      assert(!/Prisma|SQL|[CD]:[\\/]|node_modules|stack|passwordHash/.test(badResponse.body));
      assert.equal(JSON.parse(badResponse.body).error.code, 'INTERNAL_SERVER_ERROR');
    } finally {
      await stop(badApi);
      writeFileSync(join(output, 'invalid-database-api.txt'), redact(badLog));
      if (badResponse)
        writeFileSync(
          join(output, 'invalid-database-response.json'),
          JSON.stringify(badResponse, null, 2),
        );
    }
    const occupied = createServer();
    await new Promise((done) => occupied.listen(Number(env.APP_PORT), '127.0.0.1', done));
    let c;
    try {
      c = await command('startup-occupied-port', [join(source, 'apps/api/dist/main.js')]);
    } finally {
      await new Promise((done) => occupied.close(done));
    }
    assert.notEqual(c.code, 0);
    for (const result of [a, c])
      assert(!/Error:|node_modules|[CD]:[\\/]|at bootstrap/.test(result.text));
    return {
      missingSecretRejected: true,
      badDatabaseRequestSafelyFailed: true,
      occupiedPortRejected: true,
      safeMessages: true,
    };
  });
  if (startupOnly) throw new Error('STARTUP_ONLY_COMPLETE');
  await startApi();
  owner = await account('owner');
  smallProject = await request(
    '/projects',
    'POST',
    owner,
    { name: '全面测试普通项目', startDate: '2026-11-01', endDate: '2026-12-31' },
    201,
  );
  await prisma.task.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      projectId: smallProject.id,
      createdById: owner.id,
      assigneeId: owner.id,
      title: `normal-${i}`,
      status: 'TODO',
    })),
  });
  if (!uiOnly)
    await test('X03', '20个独立账号60秒持续混合读写', async () => {
      const users = [];
      for (let i = 0; i < 20; i++) {
        const user = await account('load' + i);
        users.push(user);
        await request(
          `/projects/${smallProject.id}/members`,
          'POST',
          owner,
          { username: user.username, role: 'MEMBER' },
          201,
        );
      }
      const records = [],
        start = performance.now(),
        duration = 60000;
      let sampling = false;
      resourceTimer = setInterval(() => {
        if (sampling || !api?.pid) return;
        sampling = true;
        const child = spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `$p=Get-Process -Id ${api.pid} -ErrorAction SilentlyContinue; if($p){[PSCustomObject]@{rssBytes=$p.WorkingSet64;cpuSeconds=$p.CPU}|ConvertTo-Json -Compress}`,
          ],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
        );
        let text = '';
        child.stdout.on('data', (x) => (text += x));
        child.once('close', () => {
          try {
            resources.push({
              milliseconds: Math.round(performance.now() - start),
              ...JSON.parse(text),
            });
          } catch {
            /* Sampling failures do not change request outcomes. */
          }
          sampling = false;
        });
      }, 5000);
      await Promise.all(
        users.map(async (user, worker) => {
          let sequence = 0;
          while (performance.now() - start < duration) {
            const tick = performance.now(),
              write = sequence % 4 === worker % 4;
            const path =
              `/projects/${smallProject.id}/` +
              (write ? 'tasks' : sequence % 2 ? 'dashboard' : 'tasks?search=normal');
            try {
              const data = await request(
                path,
                write ? 'POST' : 'GET',
                user,
                write ? { title: `load-${worker}-${sequence}`, priority: 'MEDIUM' } : undefined,
                write ? 201 : 200,
              );
              if (!write && !Array.isArray(data)) assert.equal(data.project.id, smallProject.id);
              records.push({
                worker,
                sequence,
                write,
                pass: true,
                milliseconds: Math.round(performance.now() - tick),
              });
            } catch (error) {
              records.push({
                worker,
                sequence,
                write,
                pass: false,
                reason: redact(error.message).slice(0, 300),
                milliseconds: Math.round(performance.now() - tick),
              });
            }
            sequence++;
            await delay(Math.max(0, 1000 - (performance.now() - tick)));
          }
        }),
      );
      clearInterval(resourceTimer);
      const elapsed = Math.round(performance.now() - start);
      const summary = {
        users: 20,
        durationMilliseconds: elapsed,
        model: 'one request/user/second; 25% create task, 75% list/dashboard',
        total: records.length,
        successful: records.filter((x) => x.pass).length,
        writes: distribution(records.filter((x) => x.write).map((x) => x.milliseconds)),
        reads: distribution(records.filter((x) => !x.write).map((x) => x.milliseconds)),
        errors: records.filter((x) => !x.pass),
      };
      writeFileSync(
        join(output, 'load.json'),
        JSON.stringify({ summary, records, resources }, null, 2),
      );
      assert.equal(
        summary.errors.length,
        0,
        `${summary.errors.length} workload requests failed; see load.json`,
      );
      const committed = await prisma.task.count({
        where: { projectId: smallProject.id, title: { startsWith: 'load-' } },
      });
      assert.equal(committed, records.filter((x) => x.write && x.pass).length);
      assert(summary.reads.p95 < 1000, 'Read p95 exceeded normal query target');
      return { ...summary, committedWrites: committed };
    });
  await test('X04', '10000任务HTTP列表、筛选、统计及CSV完整性', async () => {
    largeProject = await request(
      '/projects',
      'POST',
      owner,
      { name: '全面测试万任务项目', startDate: '2026-11-01', endDate: '2026-12-31' },
      201,
    );
    for (let offset = 0; offset < 10000; offset += 1000)
      await prisma.task.createMany({
        data: Array.from({ length: 1000 }, (_, i) => ({
          projectId: largeProject.id,
          createdById: owner.id,
          assigneeId: owner.id,
          title: `capacity-${String(offset + i).padStart(5, '0')}`,
          status: 'TODO',
        })),
      });
    const listStart = performance.now();
    const tasks = await request(`/projects/${largeProject.id}/tasks`, 'GET', owner);
    const listMilliseconds = Math.round(performance.now() - listStart);
    assert.equal(tasks.length, 10000);
    const filtered = await request(
      `/projects/${largeProject.id}/tasks?search=capacity-000`,
      'GET',
      owner,
    );
    assert.equal(filtered.length, 100);
    const dashboard = await request(`/projects/${largeProject.id}/dashboard`, 'GET', owner);
    assert.equal(dashboard.summary.totalTasks, 10000);
    const csv = await request(`/projects/${largeProject.id}/tasks/export`, 'GET', owner);
    assert(csv.startsWith('\uFEFF'));
    assert.equal(csv.trim().split(/\r?\n/).length, 10001);
    writeFileSync(join(output, 'capacity.csv'), csv);
    return {
      tasks: tasks.length,
      filtered: filtered.length,
      listMilliseconds,
      csvRows: 10000,
      csvSha256: createHash('sha256').update(csv).digest('hex'),
    };
  });
  const launchStarted = performance.now();
  desktop = await _electron.launch({
    executablePath: electronExe,
    args: [
      join(source, 'apps/desktop/out/main/index.js'),
      '--user-data-dir=' + join(output, 'profile'),
    ],
    env: { ...env, ELECTRON_API_BASE_URL: base },
    timeout: 30000,
  });
  page = await desktop.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => rendererErrors.push(redact(error.message)));
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
  const loginVisibleMilliseconds = Math.round(performance.now() - launchStarted);
  await page.getByLabel('用户名', { exact: true }).fill(owner.username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '项目中心', exact: true }).waitFor();
  await test('X05', '首次普通业务页面加载及最小窗口布局', async () => {
    const timings = [];
    for (const [route, heading, ready] of [
      ['overview', '项目概览', '.metric-card'],
      ['requirements', '需求管理', '.page-stack'],
      ['board', '任务看板', '.task-filter-panel'],
      ['iterations', '迭代计划', '.page-stack'],
      ['meetings', '会议纪要', '.page-stack'],
      ['acceptance', '阶段验收', '.page-stack'],
      ['reports', '统计与导出', '.metric-card'],
      ['members', '成员管理', '.page-stack'],
      ['settings', '项目设置', '.page-stack'],
    ]) {
      const started = performance.now();
      await navigate(smallProject.id, route);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      await page.locator(ready).first().waitFor();
      await page
        .getByRole('status')
        .filter({ hasText: /正在加载/ })
        .waitFor({ state: 'hidden' })
        .catch(() => {});
      const milliseconds = Math.round(performance.now() - started);
      timings.push({ route, milliseconds });
    }
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(960, 640),
    );
    await navigate(smallProject.id, 'overview');
    await page.locator('.metric-card').first().waitFor();
    const layout = await page.evaluate(() => ({
      width: globalThis.innerWidth,
      documentWidth: globalThis.document.documentElement.scrollWidth,
      height: globalThis.innerHeight,
      dpr: globalThis.devicePixelRatio,
    }));
    await page.screenshot({ path: join(output, 'minimum-window.png') });
    writeFileSync(
      join(output, 'page-timings.json'),
      JSON.stringify({ loginVisibleMilliseconds, timings, layout }, null, 2),
    );
    assert(
      timings.every((x) => x.milliseconds <= 3000),
      'A normal first page load exceeded 3 seconds; see page-timings.json',
    );
    assert(layout.documentWidth <= layout.width + 1, 'Minimum window horizontal overflow');
    return {
      loginVisibleMilliseconds,
      timings,
      layout,
      measured:
        'first route navigation after UI login, one sample/route, not independent process cold starts',
    };
  });
  await test('X06', '万任务真实看板渲染、筛选、下载及交互响应', async () => {
    const expectedTasks = await request(`/projects/${largeProject.id}/tasks`, 'GET', owner);
    const expectedTitles = expectedTasks.map((task) => task.title);
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1280, 800),
    );
    const started = performance.now();
    await navigate(largeProject.id, 'board');
    const todoColumn = page.locator('[data-task-status="TODO"]');
    await page.locator('[data-task-status="TODO"][data-task-count="10000"]').waitFor();
    assert.equal(await page.locator('.task-card').count(), 50);
    assert.deepEqual(
      await todoColumn.locator('.task-card h3').allTextContents(),
      expectedTitles.slice(0, 50),
    );
    const renderedMilliseconds = Math.round(performance.now() - started);
    const heartbeat = await page.evaluate(
      () =>
        new Promise((done) => {
          const start = performance.now();
          setTimeout(() => done(Math.round(performance.now() - start)), 100);
        }),
    );
    writeFileSync(
      join(output, 'capacity-ui-observation.json'),
      JSON.stringify(
        {
          renderedMilliseconds,
          heartbeat,
          cards: await page.locator('.task-card').count(),
          buttons: await page.locator('button').count(),
        },
        null,
        2,
      ),
    );
    const pageSelect = page.getByLabel('待开始页码', { exact: true });
    await pageSelect.selectOption('199');
    assert.deepEqual(
      await todoColumn.locator('.task-card h3').allTextContents(),
      expectedTitles.slice(9950),
    );
    assert(await page.getByRole('button', { name: '待开始下一页', exact: true }).isDisabled());
    await page.getByRole('button', { name: '待开始上一页', exact: true }).click();
    assert.deepEqual(
      await todoColumn.locator('.task-card h3').allTextContents(),
      expectedTitles.slice(9900, 9950),
    );
    await pageSelect.selectOption('0');
    const titleInput = page.locator('.task-filter-panel').getByLabel('标题搜索', { exact: true });
    const fillStarted = performance.now();
    await titleInput.fill('capacity-000');
    const fillMilliseconds = Math.round(performance.now() - fillStarted);
    await titleInput.fill('');
    const inputStarted = performance.now();
    await titleInput.pressSequentially('capacity-000');
    const inputMilliseconds = Math.round(performance.now() - inputStarted);
    const filterStarted = performance.now();
    await page.getByRole('button', { name: '应用筛选', exact: true }).click();
    await page.locator('[data-task-status="TODO"][data-task-count="100"]').waitFor();
    const filterMilliseconds = Math.round(performance.now() - filterStarted);
    writeFileSync(
      join(output, 'capacity-interaction.json'),
      JSON.stringify(
        { fillMilliseconds, inputMilliseconds, filterMilliseconds, budgetMilliseconds: 3000 },
        null,
        2,
      ),
    );
    assert(
      fillMilliseconds <= 3000,
      'Filling the search input exceeded the 3 second interaction budget',
    );
    assert(inputMilliseconds <= 3000, 'Typing exceeded the 3 second interaction budget');
    assert(filterMilliseconds <= 3000, 'Applying filters exceeded the 3 second interaction budget');
    const expectedFiltered = expectedTitles.filter((title) => title.includes('capacity-000'));
    assert.equal(expectedFiltered.length, 100);
    assert.equal(await page.locator('.task-card').count(), 50);
    assert.deepEqual(
      await todoColumn.locator('.task-card h3').allTextContents(),
      expectedFiltered.slice(0, 50),
    );
    await pageSelect.selectOption('1');
    assert.deepEqual(
      await todoColumn.locator('.task-card h3').allTextContents(),
      expectedFiltered.slice(50),
    );
    await desktop.evaluate(({ session }, directory) => {
      globalThis.fullDownloads = [];
      session.defaultSession.on('will-download', (_event, item) => {
        const record = { state: null, path: directory + '/native-capacity.csv' };
        globalThis.fullDownloads.push(record);
        item.setSavePath(record.path);
        item.once('done', (_event, state) => {
          record.state = state;
        });
      });
    }, output);
    await page
      .locator('.task-filter-panel')
      .getByRole('button', { name: '导出当前结果', exact: true })
      .click();
    let download;
    for (let i = 0; i < 100; i++) {
      download = await desktop.evaluate(() => globalThis.fullDownloads.at(-1));
      if (download?.state === 'completed') break;
      await delay(100);
    }
    assert.equal(download?.state, 'completed');
    const csv = readFileSync(download.path, 'utf8');
    assert.equal(csv.trim().split(/\r?\n/).length, 101);
    for (const title of expectedFiltered) assert(csv.includes(title));
    await page.screenshot({ path: join(output, 'large-filtered-board.png') });
    await todoColumn.locator('.board-column__header').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, 'large-paginated-board.png') });
    await navigate(largeProject.id, 'overview');
    await page.locator('.metric-card').first().getByText('10000', { exact: true }).waitFor();
    return {
      totalTasks: 10000,
      renderedCards: 50,
      renderedMilliseconds,
      eventLoop100msTimer: heartbeat,
      filteredCards: 100,
      renderedFilteredCards: 50,
      lastPageVerified: 200,
      fillMilliseconds,
      inputMilliseconds,
      filterMilliseconds,
      actualDownloadRows: 100,
      dashboardTotal: 10000,
    };
  });
  await test('X07', '真实API停止重启后界面恢复和数据持久化', async () => {
    await navigate(largeProject.id, 'overview');
    await page.locator('.metric-card').first().getByText('10000', { exact: true }).waitFor();
    const before = await prisma.task.count({ where: { projectId: largeProject.id } });
    await stop(api);
    await page.reload();
    await page.getByRole('button', { name: /重试/ }).first().waitFor();
    await startApi();
    await page.getByRole('button', { name: /重试/ }).first().click();
    await page.locator('.metric-card').first().getByText('10000', { exact: true }).waitFor();
    assert.equal(await prisma.task.count({ where: { projectId: largeProject.id } }), before);
    const session = await request('/auth/login', 'POST', undefined, {
      username: 'full-legacy-user',
      password,
    });
    const legacy = await request('/projects/full-legacy-project/tasks', 'GET', {
      token: session.accessToken,
    });
    assert.equal(legacy[0].id, 'full-legacy-task');
    assert.equal(rendererErrors.length, 0);
    return { retainedTasks: before, legacyLoginAndHistoryAccessible: true, rendererErrors: 0 };
  });
} catch (error) {
  if (error.message !== 'STARTUP_ONLY_COMPLETE')
    results.push({ id: 'HARNESS', status: 'FAIL', reason: redact(error.message).slice(-2000) });
} finally {
  clearInterval(resourceTimer);
  await desktop?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await stop(api);
  await prisma.$disconnect();
  writeFileSync(join(output, 'api.txt'), redact(apiLogs.map((fn) => fn()).join('\n')));
  save();
  console.log(
    JSON.stringify({
      output,
      passed: results.filter((x) => x.status === 'PASS').length,
      failed: results.filter((x) => x.status === 'FAIL').length,
    }),
  );
  process.exitCode = results.some((x) => x.status === 'FAIL') ? 1 : 0;
}
