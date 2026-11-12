import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = join(root, 'tmp/p7-final-2026-11-12/dashboard');
const run = join(evidence, 'run-' + Date.now());
await mkdir(run, { recursive: true });
execFileSync(
  'git',
  [
    'diff',
    '--exit-code',
    '2d4d6004ceffdf2099f8bb75f10f01f0cb94800c',
    '--',
    'apps',
    'packages',
    'prisma',
    'package.json',
    'pnpm-lock.yaml',
  ],
  { cwd: root, stdio: 'pipe' },
);
const secret = randomBytes(48).toString('hex');
const password = randomBytes(20).toString('base64url');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  APP_HOST: '127.0.0.1',
  CORS_ORIGINS: 'null,http://localhost:5173',
  DATABASE_URL: 'file:' + join(run, 'p6.sqlite').replaceAll('\\', '/'),
  JWT_SECRET: secret,
  JWT_EXPIRES_IN: '2h',
  LOG_LEVEL: 'error',
  ELECTRON_RENDERER_URL: '',
};
delete env.ELECTRON_RUN_AS_NODE;
const cases = [];
let api,
  electron,
  page,
  base,
  apiOutput = '';
const browserErrors = [];
function redact(value) {
  return String(value)
    .replaceAll(secret, '[REDACTED]')
    .replaceAll(password, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fulfill(route, response) {
  try {
    await route.fulfill({ response });
  } catch (error) {
    if (
      !/already handled|Target.*closed|intercepted request|Invalid InterceptionId|ERR_ABORTED/i.test(
        error.message,
      )
    )
      throw error;
  }
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
async function command(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (x) => (output += x));
  child.stderr.on('data', (x) => (output += x));
  const code = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', done);
  });
  await writeFile(join(run, name + '.txt'), redact(output));
  assert.equal(code, 0, name);
}
async function request(path, method = 'GET', token, data, expected) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (expected !== undefined) {
    assert.equal(response.status, expected, method + ' ' + path);
    return response;
  }
  const json = await response.json();
  assert(response.ok, method + ' ' + path + ': ' + response.status + ' ' + json.error?.code);
  return json.data;
}
async function account(prefix, nickname) {
  const username = prefix + '-' + randomBytes(6).toString('hex');
  const user = await request('/auth/register', 'POST', undefined, { username, password, nickname });
  const session = await request('/auth/login', 'POST', undefined, { username, password });
  return { ...user, username, token: session.accessToken };
}
async function test(name, action) {
  try {
    const details = await action();
    cases.push({ name, pass: true, details });
    console.log(JSON.stringify(cases.at(-1)));
  } catch (error) {
    cases.push({ name, pass: false, error: redact(error.stack) });
    console.log(JSON.stringify(cases.at(-1)));
    if (page)
      await page
        .screenshot({ path: join(run, 'failure-' + cases.length + '.png') })
        .catch(() => {});
  }
}
async function login(user) {
  await page.getByLabel('用户名', { exact: true }).fill(user.username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).waitFor();
}
async function navigate(projectId, name = 'overview') {
  await page.evaluate(
    (hash) => {
      globalThis.location.hash = hash;
    },
    '/projects/' + projectId + '/' + name,
  );
  await page
    .locator('.loading-state')
    .waitFor({ state: 'hidden' })
    .catch(() => {});
}
async function filter(values) {
  const form = page.locator('.task-filter-panel');
  for (const [label, value] of Object.entries(values)) {
    const input = form
      .locator('label')
      .filter({ has: page.locator('span', { hasText: new RegExp('^' + label + '$') }) })
      .locator('input,select');
    if (await input.evaluate((el) => el.tagName === 'SELECT')) await input.selectOption(value);
    else await input.fill(value);
  }
  await form.getByRole('button', { name: '应用筛选', exact: true }).click();
  await page.locator('.task-filter-panel').waitFor();
}
async function download(button, name) {
  const count = await electron.evaluate(() => globalThis.reviewDownloads.length);
  await page.getByRole('button', { name: button, exact: true }).click();
  let item;
  for (let n = 0; n < 100; n++) {
    item = await electron.evaluate((_electron, index) => globalThis.reviewDownloads[index], count);
    if (item?.state) break;
    await delay(100);
  }
  assert.equal(item?.state, 'completed', 'Electron download completed');
  const data = await readFile(item.path);
  await writeFile(join(run, name), data);
  return { filename: item.filename, data };
}
try {
  await writeFile(join(run, 'p6.sqlite'), '', { flag: 'wx' });
  await command('migration', [
    join(root, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    'prisma/schema.prisma',
  ]);
  const probe = createServer();
  await new Promise((done) => probe.listen(0, '127.0.0.1', done));
  const port = probe.address().port;
  await new Promise((done) => probe.close(done));
  env.APP_PORT = String(port);
  base = 'http://127.0.0.1:' + port + '/api/v1';
  api = spawn(process.execPath, [join(root, 'apps/api/dist/main.js')], {
    cwd: join(root, 'apps/api'),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout.on('data', (x) => (apiOutput += x));
  api.stderr.on('data', (x) => (apiOutput += x));
  let healthy = false;
  for (let n = 0; n < 100; n++) {
    assert.equal(api.exitCode, null);
    try {
      healthy = (await fetch(base + '/health')).ok;
    } catch {
      /* The isolated API may still be starting. */
    }
    if (healthy) break;
    await delay(150);
  }
  assert(healthy);
  const owner = await account('owner', 'P6负责人'),
    member = await account('member', 'P6成员'),
    observer = await account('observer', 'P6观察者'),
    outsider = await account('outsider', '非成员');
  const project = await request('/projects', 'POST', owner.token, {
    name: 'P6统计筛选独立验收',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  });
  const prefix = '/projects/' + project.id;
  for (const [user, role] of [
    [member, 'MEMBER'],
    [observer, 'OBSERVER'],
  ])
    await request(prefix + '/members', 'POST', owner.token, { username: user.username, role });
  const iteration = await request(prefix + '/iterations', 'POST', owner.token, {
    name: 'P6验证迭代',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  });
  const requirement = await request(prefix + '/requirements', 'POST', owner.token, {
    title: 'alpha 100% 标题',
    priority: 'HIGH',
    acceptanceCriteria: '能准确筛选导出',
  });
  await request(prefix + '/requirements', 'POST', owner.token, {
    title: 'beta 普通需求',
    priority: 'LOW',
    acceptanceCriteria: '独立列出',
  });
  const tasks = [];
  for (const [title, dueDate] of [
    ['alpha 首时刻', '2026-11-10T16:30:00.000Z'],
    ['alpha 末时刻', '2026-11-11T15:30:00.000Z'],
    ['alpha 次日', '2026-11-11T16:30:00.000Z'],
    ['beta 其他任务', '2026-11-11T04:00:00.000Z'],
  ]) {
    const task = await request(prefix + '/tasks', 'POST', owner.token, {
      title,
      dueDate,
      assigneeId: member.id,
      priority: 'HIGH',
      tagNames: ['验收标签'],
      requirementId: requirement.id,
    });
    await request(prefix + '/iterations/' + iteration.id + '/tasks', 'POST', owner.token, {
      taskId: task.id,
    });
    tasks.push(task);
  }
  const empty = await request('/projects', 'POST', owner.token, {
    name: 'P6空项目',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  });
  const completed = await request(prefix + '/tasks', 'POST', owner.token, {
    title: 'completed 历史趋势',
    priority: 'LOW',
    assigneeId: owner.id,
  });
  for (const status of ['TODO', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED'])
    await request(prefix + '/tasks/' + completed.id + '/status', 'PATCH', owner.token, {
      status,
      ...(status === 'PENDING_REVIEW' ? { completionNote: '用于趋势验收' } : {}),
    });
  const deleted = await request('/projects', 'POST', owner.token, {
    name: 'P6删除历史项目',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  });
  const dp = '/projects/' + deleted.id;
  const historical = await request(dp + '/tasks', 'POST', owner.token, {
    title: '已完成后删除',
    priority: 'MEDIUM',
  });
  for (const status of ['TODO', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED'])
    await request(dp + '/tasks/' + historical.id + '/status', 'PATCH', owner.token, {
      status,
      ...(status === 'PENDING_REVIEW' ? { completionNote: '验证删除后历史' } : {}),
    });
  await request(dp + '/tasks/' + historical.id, 'DELETE', owner.token);
  const { _electron } = createRequire(resolve(process.argv[2]))('playwright');
  electron = await _electron.launch({
    executablePath: resolve(process.argv[3]),
    args: [join(root, 'apps/desktop/out/main/index.js'), '--user-data-dir=' + join(run, 'profile')],
    env: { ...env, ELECTRON_API_BASE_URL: base },
    timeout: 20000,
  });
  await electron.evaluate(({ session }, destination) => {
    globalThis.reviewDownloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const record = {
        filename: item.getFilename(),
        path:
          destination + '/native-' + globalThis.reviewDownloads.length + '-' + item.getFilename(),
        state: null,
      };
      globalThis.reviewDownloads.push(record);
      item.setSavePath(record.path);
      item.once('done', (_event, state) => {
        record.state = state;
      });
    });
  }, run);
  page = await electron.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => browserErrors.push(redact(e.message)));
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
  await login(owner);
  await test('真实仪表盘的指标和五种图表', async () => {
    await navigate(project.id);
    await page.getByRole('img', { name: '任务状态分布图', exact: true }).waitFor();
    const labels = [
      '任务状态分布图',
      '成员任务分布图',
      '任务完成趋势图',
      '迭代完成率图',
      '项目燃尽图',
    ];
    for (const label of labels) {
      const chart = page.getByRole('img', { name: label, exact: true });
      await chart.locator('canvas').first().waitFor();
      assert((await chart.boundingBox()).width > 200);
    }
    assert.equal(await page.locator('.metric-card').first().locator('strong').innerText(), '5');
    await page.screenshot({ path: join(run, 'dashboard.png'), fullPage: true });
    return { charts: labels.length, taskTotal: 5 };
  });
  await test('八项组合筛选与上海日期边界', async () => {
    await navigate(project.id, 'board');
    await page.locator('.task-filter-panel').waitFor();
    await filter({
      标题搜索: 'alpha',
      负责人: member.id,
      状态: 'BACKLOG',
      优先级: 'HIGH',
      标签: '验收标签',
      迭代: iteration.id,
      截止日期起: '2026-11-11',
      截止日期止: '2026-11-11',
    });
    assert.equal(await page.locator('.task-card').count(), 2);
    assert((await page.locator('.task-filter-summary').innerText()).includes('8 个筛选条件'));
    const titles = await page.locator('.task-card h4, .task-card h3').allTextContents();
    assert(
      (
        await page
          .locator('.task-board')
          .innerText()
          .catch(() => page.locator('body').innerText())
      ).includes('alpha 首时刻'),
    );
    await page.screenshot({ path: join(run, 'combined-filters.png'), fullPage: true });
    return { tasks: 2, titles };
  });
  await test('当前筛选的 CSV 实际下载且内容一致', async () => {
    const csv = await download('导出当前结果', 'filtered-tasks.csv');
    assert.equal(csv.data.subarray(0, 3).toString('hex'), 'efbbbf');
    const text = csv.data.toString('utf8');
    assert(text.includes('alpha 首时刻'));
    assert(text.includes('alpha 末时刻'));
    assert(!text.includes('alpha 次日'));
    assert(!text.includes('beta 其他任务'));
    return { filename: csv.filename, bom: true, matchingTasks: 2 };
  });
  await test('清空筛选、无结果和无效日期提示', async () => {
    await page.getByRole('button', { name: '清空筛选', exact: true }).click();
    await page.locator('.task-filter-panel').waitFor();
    assert.equal(await page.locator('.task-card').count(), 5);
    await filter({ 标题搜索: '不存在的任务' });
    assert.equal(await page.locator('.task-card').count(), 0);
    await filter({ 截止日期起: '2026-11-12', 截止日期止: '2026-11-11' });
    await page.getByText('截止日期筛选的结束日期不能早于开始日期。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '清空筛选', exact: true }).click();
    await page.locator('.task-filter-panel').waitFor();
    return { clearRestores: 5, noResults: 0, invalidRangeRejected: true };
  });
  await test('需求标题字面搜索与清空', async () => {
    await navigate(project.id, 'requirements');
    await page.locator('.requirement-search-form').waitFor();
    await page
      .locator('.requirement-search-form')
      .getByLabel('需求标题', { exact: true })
      .fill('%');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.locator('.requirement-search-form').waitFor();
    assert.equal(await page.locator('.requirement-row').count(), 1);
    assert((await page.locator('.requirement-row').innerText()).includes('100%'));
    await page.getByRole('button', { name: '清空', exact: true }).click();
    await page.locator('.requirement-search-form').waitFor();
    assert.equal(await page.locator('.requirement-row').count(), 2);
    return { literalSearch: true, clearRestores: 2 };
  });
  await test('导出失败可恢复，任务和项目报告实际下载', async () => {
    await navigate(project.id, 'reports');
    await page.getByRole('button', { name: '导出项目进度报告', exact: true }).waitFor();
    const pattern = '**/reports/progress';
    await page.route(pattern, (route) => route.abort());
    await page.getByRole('button', { name: '导出项目进度报告', exact: true }).click();
    await page.getByText('无法连接到服务，请检查网络后重试。', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: '导出项目进度报告', exact: true }).isEnabled());
    await page.unroute(pattern);
    const progress = await download('导出项目进度报告', 'progress.csv');
    assert(progress.data.toString('utf8').includes('P6统计筛选独立验收'));
    const all = await download('导出任务 CSV', 'all-tasks.csv');
    assert(all.data.toString('utf8').includes('beta 其他任务'));
    await page.screenshot({ path: join(run, 'reports.png'), fullPage: true });
    return { errorRecoverable: true, progress: progress.filename, tasks: all.filename };
  });
  await test('仪表盘网络失败和重试', async () => {
    const pattern = '**/dashboard';
    await page.route(pattern, (route) => route.abort());
    await navigate(project.id);
    await page.getByText('无法连接到服务，请检查网络后重试。', { exact: true }).waitFor();
    await page.unroute(pattern);
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByRole('img', { name: '任务状态分布图', exact: true }).waitFor();
    return { recovered: true };
  });
  await test('空项目与删除最终任务后的历史图表独立展示', async () => {
    await navigate(empty.id);
    await page.getByText('暂无任务状态', { exact: true }).waitFor();
    assert.equal(await page.locator('.metric-card').first().locator('strong').innerText(), '0');
    await navigate(deleted.id);
    await page.getByText('暂无任务状态', { exact: true }).waitFor();
    await page.getByRole('img', { name: '任务完成趋势图', exact: true }).waitFor();
    await page.getByRole('img', { name: '项目燃尽图', exact: true }).waitFor();
    const history = await request(dp + '/dashboard', 'GET', owner.token);
    assert.equal(history.summary.totalTasks, 0);
    assert.equal(
      history.completionTrend.reduce((sum, x) => sum + x.completed, 0),
      1,
    );
    assert(history.recentActivities.length > 0);
    await page.screenshot({ path: join(run, 'deleted-history.png'), fullPage: true });
    return { currentTasks: 0, historicalCompleted: 1, recentActivity: true };
  });
  await test('创建响应晚于筛选切换时不会混入旧任务', async () => {
    await navigate(project.id, 'board');
    await page.locator('.task-filter-panel').waitFor();
    await filter({ 标题搜索: 'alpha' });
    const held = deferred(),
      release = deferred();
    const pattern = '**/projects/' + project.id + '/tasks';
    await page.route(pattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      held.resolve();
      await release.promise;
      await route.fulfill({ response });
    });
    try {
      await page
        .locator('.task-create-panel')
        .getByLabel('任务标题', { exact: true })
        .fill('alpha 延迟创建');
      await page.getByRole('button', { name: '创建任务', exact: true }).click();
      await held.promise;
      await filter({ 标题搜索: 'beta' });
      assert.equal(await page.locator('.task-card').count(), 1);
      release.resolve();
      await page.getByText('任务已创建。', { exact: true }).waitFor();
      await delay(250);
      await page.locator('.task-filter-panel').waitFor();
      const titles = await page.locator('.task-card h3').allTextContents();
      assert.deepEqual(titles, ['beta 其他任务']);
      await page.screenshot({ path: join(run, 'race-filter-switch.png'), fullPage: true });
      return { currentFilter: 'beta', titles };
    } finally {
      release.resolve();
      await page.unroute(pattern);
    }
  });
  await test('同筛选创建与状态操作的刷新逆序返回仍保留最新结果', async () => {
    await navigate(project.id, 'reports');
    await page.getByRole('button', { name: '导出任务 CSV', exact: true }).waitFor();
    await navigate(project.id, 'board');
    await page.locator('.task-filter-panel').waitFor();
    await filter({ 标题搜索: 'alpha' });
    const createHeld = deferred(),
      createRelease = deferred(),
      statusHeld = deferred(),
      statusRelease = deferred(),
      getHeld = deferred(),
      getRelease = deferred();
    const postPattern = '**/projects/' + project.id + '/tasks';
    const statusPattern = '**/tasks/' + tasks[0].id + '/status';
    const getPattern = '**/projects/' + project.id + '/tasks?*';
    let intercepted = false;
    await page.route(postPattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      createHeld.resolve();
      await createRelease.promise;
      await route.fulfill({ response });
    });
    await page.route(statusPattern, async (route) => {
      statusHeld.resolve();
      await statusRelease.promise;
      const response = await route.fetch();
      await route.fulfill({ response });
    });
    await page.route(getPattern, async (route) => {
      if (intercepted || route.request().method() !== 'GET') return route.continue();
      intercepted = true;
      const response = await route.fetch();
      getHeld.resolve();
      await getRelease.promise;
      await route.fulfill({ response });
    });
    try {
      await page
        .locator('.task-create-panel')
        .getByLabel('任务标题', { exact: true })
        .fill('alpha 并行创建');
      await page.getByRole('button', { name: '创建任务', exact: true }).click();
      await createHeld.promise;
      await page
        .locator('.task-card')
        .filter({ hasText: 'alpha 首时刻' })
        .getByRole('button', { name: '编辑任务', exact: true })
        .click();
      await page.getByRole('button', { name: '移至待开始', exact: true }).click();
      await statusHeld.promise;
      createRelease.resolve();
      await getHeld.promise;
      statusRelease.resolve();
      await page.getByText('任务已更新为“待开始”。', { exact: true }).waitFor();
      await page.locator('.task-filter-panel').waitFor();
      await delay(150);
      getRelease.resolve();
      await delay(250);
      await page.locator('.task-filter-panel').waitFor();
      const card = page.locator('.task-card').filter({ hasText: 'alpha 首时刻' });
      const status = await card
        .locator('xpath=ancestor::section[contains(@class,"board-column")]')
        .locator('h2')
        .innerText();
      assert(status.includes('待开始'));
      assert((await page.locator('.task-card h3').allTextContents()).includes('alpha 并行创建'));
      await page.screenshot({ path: join(run, 'race-same-filter.png'), fullPage: true });
      return { delayedSnapshotIgnored: true, taskStatus: status };
    } finally {
      createRelease.resolve();
      statusRelease.resolve();
      getRelease.resolve();
      await page.unroute(postPattern);
      await page.unroute(statusPattern);
      await page.unroute(getPattern);
    }
  });
  await test('清空筛选查询尚未返回时创建成功会刷新全部任务', async () => {
    await navigate(project.id, 'reports');
    await page.getByRole('button', { name: '导出任务 CSV', exact: true }).waitFor();
    await navigate(project.id, 'board');
    await page.locator('.task-filter-panel').waitFor();
    const postHeld = deferred(),
      postRelease = deferred(),
      getHeld = deferred(),
      getRelease = deferred();
    const pattern = '**/projects/' + project.id + '/tasks';
    let heldGet = false;
    await page.route(pattern, async (route) => {
      if (route.request().method() === 'POST') {
        postHeld.resolve();
        await postRelease.promise;
        const response = await route.fetch();
        return fulfill(route, response);
      }
      if (heldGet) return route.continue();
      heldGet = true;
      const response = await route.fetch();
      getHeld.resolve();
      await getRelease.promise;
      return fulfill(route, response);
    });
    try {
      await page
        .locator('.task-create-panel')
        .getByLabel('任务标题', { exact: true })
        .fill('alpha 清空期间创建');
      await page.getByRole('button', { name: '创建任务', exact: true }).click();
      await postHeld.promise;
      await page.getByRole('button', { name: '清空筛选', exact: true }).click();
      await getHeld.promise;
      postRelease.resolve();
      await page.getByText('任务已创建。', { exact: true }).waitFor();
      await delay(150);
      getRelease.resolve();
      await delay(250);
      await page.locator('.task-filter-panel').waitFor();
      const titles = await page.locator('.task-card h3').allTextContents();
      assert(titles.includes('alpha 清空期间创建'));
      return { taskVisibleAfterClear: true, tasks: titles.length };
    } finally {
      postRelease.resolve();
      getRelease.resolve();
      await page.unroute(pattern);
    }
  });
  await test('成员、观察者的导出权限和非成员访问', async () => {
    for (const user of [member, observer]) {
      await page.getByRole('button', { name: '退出', exact: true }).click();
      await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
      await login(user);
      await navigate(project.id, 'reports');
      await page
        .getByText('当前角色：' + (user === member ? '项目成员' : '观察者'), { exact: false })
        .waitFor();
      assert.equal(
        await page.getByRole('button', { name: '导出项目进度报告', exact: true }).count(),
        0,
      );
      await request(prefix + '/reports/progress', 'GET', user.token, undefined, 403);
      await request(prefix + '/tasks/export', 'GET', user.token, undefined, 403);
      await navigate(project.id, 'board');
      await page.locator('.task-filter-panel').waitFor();
      assert.equal(
        await page.getByRole('button', { name: '导出当前结果', exact: true }).count(),
        0,
      );
    }
    await request(prefix + '/dashboard', 'GET', outsider.token, undefined, 404);
    return { restrictedRoles: 2, unauthorizedExportsRejected: 4, nonMemberRejected: true };
  });
  assert.equal(browserErrors.length, 0, 'renderer errors');
} catch (error) {
  cases.push({ name: '运行准备或收尾', pass: false, error: redact(error.stack) });
  console.log(JSON.stringify(cases.at(-1)));
} finally {
  await electron?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await stop(api);
  await writeFile(join(run, 'api.txt'), redact(apiOutput));
  const sourceHashes = {};
  for (const name of [
    'apps/desktop/src/renderer/src/pages/BoardPage.tsx',
    'apps/desktop/src/renderer/src/pages/BoardPage.test.tsx',
  ])
    sourceHashes[name] = createHash('sha256')
      .update(await readFile(join(root, name)))
      .digest('hex');
  const result = {
    testedRoot: root,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
    sourceHashes,
    passed: cases.filter((x) => x.pass).length,
    failed: cases.filter((x) => !x.pass).length,
    cases,
    browserErrors,
    run,
  };
  await writeFile(join(run, 'results.json'), JSON.stringify(result, null, 2));
  await writeFile(join(evidence, 'latest-integration.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, failed: result.failed, run }));
  if (result.failed) process.exitCode = 1;
}
