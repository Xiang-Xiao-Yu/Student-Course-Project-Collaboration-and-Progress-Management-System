// P7 HTTP/security/performance checks against a disposable DB and standard Electron.
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [playwrightPackage, electronExe] = process.argv.slice(2);
assert(playwrightPackage && electronExe, 'Required: playwright/package.json electron.exe');
const baseline = process.env.P7_ACCEPTANCE_BASE ?? '2d4d6004ceffdf2099f8bb75f10f01f0cb94800c';
execFileSync(
  'git',
  [
    'diff',
    '--exit-code',
    baseline,
    '--',
    'apps',
    'packages',
    'prisma',
    'package.json',
    'pnpm-lock.yaml',
  ],
  { cwd: root, stdio: 'pipe' },
);
const evidenceRoot = process.env.P7_EVIDENCE_ROOT
  ? resolve(process.env.P7_EVIDENCE_ROOT)
  : join(root, 'tmp/p7-final-2026-11-12');
const output = join(evidenceRoot, `supplement-${Date.now()}`);
mkdirSync(output, { recursive: true });
const database = join(output, 'p7.sqlite');
writeFileSync(database, '', { flag: 'wx' });
const secret = randomBytes(48).toString('hex');
const password = randomBytes(24).toString('base64url');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  APP_HOST: '127.0.0.1',
  DATABASE_URL: `file:${database.replaceAll('\\', '/')}`,
  JWT_SECRET: secret,
  JWT_EXPIRES_IN: '2h',
  CORS_ORIGINS: 'null,http://localhost:5173',
  LOG_LEVEL: 'error',
  ELECTRON_RENDERER_URL: '',
};
delete env.ELECTRON_RUN_AS_NODE;
const { PrismaClient } = createRequire(join(root, 'package.json'))('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const { _electron } = createRequire(resolve(playwrightPackage))('playwright');
const results = [],
  network = [],
  errors = [],
  tokens = [];
let api,
  app,
  page,
  base,
  apiLog = '';
const redact = (text) =>
  String(text)
    .replaceAll(secret, '[REDACTED]')
    .replaceAll(password, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
function save() {
  writeFileSync(
    join(output, 'results.json'),
    JSON.stringify({ baseline, results, network, rendererErrors: errors }, null, 2),
  );
}
async function test(id, name, action) {
  try {
    const details = await action();
    results.push({ id, name, status: 'PASS', details });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', reason: redact(error.message).slice(-1500) });
    if (page)
      await page
        .screenshot({ path: join(output, `${id}-failure.png`), timeout: 10000 })
        .catch(() => {});
  }
  save();
  console.log(JSON.stringify(results.at(-1)));
}
function safeError(text) {
  assert(!text.includes(secret) && !text.includes(password), 'Error exposed a credential');
  assert(!tokens.some((token) => text.includes(token)), 'Error exposed a session');
  assert(
    !/[CD]:[\\/]|node_modules|passwordHash|tokenVersion|JWT_SECRET|"stack"|PrismaClient/i.test(
      text,
    ),
    'Error exposed implementation detail',
  );
}
async function request(path, method = 'GET', user, body, expected = 200) {
  if (method === 'POST' && /\/(tasks|requirements)$/.test(path))
    body = { priority: 'MEDIUM', ...body };
  const started = performance.now();
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(user?.token ? { authorization: `Bearer ${user.token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const text = Buffer.from(await response.arrayBuffer()).toString('utf8');
  network.push({
    method,
    path,
    status: response.status,
    milliseconds: Math.round(performance.now() - started),
  });
  if (!response.ok) safeError(text);
  assert.equal(response.status, expected, `${method} ${path}: ${text.slice(0, 250)}`);
  if (response.headers.get('content-type')?.includes('text/csv')) return text;
  const payload = JSON.parse(text);
  assert.equal(payload.success, expected < 400);
  return payload.data ?? payload.error;
}
async function account(label) {
  const username = `p7-${label}-${randomBytes(6).toString('hex')}`;
  const user = await request(
    '/auth/register',
    'POST',
    undefined,
    { username, nickname: `P7 ${label}`, password },
    201,
  );
  const session = await request('/auth/login', 'POST', undefined, { username, password });
  tokens.push(session.accessToken);
  return { ...user, username, token: session.accessToken };
}
async function login(user) {
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill(user.username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/auth/login')),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ]);
  user.token = (await response.json()).data.accessToken;
  tokens.push(user.token);
  await page.evaluate(() => {
    globalThis.location.hash = '#/projects';
  });
  await page.getByRole('heading', { name: '项目中心', exact: true }).waitFor();
}
async function navigate(id, route = 'overview') {
  await page.evaluate((hash) => {
    globalThis.location.hash = hash;
  }, `#/projects/${id}/${route}`);
}
async function logout() {
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
}
try {
  const migration = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      'prisma/schema.prisma',
    ],
    { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 30000 },
  );
  writeFileSync(join(output, 'migration.txt'), redact(migration.stdout + migration.stderr));
  assert.equal(migration.status, 0);
  const probe = createServer();
  await new Promise((done) => probe.listen(0, '127.0.0.1', done));
  env.APP_PORT = String(probe.address().port);
  await new Promise((done) => probe.close(done));
  base = `http://127.0.0.1:${env.APP_PORT}/api/v1`;
  api = spawn(process.execPath, [join(root, 'apps/api/dist/main.js')], {
    cwd: join(root, 'apps/api'),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout.on('data', (chunk) => {
    apiLog += chunk;
  });
  api.stderr.on('data', (chunk) => {
    apiLog += chunk;
  });
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(api.exitCode, null);
    try {
      healthy = (await fetch(`${base}/health`)).ok;
    } catch {
      /* The isolated API may still be starting. */
    }
    if (healthy) break;
    await delay(150);
  }
  assert(healthy, 'API failed to become ready');
  const owner = await account('owner'),
    member = await account('member'),
    observer = await account('observer'),
    outsider = await account('outsider'),
    admin = await account('admin');
  // Fixture setup only: bootstrap an admin in this new DB; exercise permissions through HTTP.
  await prisma.user.update({ where: { id: admin.id }, data: { isPlatformAdmin: true } });
  const project = await request(
    '/projects',
    'POST',
    owner,
    { name: 'P7 角色与边界验收', startDate: '2026-11-01', endDate: '2026-12-31' },
    201,
  );
  const prefix = `/projects/${project.id}`;
  for (const [user, role] of [
    [member, 'MEMBER'],
    [observer, 'OBSERVER'],
  ])
    await request(`${prefix}/members`, 'POST', owner, { username: user.username, role }, 201);
  const task = await request(
    `${prefix}/tasks`,
    'POST',
    owner,
    { title: 'P7 权限任务', assigneeId: member.id },
    201,
  );

  await test('S01', '五角色服务端读取与跨项目隔离矩阵', async () => {
    const paths = [
      '',
      '/members',
      '/requirements',
      '/tasks',
      '/iterations',
      '/meetings',
      '/acceptances',
      '/dashboard',
      '/activity',
      `/comments?targetType=TASK&targetId=${task.id}`,
    ];
    for (const user of [admin, owner, member, observer, outsider])
      for (const path of paths)
        await request(prefix + path, 'GET', user, undefined, user === outsider ? 404 : 200);
    return { roles: 5, readAssertions: 50 };
  });
  await test('S02', '五角色写入矩阵及成员管理保护', async () => {
    for (const user of [admin, owner, member, observer, outsider]) {
      const writable = [admin, owner, member].includes(user);
      const expected = user === outsider ? 404 : writable ? 201 : 403;
      await request(
        `${prefix}/requirements`,
        'POST',
        user,
        { title: `权限需求-${user.id}`, acceptanceCriteria: '仅可写角色创建' },
        expected,
      );
      await request(`${prefix}/tasks`, 'POST', user, { title: `权限任务-${user.id}` }, expected);
      await request(
        `${prefix}/meetings`,
        'POST',
        user,
        { title: `权限会议-${user.id}`, scheduledAt: '2026-11-20T10:00:00Z' },
        expected,
      );
      await request(
        `${prefix}/comments`,
        'POST',
        user,
        { targetType: 'TASK', targetId: task.id, content: 'P7 权限评论' },
        expected,
      );
      await request(
        prefix,
        'PATCH',
        user,
        { description: 'P7 管理权限' },
        user === outsider ? 404 : [admin, owner].includes(user) ? 200 : 403,
      );
      await request(
        `${prefix}/reports/progress`,
        'GET',
        user,
        undefined,
        user === outsider ? 404 : [admin, owner].includes(user) ? 200 : 403,
      );
    }
    await request(`${prefix}/members/${owner.id}`, 'DELETE', owner, undefined, 409);
    await request(`${prefix}/members/${observer.id}`, 'DELETE', member, undefined, 403);
    await request(`${prefix}/members/${observer.id}`, 'PATCH', member, { role: 'MEMBER' }, 403);
    await request(prefix, 'DELETE', member, { confirmName: project.name }, 403);
    return { mutationAndExportAssertions: 34 };
  });
  await test('S03', '登录失败、过期令牌、退出失效及禁用拦截', async () => {
    await request(
      '/auth/login',
      'POST',
      undefined,
      { username: owner.username, password: 'incorrect-password' },
      401,
    );
    await request(
      '/auth/register',
      'POST',
      undefined,
      { username: owner.username, nickname: '重复', password },
      409,
    );
    await request('/users/me', 'GET', undefined, undefined, 401);
    await request('/users/me', 'GET', { token: 'invalid.jwt.token' }, undefined, 401);
    const { JwtService } = createRequire(join(root, 'apps/api/package.json'))('@nestjs/jwt');
    const expired = new JwtService({ secret }).sign(
      { sub: owner.id, tokenVersion: 0 },
      { expiresIn: -1 },
    );
    await request('/users/me', 'GET', { token: expired }, undefined, 401);
    const loggedOut = await account('logout');
    await request('/auth/logout', 'POST', loggedOut);
    await request('/users/me', 'GET', loggedOut, undefined, 401);
    const disabled = await account('disabled');
    await prisma.user.update({ where: { id: disabled.id }, data: { status: 'DISABLED' } });
    await request('/users/me', 'GET', disabled, undefined, 403);
    await request('/auth/login', 'POST', undefined, { username: disabled.username, password }, 403);
    return { disabledFixture: 'Prisma test setup only; API guard and login tested over HTTP' };
  });
  await test('S04', '标题日期状态边界与不存在对象', async () => {
    await request(`${prefix}/tasks`, 'POST', owner, { title: 'x'.repeat(100) }, 201);
    for (const title of ['', ' ', 'x'.repeat(101)])
      await request(`${prefix}/tasks`, 'POST', owner, { title }, 400);
    await request(
      '/projects',
      'POST',
      owner,
      { name: '错误日期', startDate: '2026-11-02', endDate: '2026-11-01' },
      422,
    );
    const sameDay = await request(
      '/projects',
      'POST',
      owner,
      { name: '相等日期', startDate: '2026-11-01', endDate: '2026-11-01' },
      201,
    );
    assert.equal(sameDay.startDate, sameDay.endDate);
    await request(
      `${prefix}/tasks`,
      'POST',
      owner,
      { title: '项目外截止日期', dueDate: '2026-10-31' },
      422,
    );
    await request(
      `${prefix}/tasks/${task.id}/status`,
      'PATCH',
      member,
      { status: 'COMPLETED' },
      422,
    );
    await request(`${prefix}/tasks/not-found`, 'GET', owner, undefined, 404);
    await request('/projects/not-found', 'GET', owner, undefined, 404);
    await request(`${prefix}/tasks?dueDateFrom=2026-02-30`, 'GET', owner, undefined, 422);
    return { boundaryChecks: 11 };
  });
  await test('S05', '暂停禁止新增、恢复与归档只读', async () => {
    const p = await request('/projects', 'POST', owner, { name: 'P7 暂停归档项目' }, 201);
    const path = `/projects/${p.id}`;
    for (const status of ['ACTIVE', 'PAUSED'])
      await request(`${path}/status`, 'PATCH', owner, { status });
    await request(`${path}/tasks`, 'POST', owner, { title: '暂停禁止新增' }, 409);
    await request(
      `${path}/requirements`,
      'POST',
      owner,
      { title: '暂停需求', acceptanceCriteria: '禁止' },
      409,
    );
    await request(`${path}/status`, 'PATCH', owner, { status: 'ACTIVE' });
    const restored = await request(`${path}/tasks`, 'POST', owner, { title: '恢复后新增' }, 201);
    await request(`${path}/status`, 'PATCH', owner, { status: 'COMPLETED' });
    await request(`${path}/archive`, 'POST', owner);
    await request(`${path}/tasks`, 'GET', owner);
    await request(`${path}/tasks`, 'POST', owner, { title: '归档禁止新增' }, 409);
    await request(`${path}/tasks/${restored.id}`, 'PATCH', owner, { title: '归档禁止修改' }, 409);
    return { restoredTask: true, archiveReadOnly: true };
  });
  await test('S06', '评论所有权、成员移除后的历史与项目删除二次确认', async () => {
    const comment = await request(
      `${prefix}/comments`,
      'POST',
      member,
      { targetType: 'TASK', targetId: task.id, content: 'P7 历史评论' },
      201,
    );
    await request(`${prefix}/comments/${comment.id}`, 'PATCH', owner, { content: '修改他人' }, 403);
    await request(`${prefix}/comments/${comment.id}`, 'DELETE', owner, undefined, 403);
    const removable = await account('removed');
    await request(
      `${prefix}/members`,
      'POST',
      owner,
      { username: removable.username, role: 'MEMBER' },
      201,
    );
    const historical = await request(
      `${prefix}/tasks`,
      'POST',
      owner,
      { title: '移除成员历史任务', assigneeId: removable.id },
      201,
    );
    const historicalComment = await request(
      `${prefix}/comments`,
      'POST',
      removable,
      {
        targetType: 'TASK',
        targetId: historical.id,
        content: '被移除成员的历史评论',
      },
      201,
    );
    await request(`${prefix}/members/${removable.id}`, 'DELETE', owner);
    await request(prefix, 'GET', removable, undefined, 404);
    assert.equal(
      (await request(`${prefix}/tasks/${historical.id}`, 'GET', owner)).id,
      historical.id,
    );
    const retainedComments = await request(
      `${prefix}/comments?targetType=TASK&targetId=${historical.id}`,
      'GET',
      owner,
    );
    assert(
      retainedComments.some(
        (item) => item.id === historicalComment.id && item.author.id === removable.id,
      ),
      'Removed member comment history was lost',
    );
    const p = await request('/projects', 'POST', owner, { name: 'P7 合成删除验证' }, 201);
    await request(`/projects/${p.id}`, 'DELETE', owner, { confirmName: '错误名称' }, 422);
    await request(`/projects/${p.id}`, 'DELETE', owner, { confirmName: p.name });
    assert.equal(await prisma.projectDeletionAudit.count({ where: { projectId: p.id } }), 1);
    return { auditPersisted: true, removedMemberHistoryRetained: true };
  });
  await test('S07', '真实CSV公式注入防护与审计脱敏', async () => {
    for (const title of ['=P7FORMULA', '+P7FORMULA', '-P7FORMULA', '@P7FORMULA'])
      await request(`${prefix}/tasks`, 'POST', owner, { title }, 201);
    const csv = await request(`${prefix}/tasks/export`, 'GET', owner);
    assert(csv.startsWith('\uFEFF'));
    for (const marker of ['=', '+', '-', '@'])
      assert(csv.includes(`"'${marker}P7FORMULA"`), `Unsafe formula ${marker}`);
    safeError(JSON.stringify(await request(`${prefix}/activity`, 'GET', owner)));
    return { formulaPrefixes: 4, bom: true };
  });
  await test('S08', '20个独立用户同时访问', async () => {
    const users = [];
    for (let i = 0; i < 20; i++) {
      const user = await account(`load${i}`);
      users.push(user);
      await request(
        `${prefix}/members`,
        'POST',
        owner,
        { username: user.username, role: 'OBSERVER' },
        201,
      );
    }
    const started = performance.now();
    const data = await Promise.all(
      users.map((user) => request(`${prefix}/dashboard`, 'GET', user)),
    );
    assert(data.every((item) => item.project.id === project.id));
    return {
      users: 20,
      successfulReads: data.length,
      wallMilliseconds: Math.round(performance.now() - started),
    };
  });
  await test('S09', '单项目10000任务及常规查询响应', async () => {
    const p = await request(
      '/projects',
      'POST',
      owner,
      { name: 'P7 10000任务负载', startDate: '2026-11-01', endDate: '2026-12-31' },
      201,
    );
    await prisma.task.createMany({
      data: Array.from({ length: 10000 }, (_, i) => ({
        projectId: p.id,
        title: `P7-load-${String(i).padStart(5, '0')}`,
        createdById: owner.id,
        assigneeId: owner.id,
      })),
    });
    const started = performance.now();
    const tasks = await request(`/projects/${p.id}/tasks`, 'GET', owner);
    const largeListMilliseconds = Math.round(performance.now() - started);
    assert.equal(tasks.length, 10000);
    const dashboard = await request(`/projects/${p.id}/dashboard`, 'GET', owner);
    assert.equal(dashboard.summary.totalTasks, 10000);
    const smallStarted = performance.now();
    await request(`${prefix}/tasks`, 'GET', owner);
    const normalListMilliseconds = Math.round(performance.now() - smallStarted);
    assert(normalListMilliseconds < 1000, 'Normal task list exceeded 1 second');
    return { tasks: tasks.length, largeListMilliseconds, normalListMilliseconds };
  });

  app = await _electron.launch({
    executablePath: resolve(electronExe),
    args: [
      join(root, 'apps/desktop/out/main/index.js'),
      `--user-data-dir=${join(output, 'profile')}`,
    ],
    env: { ...env, ELECTRON_API_BASE_URL: base },
    timeout: 20000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(redact(error.message)));
  page.on('dialog', (dialog) => void dialog.accept().catch(() => {}));
  await test('S10', '未登录拦截与普通页面加载', async () => {
    await navigate(project.id);
    await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
    assert.equal(await page.getByText(project.name, { exact: true }).count(), 0);
    await login(owner);
    const started = performance.now();
    await navigate(project.id);
    await page.locator('.metric-card').first().waitFor();
    const milliseconds = Math.round(performance.now() - started);
    assert(milliseconds < 3000, 'Normal project page exceeded 3 seconds');
    await page.screenshot({ path: join(output, 'owner-dashboard.png') });
    return { normalPageMilliseconds: milliseconds };
  });
  await test('S11', '观察者界面只读与导出限制', async () => {
    await logout();
    await login(observer);
    await navigate(project.id, 'board');
    await page.locator('.task-filter-panel').waitFor();
    assert.equal(await page.getByRole('button', { name: '创建任务', exact: true }).count(), 0);
    await navigate(project.id, 'reports');
    await page.getByRole('heading', { name: '统计与导出', exact: true }).waitFor();
    await page.locator('.metric-card').first().waitFor();
    assert.equal(
      await page.getByRole('button', { name: '导出项目进度报告', exact: true }).count(),
      0,
    );
    await page.screenshot({ path: join(output, 'observer-reports.png') });
    return { writesHidden: true, exportHidden: true };
  });
  await test('S12', '空项目、无结果、导出失败后按钮恢复', async () => {
    await logout();
    await login(owner);
    const empty = await request('/projects', 'POST', owner, { name: 'P7 空项目界面' }, 201);
    await navigate(empty.id);
    await page.getByText('暂无任务状态', { exact: true }).waitFor();
    await navigate(project.id, 'board');
    await page.locator('.task-filter-panel').waitFor();
    await page
      .locator('.task-filter-panel')
      .getByLabel('标题搜索', { exact: true })
      .fill('P7-NOT-FOUND');
    await page.getByRole('button', { name: '应用筛选', exact: true }).click();
    await page.locator('.task-card').first().waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.task-card').count(), 0);
    assert((await page.getByText('暂无任务', { exact: true }).count()) > 0);
    await navigate(project.id, 'reports');
    await page.route('**/reports/progress', (route) => route.abort());
    await page.getByRole('button', { name: '导出项目进度报告', exact: true }).click();
    await page.getByText('无法连接到服务，请检查网络后重试。', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: '导出项目进度报告', exact: true }).isEnabled());
    await page.unroute('**/reports/progress');
    await page.screenshot({ path: join(output, 'export-failure-recoverable.png') });
    return { emptyState: true, noResults: true, failedExportEnabledForRetry: true };
  });
  await test('S13', '个人任务列表与会议评论持久化', async () => {
    await logout();
    await login(member);
    const assigned = await request('/users/me/tasks', 'GET', member);
    assert(assigned.some((item) => item.id === task.id));
    await page.getByRole('link', { name: '我的任务', exact: true }).click();
    await page.getByRole('heading', { name: '我的任务', exact: true }).waitFor();
    await page.getByText(task.title, { exact: true }).waitFor();
    await navigate(project.id, 'meetings');
    await page.locator('.comment-panel .comment-compose textarea').fill('P7 会议评论持久化');
    await page.getByRole('button', { name: '发表评论', exact: true }).click();
    await page.getByText('评论已发布。', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('P7 会议评论持久化', { exact: true }).waitFor();
    await page.screenshot({ path: join(output, 'member-meeting-comment.png') });
    return { assignedTaskVisible: true, meetingCommentPersisted: true };
  });
  await test('S14', '真实客户端未处理异常检查', async () => {
    assert.deepEqual(errors, []);
    return { rendererErrors: 0 };
  });
} catch (error) {
  results.push({
    id: 'HARNESS',
    name: '基础设施或准备',
    status: 'FAIL',
    reason: redact(error.message),
  });
} finally {
  await app?.evaluate(({ app: electron }) => electron.exit(0)).catch(() => {});
  if (api?.pid && api.exitCode === null) {
    const stop = spawn('taskkill.exe', ['/PID', String(api.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    await new Promise((done) => stop.once('close', done));
  }
  await prisma.$disconnect();
  writeFileSync(join(output, 'api.txt'), redact(apiLog));
  save();
  console.log(
    JSON.stringify({
      output,
      passed: results.filter((item) => item.status === 'PASS').length,
      failed: results.filter((item) => item.status === 'FAIL').length,
    }),
  );
  process.exitCode = results.some((item) => item.status === 'FAIL') ? 1 : 0;
}
