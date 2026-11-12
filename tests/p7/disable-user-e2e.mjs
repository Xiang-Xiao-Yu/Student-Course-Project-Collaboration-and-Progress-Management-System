import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
const output = join(root, 'tmp/p7-f01-fix', `e2e-${Date.now()}`);
mkdirSync(output, { recursive: true });
const database = join(output, 'p7.sqlite');
writeFileSync(database, '', { flag: 'wx' });
const secret = randomBytes(48).toString('hex'),
  password = randomBytes(24).toString('base64url');
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
  apps = [],
  rendererErrors = [],
  network = [];
let api,
  base,
  apiLog = '';
const redact = (text) =>
  String(text)
    .replaceAll(secret, '[REDACTED]')
    .replaceAll(password, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
let page, targetPage;
function save() {
  writeFileSync(
    join(output, 'results.json'),
    JSON.stringify({ results, rendererErrors, network }, null, 2),
  );
}
async function test(id, name, action) {
  try {
    const details = await action();
    results.push({ id, name, status: 'PASS', details });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', reason: redact(error.message).slice(-1500) });
    await page
      ?.screenshot({ path: join(output, `${id}-failure.png`), fullPage: true, timeout: 10000 })
      .catch(() => {});
  }
  save();
  console.log(JSON.stringify(results.at(-1)));
}
async function request(path, method = 'GET', user, body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(user ? { authorization: `Bearer ${user.token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${response.status}`);
  return payload.data;
}
async function account(label, administrator = false) {
  const username = `f01-${label}-${randomBytes(6).toString('hex')}`;
  const user = await request(
    '/auth/register',
    'POST',
    undefined,
    { username, nickname: `F01 ${label}`, password },
    201,
  );
  // Bootstrap only admin identity in the disposable DB. Disable must use UI/API.
  if (administrator)
    await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  const session = await request('/auth/login', 'POST', undefined, { username, password });
  return { ...user, username, token: session.accessToken };
}
async function launch(profile) {
  const app = await _electron.launch({
    executablePath: resolve(electronExe),
    args: [
      join(root, 'apps/desktop/out/main/index.js'),
      `--user-data-dir=${join(output, profile)}`,
    ],
    env: { ...env, ELECTRON_API_BASE_URL: base },
    timeout: 20000,
  });
  apps.push(app);
  const tab = await app.firstWindow();
  tab.setDefaultTimeout(10000);
  tab.on('pageerror', (error) => rendererErrors.push(redact(error.message)));
  tab.on('response', (response) => {
    if (response.url().startsWith(base))
      network.push({
        method: response.request().method(),
        path: response.url().slice(base.length),
        status: response.status(),
      });
  });
  return tab;
}
async function login(tab, user) {
  await tab.getByRole('heading', { name: '登录', exact: true }).waitFor();
  await tab.getByLabel('用户名', { exact: true }).fill(user.username);
  await tab.getByLabel('密码', { exact: true }).fill(password);
  const [response] = await Promise.all([
    tab.waitForResponse((r) => r.url().endsWith('/auth/login')),
    tab.getByRole('button', { name: '登录', exact: true }).click(),
  ]);
  assert.equal(response.status(), 200);
  user.token = (await response.json()).data.accessToken;
  await tab.evaluate(() => {
    globalThis.location.hash = '#/projects';
  });
  await tab.getByRole('heading', { name: '项目中心', exact: true }).waitFor();
}
function row(user) {
  return page.locator('.admin-user-row').filter({ hasText: `@${user.username}` });
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
  for (let i = 0; i < 100; i++) {
    assert.equal(api.exitCode, null);
    try {
      healthy = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      /* Await isolated startup. */
    }
    if (healthy) break;
    await delay(100);
  }
  assert(healthy);
  const admin = await account('admin', true),
    admin2 = await account('admin2', true),
    target = await account('target'),
    cancelled = await account('cancelled');
  const owner = await account('owner'),
    member = await account('member'),
    observer = await account('observer'),
    outsider = await account('outsider');
  const project = await request('/projects', 'POST', target, { name: 'F01 禁用后保留的项目' }, 201);
  await request(
    `/projects/${project.id}/tasks`,
    'POST',
    target,
    { title: 'F01 历史任务', priority: 'MEDIUM' },
    201,
  );
  const rolesProject = await request(
    '/projects',
    'POST',
    owner,
    { name: 'F01 非管理角色项目' },
    201,
  );
  for (const [user, role] of [
    [member, 'MEMBER'],
    [observer, 'OBSERVER'],
  ])
    await request(
      `/projects/${rolesProject.id}/members`,
      'POST',
      owner,
      { username: user.username, role },
      201,
    );
  page = await launch('admin-profile');
  targetPage = await launch('target-profile');
  await login(page, admin);
  await login(targetPage, target);

  await test('D01', '管理员从项目中心进入用户管理，管理员账户受保护', async () => {
    await page.getByRole('link', { name: '用户管理', exact: true }).click();
    await page.getByRole('heading', { name: '用户管理', exact: true }).waitFor();
    for (const protectedUser of [admin, admin2]) {
      await row(protectedUser).getByText('管理员账号受保护', { exact: true }).waitFor();
      assert.equal(await row(protectedUser).getByRole('button').count(), 0);
    }
    await page.screenshot({ path: join(output, 'admin-users-before.png'), fullPage: true });
    return { administratorShortcutVisible: true, protectedAdmins: 2 };
  });
  await test('D02', '取消确认不禁用用户、不写审计', async () => {
    await row(cancelled).getByRole('button', { name: '禁用用户', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: cancelled.id } })).status,
      'ACTIVE',
    );
    assert.equal(await prisma.userDisableAudit.count({ where: { targetUserId: cancelled.id } }), 0);
    return { cancelledWithoutMutation: true };
  });
  await test('D03', '禁用失败保留状态、可重试且请求期间互斥', async () => {
    const pattern = `**/users/${target.id}/disable`;
    await page.route(pattern, (route) => route.abort());
    await row(target).getByRole('button', { name: '禁用用户', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '确认禁用', exact: true }).click();
    await dialog.getByText(/无法连接到服务/).waitFor();
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status,
      'ACTIVE',
    );
    assert.equal(await prisma.userDisableAudit.count({ where: { targetUserId: target.id } }), 0);
    assert(await dialog.getByRole('button', { name: '确认禁用', exact: true }).isEnabled());
    await page.unroute(pattern);
    let reached;
    const held = new Promise((done) => {
      reached = done;
    });
    let release;
    const pending = new Promise((done) => {
      release = done;
    });
    await page.route(pattern, async (route) => {
      reached();
      await pending;
      await route.continue();
    });
    try {
      await dialog.getByRole('button', { name: '确认禁用', exact: true }).click();
      await held;
      assert(await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled());
      assert(await page.getByRole('button', { name: '刷新列表', exact: true }).isDisabled());
      release();
      await page.getByText(`用户 @${target.username} 已禁用。`, { exact: true }).waitFor();
    } finally {
      release();
      await page.unroute(pattern);
    }
    await row(target).getByText('已禁用', { exact: true }).waitFor();
    assert.equal(await row(target).getByRole('button').count(), 0);
    assert.equal(await prisma.userDisableAudit.count({ where: { targetUserId: target.id } }), 1);
    await page.screenshot({ path: join(output, 'admin-user-disabled.png'), fullPage: true });
    return {
      failedWritePreserved: true,
      retrySucceeded: true,
      pendingControlsDisabled: true,
      auditCount: 1,
    };
  });
  await test('D04', '已登录用户立即失去项目访问且不能再次登录，历史数据保留', async () => {
    await request('/users/me', 'GET', target, undefined, 401);
    await targetPage.getByRole('link', { name: '进入项目', exact: true }).click();
    await targetPage.getByRole('heading', { name: '登录', exact: true }).waitFor();
    await targetPage.getByLabel('用户名', { exact: true }).fill(target.username);
    await targetPage.getByLabel('密码', { exact: true }).fill(password);
    await targetPage.getByRole('button', { name: '登录', exact: true }).click();
    await targetPage.getByText('用户已被禁用，请联系平台管理员', { exact: true }).waitFor();
    assert(await prisma.project.findUnique({ where: { id: project.id } }));
    assert.equal(await prisma.task.count({ where: { projectId: project.id } }), 1);
    assert.equal(
      await prisma.projectMember.count({ where: { projectId: project.id, userId: target.id } }),
      1,
    );
    await targetPage.screenshot({
      path: join(output, 'disabled-login-rejected.png'),
      fullPage: true,
    });
    return { existingSessionRevoked: true, newLoginRejected: true, projectAndTaskRetained: true };
  });
  await test('D05', '刷新保留禁用状态且重复请求幂等', async () => {
    await page.reload();
    await row(target).getByText('已禁用', { exact: true }).waitFor();
    await request(`/users/${target.id}/disable`, 'POST', admin, {
      confirmUsername: target.username,
    });
    assert.equal(await prisma.userDisableAudit.count({ where: { targetUserId: target.id } }), 1);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).tokenVersion,
      1,
    );
    for (const protectedUser of [admin, admin2])
      await request(
        `/users/${protectedUser.id}/disable`,
        'POST',
        admin,
        { confirmUsername: protectedUser.username },
        409,
      );
    return { persisted: true, repeatedAuditCount: 1, protectedAdminRequestsRejected: 2 };
  });
  await test('D06', '负责人/成员/观察者/非成员不能管理用户，直达界面被拒绝', async () => {
    for (const user of [owner, member, observer, outsider]) {
      await request('/users/admin', 'GET', user, undefined, 403);
      await request(
        `/users/${cancelled.id}/disable`,
        'POST',
        user,
        { confirmUsername: cancelled.username },
        403,
      );
    }
    await login(targetPage, owner);
    assert.equal(await targetPage.getByRole('link', { name: '用户管理', exact: true }).count(), 0);
    await targetPage.evaluate(() => {
      globalThis.location.hash = '#/account/users';
    });
    await targetPage.getByRole('alert').getByText('无法管理用户', { exact: true }).waitFor();
    await targetPage.getByText('仅平台管理员可以管理用户', { exact: true }).waitFor();
    assert.equal(await targetPage.locator('.admin-user-row').count(), 0);
    await targetPage.screenshot({ path: join(output, 'non-admin-denied.png'), fullPage: true });
    return { deniedRoles: 4, directRouteDenied: true, userListLeaked: false };
  });
  await test('D07', '用户列表加载失败后可恢复且无未处理异常', async () => {
    await page.route('**/users/admin', (route) => route.abort());
    await page.reload();
    await page.getByRole('alert').getByText('无法管理用户', { exact: true }).waitFor();
    assert.equal(await page.locator('.admin-user-row').count(), 0);
    await page.unroute('**/users/admin');
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByRole('heading', { name: '用户管理', exact: true }).waitFor();
    await row(target).getByText('已禁用', { exact: true }).waitFor();
    assert.deepEqual(rendererErrors, []);
    return { loadRetrySucceeded: true, rendererErrors: 0 };
  });
  await test('D08', '延迟管理员列表在退出并切换普通账号后不会泄露', async () => {
    let captured;
    const started = new Promise((done) => {
      captured = done;
    });
    let release;
    const held = new Promise((done) => {
      release = done;
    });
    let finished;
    const delivered = new Promise((done) => {
      finished = done;
    });
    let intercepted = false;
    await page.route('**/users/admin', async (route) => {
      if (intercepted) return route.continue();
      intercepted = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      captured();
      await held;
      try {
        await route.fulfill({ response });
      } finally {
        finished();
      }
    });
    try {
      await page.getByRole('button', { name: '刷新列表', exact: true }).click();
      await started;
      await page.getByRole('button', { name: '退出', exact: true }).click();
      await login(page, owner);
      await page.evaluate(() => {
        globalThis.location.hash = '#/account/users';
      });
      await page.getByRole('alert').getByText('无法管理用户', { exact: true }).waitFor();
      release();
      await delivered;
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.admin-user-row').count(), 0);
      assert.equal(await page.getByRole('link', { name: '用户管理', exact: true }).count(), 0);
      await page.getByText('仅平台管理员可以管理用户', { exact: true }).waitFor();
      assert.deepEqual(rendererErrors, []);
      return { oldAdministratorResponseIgnored: true, userListLeaked: false };
    } finally {
      release();
      await page.unroute('**/users/admin');
    }
  });
} catch (error) {
  results.push({ id: 'HARNESS', status: 'FAIL', reason: redact(error.message).slice(-1500) });
} finally {
  for (const app of apps)
    await app.evaluate(({ app: electron }) => electron.exit(0)).catch(() => {});
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
