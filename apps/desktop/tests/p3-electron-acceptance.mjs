// Real Electron + real API + isolated database acceptance for P3.
// Usage: node p3-electron-acceptance.mjs root playwrightPackage electronExe apiBaseUrl
//        [outputDirectory] [commentFixtureModule]
// The optional fixture module exports prepareComments({ projectId, taskId, authorId, content }).
// It is supplied by root for the isolated database; this script has no database write adapter.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [rootArg, playwrightPackage, electronExe, apiArgument, outputArgument, fixtureModule] =
  process.argv.slice(2);
if (!rootArg || !playwrightPackage || !electronExe || !apiArgument) {
  throw new Error('Required arguments: root playwrightPackage electronExe apiBaseUrl');
}
const root = resolve(rootArg);
const apiBaseUrl = apiArgument.replace(/\/$/, '');
const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const runDirectory = outputArgument
  ? resolve(outputArgument)
  : join(root, 'tmp', 'p3-electron-gate', runId);
const mainFile = join(root, 'apps', 'desktop', 'out', 'main', 'index.js');
for (const input of [root, playwrightPackage, electronExe, mainFile]) {
  if (!existsSync(input)) throw new Error(`Required input does not exist: ${input}`);
}
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(apiBaseUrl).hostname)) {
  throw new Error('This acceptance script requires an isolated local API.');
}
mkdirSync(runDirectory, { recursive: true });

const { _electron } = createRequire(resolve(playwrightPackage))('playwright');
const groups = [];
const results = [];
const network = [];
const rendererErrors = [];
const consoleErrors = [];
const dragTraces = [];
const pendingReleases = new Set();
const secrets = new Set();
const metadata = { runId, startedAt: new Date().toISOString(), apiBaseUrl };
const names = {
  project: `P3 Electron 验收 ${runId}`,
  requirement: '完整 P3 需求与任务验收',
  main: '成员执行的完整流程任务',
  unassigned: '暂未分配的关联任务',
  owner: '负责人任务权限样本',
};
const labels = {
  BACKLOG: '待规划',
  TODO: '待开始',
  IN_PROGRESS: '进行中',
  BLOCKED: '已阻塞',
  PENDING_REVIEW: '待审核',
  COMPLETED: '已完成',
};
let electronApp;
let page;
let currentCase;
let currentAccount;
let owner;
let member;
let observer;
let project;
let requirement;
let mainTask;
let unassignedTask;
let ownerTask;

function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]');
}

function evidence(filename, data) {
  writeFileSync(join(runDirectory, filename), redact(JSON.stringify(data, null, 2)), 'utf8');
}

function checkpoint(overall) {
  evidence('results.json', {
    metadata: { ...metadata, overall },
    cases: [
      ...results,
      ...groups.slice(results.length).map((item) => ({
        id: item.id,
        name: item.name,
        references: item.references,
        status: 'NOT_RUN',
        reason: overall === 'FAIL' ? '进程异常终止，未执行此运行组。' : '尚未执行此运行组。',
      })),
    ],
    network,
    rendererErrors,
    consoleErrors,
  });
}

function check(condition, label, actual) {
  currentCase?.assertions.push({
    label,
    passed: Boolean(condition),
    ...(actual === undefined ? {} : { actual }),
  });
  if (!condition) throw new Error(label);
}

function group(id, name, references, run) {
  groups.push({ id, name, references, run });
}

async function poll(read, matches, message, timeout = 15000) {
  const started = Date.now();
  let actual;
  do {
    actual = await read();
    if (matches(actual)) return actual;
    await new Promise((accept) => setTimeout(accept, 50));
  } while (Date.now() - started < timeout);
  check(false, message, actual);
}

async function visible(locator) {
  await locator.waitFor({ state: 'visible' });
}

async function absent(locator) {
  await locator.waitFor({ state: 'hidden' });
}

async function screenshot(filename, locator) {
  if (locator) await locator.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(runDirectory, filename),
    animations: 'disabled',
    timeout: 20000,
  });
  currentCase?.screenshots.push(filename);
}

async function rawApi(path, method = 'GET', token, body, expected) {
  const response = await fetch(apiBaseUrl + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  network.push({
    source: 'api',
    at: new Date().toISOString(),
    method,
    path,
    status: response.status,
  });
  const okay = expected === undefined ? response.ok : response.status === expected;
  if (!okay) {
    throw new Error(
      `API ${method} ${path}: HTTP ${response.status}, code ${payload.error?.code ?? 'unknown'}`,
    );
  }
  return { data: payload.data, status: response.status, errorCode: payload.error?.code };
}

async function api(account, path, method = 'GET', body, expected) {
  if (!account.token) {
    const session = await rawApi('/auth/login', 'POST', undefined, {
      username: account.username,
      password: account.password,
    });
    account.token = session.data.accessToken;
    secrets.add(account.token);
  }
  return rawApi(path, method, account.token, body, expected);
}

async function account(role, nickname) {
  const password = `${randomBytes(24).toString('base64url')}aA7!`;
  secrets.add(password);
  const username = `p3-${role}-${randomBytes(6).toString('hex')}`;
  const created = await rawApi('/auth/register', 'POST', undefined, {
    username,
    nickname,
    password,
  });
  return { id: created.data.id, username, nickname, password, token: null };
}

const projectPath = () => `/projects/${project.id}`;
const taskPath = (task) => `${projectPath()}/tasks/${task.id}`;
const taskCard = (task, status) =>
  page.locator(`${status ? `.board-column--${status.toLowerCase()} ` : ''}.task-card`).filter({
    has: page.getByRole('link', { name: task.title, exact: true }),
  });
const editDialog = () => page.getByRole('dialog', { name: '编辑任务', exact: true });
const transitionDialog = () => page.locator('.task-status-dialog');
const taskCreatePanel = () => page.locator('.task-create-panel');
const requirementCreatePanel = () => page.locator('.requirement-create-panel');

function field(scope, label) {
  const exactTitle = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  // A label's accessible name also includes inline validation text. Match its
  // title span so existing errors and textarea content cannot change the target.
  return scope
    .locator('label')
    .filter({ has: page.locator('span').filter({ hasText: exactTitle }) })
    .locator('input, textarea, select');
}

async function waitRoute(suffix) {
  await page.waitForURL((url) => url.hash === `#${projectPath()}/${suffix}`);
}

async function section(label, suffix, readySelector) {
  await page.locator('.sidebar-nav').getByRole('link', { name: label, exact: true }).click();
  await waitRoute(suffix);
  await visible(page.locator(readySelector));
}

async function board() {
  await section('任务看板', 'board', '.task-board');
}

async function requirements() {
  await section('需求管理', 'requirements', '.requirement-list-section');
}

async function loginAs(next) {
  if (currentAccount) {
    await page.getByRole('link', { name: '切换项目', exact: true }).click();
    await page.waitForURL((url) => url.hash === '#/projects');
    await visible(page.getByRole('heading', { name: '项目中心', exact: true }));
    await page.getByRole('button', { name: '退出', exact: true }).click();
    await visible(page.getByRole('heading', { name: '登录', exact: true }));
    // Logout rotates the user's tokenVersion, including this harness's API token.
    currentAccount.token = null;
  }
  await visible(page.getByRole('heading', { name: '登录', exact: true }));
  await field(page, '用户名').fill(next.username);
  await field(page, '密码').fill(next.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL((url) => url.hash === '#/projects');
  await visible(page.getByRole('heading', { name: '项目中心', exact: true }));
  currentAccount = next;
  const card = page
    .locator('.project-card')
    .filter({ has: page.getByRole('heading', { name: names.project, exact: true }) });
  await card.getByRole('link', { name: '进入项目', exact: true }).click();
  await waitRoute('overview');
  await visible(page.getByRole('heading', { name: '项目概览', exact: true }));
  await visible(page.locator('.sidebar-nav').getByRole('link', { name: '任务看板', exact: true }));
}

async function responseTo(path, method, action, expected = [200, 201]) {
  const pending = page.waitForResponse(
    (response) => response.url() === apiBaseUrl + path && response.request().method() === method,
  );
  await action();
  const response = await pending;
  check(expected.includes(response.status()), `${method} ${path} 返回预期状态`, response.status());
  return (await response.json()).data;
}

async function createRequirement(title, criteria = '需求详情展示关联任务与完成情况。') {
  const panel = requirementCreatePanel();
  await visible(panel);
  await field(panel, '需求标题').fill(title);
  await field(panel, '需求描述').fill('真实 Electron P3 验收数据');
  await field(panel, '验收标准').fill(criteria);
  await field(panel, '优先级').selectOption('HIGH');
  const created = await responseTo(`${projectPath()}/requirements`, 'POST', () =>
    panel.getByRole('button', { name: '创建需求', exact: true }).click(),
  );
  await visible(page.locator('.requirement-row').filter({ hasText: title }));
  await poll(
    () => field(panel, '需求标题').inputValue(),
    (value) => value === '',
    '创建需求后清空草稿',
  );
  return created;
}

async function openRequirement(item) {
  await requirements();
  await page.locator('.requirement-row').filter({ hasText: item.title }).getByRole('link').click();
  await waitRoute(`requirements/${item.id}`);
  await visible(page.getByRole('heading', { name: '需求详情', exact: true }));
  await visible(page.locator('.requirement-detail-grid'));
  await poll(
    () => field(page, '需求标题').inputValue(),
    (value) => value === item.title,
    '当前需求内容已加载',
  );
}

async function createTask(title, assigneeId, requirementId, dueDate = '2026-11-03') {
  const panel = taskCreatePanel();
  await visible(panel);
  await field(panel, '任务标题').fill(title);
  await field(panel, '任务描述').fill('真实 Electron P3 验收任务');
  await field(panel, '负责人').selectOption(assigneeId ?? '');
  await field(panel, '关联需求').selectOption(requirementId ?? '');
  await field(panel, '截止日期').fill(dueDate);
  await field(panel, '预估工时').fill('4.5');
  const created = await responseTo(`${projectPath()}/tasks`, 'POST', () =>
    panel.getByRole('button', { name: '创建任务', exact: true }).click(),
  );
  await visible(taskCard(created, 'BACKLOG'));
  await poll(
    () => field(panel, '任务标题').inputValue(),
    (value) => value === '',
    '创建任务后清空草稿',
  );
  return created;
}

async function openTask(item, status) {
  await board();
  await taskCard(item).getByRole('link', { name: item.title, exact: true }).click();
  await waitRoute(`board/${item.id}`);
  await visible(page.locator('.task-detail-grid'));
  await visible(page.getByRole('heading', { name: item.title, exact: true }));
  if (status) await detailStatus(status);
}

async function detailStatus(status) {
  await poll(
    () => page.locator('.p3-page > .read-only-inline').innerText(),
    (text) => text.includes(`状态：${labels[status]}`),
    `任务详情显示${labels[status]}`,
  );
}

async function taskStatus(item, status, actor = currentAccount) {
  const result = await api(actor, taskPath(item));
  check(
    result.data.status === status,
    `真实 API 中 ${item.title} 状态为 ${status}`,
    result.data.status,
  );
  return result.data;
}

async function directStatus(item, actionLabel, target) {
  await responseTo(`${taskPath(item)}/status`, 'PATCH', () =>
    page.getByRole('button', { name: actionLabel, exact: true }).click(),
  );
  await detailStatus(target);
  return taskStatus(item, target);
}

async function submitTransition(item, note, buttonName = '确认提交', target = 'PENDING_REVIEW') {
  await transitionDialog().locator('textarea').fill(note);
  await responseTo(`${taskPath(item)}/status`, 'PATCH', () =>
    transitionDialog().getByRole('button', { name: buttonName, exact: true }).click(),
  );
  await absent(transitionDialog());
  await detailStatus(target);
  return taskStatus(item, target);
}

async function drag(item, from, to) {
  const card = taskCard(item, from);
  const column = page.locator(`.board-column--${to.toLowerCase()}`);
  await page.locator('.task-board').evaluate((board) => {
    board.scrollLeft = 0;
  });
  await card.scrollIntoViewIfNeeded();
  const source = await card.boundingBox();
  const target = await column.boundingBox();
  const viewport = await page.evaluate(() => ({
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }));
  check(Boolean(source && target), '原生拖拽源卡片和目标列具有布局区域');
  const start = { x: source.x + source.width / 2, y: source.y + 9 };
  const end = { x: target.x + target.width / 2, y: start.y + 12 };
  check(
    start.y > 80 && end.y < viewport.height - 20 && end.x < viewport.width - 20,
    '拖拽源和目标同时位于可见视窗',
    { source, target, viewport, start, end },
  );
  const geometry = await page.evaluate(
    ({ start, end }) => {
      const document = globalThis.document;
      const describe = (point) => {
        const element = document.elementFromPoint(point.x, point.y);
        return {
          tag: element?.tagName,
          card: element?.closest('.task-card')?.querySelector('h3')?.textContent,
          column: element?.closest('.board-column')?.className,
        };
      };
      return { sourceHit: describe(start), targetHit: describe(end) };
    },
    { start, end },
  );
  check(geometry.sourceHit.card === item.title, '鼠标起点命中指定任务的非链接顶部区域', geometry);
  check(
    geometry.targetHit.column?.includes(`board-column--${to.toLowerCase()}`),
    '鼠标终点命中目标整列空白区域',
    geometry,
  );
  await page.evaluate(() => {
    const document = globalThis.document;
    globalThis.__p3NativeDragEvents = [];
    const record = (event) => {
      const element = event.target instanceof globalThis.Element ? event.target : null;
      globalThis.__p3NativeDragEvents.push({
        type: event.type,
        trusted: event.isTrusted,
        x: event.clientX,
        y: event.clientY,
        defaultPrevented: event.defaultPrevented,
        column: element?.closest('.board-column')?.className,
        task: element?.closest('.task-card')?.querySelector('h3')?.textContent,
        transferTypes: Array.from(event.dataTransfer?.types ?? []),
      });
    };
    const types = ['dragstart', 'dragover', 'drop', 'dragend'];
    types.forEach((type) => document.addEventListener(type, record));
    globalThis.__p3StopDragTrace = () => {
      types.forEach((type) => document.removeEventListener(type, record));
      return globalThis.__p3NativeDragEvents;
    };
  });
  await screenshot(`${currentCase.id}-drag-${to.toLowerCase()}-before.png`);
  let events;
  try {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 14, start.y + 3, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 20 });
    // A second move over the same target lets Chromium issue native dragover.
    await page.mouse.move(end.x + 2, end.y + 2, { steps: 2 });
  } finally {
    await page.mouse.up();
    events = await page.evaluate(() => globalThis.__p3StopDragTrace());
    dragTraces.push({
      taskId: item.id,
      from,
      to,
      source,
      target,
      viewport,
      start,
      end,
      geometry,
      events,
    });
    evidence('04-native-drag-events.json', dragTraces);
    currentCase.dragEvidence = '04-native-drag-events.json';
  }
  check(
    events.some((event) => event.type === 'dragstart' && event.trusted),
    '真实鼠标产生原生 dragstart',
  );
  check(
    events.some(
      (event) =>
        event.type === 'drop' &&
        event.trusted &&
        event.column?.includes(`board-column--${to.toLowerCase()}`),
    ),
    '真实鼠标在目标列产生原生 drop',
  );
}

async function holdRequest(path, method) {
  let release;
  let notify;
  const gate = new Promise((accept) => {
    release = accept;
  });
  const arrived = new Promise((accept) => {
    notify = accept;
  });
  const handler = async (route) => {
    if (route.request().method() !== method) return route.continue();
    notify();
    await gate;
    await route.continue();
  };
  await page.route(apiBaseUrl + path, handler);
  const resume = () => {
    release();
    pendingReleases.delete(resume);
  };
  pendingReleases.add(resume);
  return { arrived, release: resume, remove: () => page.unroute(apiBaseUrl + path, handler) };
}

async function allActivities(item) {
  const records = [];
  let cursor;
  do {
    const query = new URLSearchParams({
      targetType: 'TASK',
      targetId: item.id,
      limit: '100',
      ...(cursor ? { cursor } : {}),
    });
    const result = await api(owner, `${projectPath()}/activity?${query}`);
    records.push(...result.data);
    if (result.data.length < 100) return records;
    const next = result.data.at(-1).id;
    if (next === cursor) throw new Error('Activity cursor did not advance');
    cursor = next;
  } while (records.length < 2000);
  throw new Error('Unexpectedly many fixture activities');
}

group('01', '真实 Electron 启动和隔离账号项目', ['AC-03', 'AC-04'], async () => {
  owner = await account('owner', '验收负责人');
  member = await account('member', '验收成员');
  observer = await account('observer', '验收观察者');
  project = (
    await api(owner, '/projects', 'POST', {
      name: names.project,
      startDate: '2026-11-03',
      endDate: '2026-12-31',
    })
  ).data;
  await api(owner, `${projectPath()}/members`, 'POST', {
    role: 'MEMBER',
    username: member.username,
  });
  await api(owner, `${projectPath()}/members`, 'POST', {
    role: 'OBSERVER',
    username: observer.username,
  });
  electronApp = await _electron.launch({
    executablePath: electronExe,
    args: [mainFile, `--user-data-dir=${join(tmpdir(), `scpc-p3-${runId}`)}`],
    env: { ...process.env, ELECTRON_API_BASE_URL: apiBaseUrl, ELECTRON_RENDERER_URL: '' },
    timeout: 30000,
  });
  metadata.runtime = await electronApp.evaluate(() => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));
  check(metadata.runtime.electron === '44.4.3', '使用项目锁定的 Electron 44.4.3', metadata.runtime);
  page = await electronApp.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => rendererErrors.push(redact(error.stack ?? error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(redact(message.text()));
  });
  page.on('response', (response) => {
    if (response.url().startsWith(apiBaseUrl))
      network.push({
        source: 'renderer',
        at: new Date().toISOString(),
        method: response.request().method(),
        path: response.url().slice(apiBaseUrl.length),
        status: response.status(),
      });
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(apiBaseUrl))
      network.push({
        source: 'renderer',
        at: new Date().toISOString(),
        method: request.method(),
        path: request.url().slice(apiBaseUrl.length),
        failure: request.failure()?.errorText,
      });
  });
  await loginAs(owner);
  await requirements();
  await visible(page.locator('.empty-state').getByText('暂无需求', { exact: true }));
  await board();
  check((await page.locator('.board-column').count()) === 6, '空项目显示六列看板');
  check((await page.locator('.task-card').count()) === 0, '空项目没有伪造任务');
  metadata.fixture = {
    projectId: project.id,
    ownerId: owner.id,
    memberId: member.id,
    observerId: observer.id,
  };
  await screenshot('01-empty-board.png');
});

group('02', '负责人创建需求、验收标准和标题边界', ['FR-04', 'AC-03', 'AC-10'], async () => {
  await requirements();
  const panel = requirementCreatePanel();
  await panel.getByRole('button', { name: '创建需求', exact: true }).click();
  await visible(panel.getByText('请输入需求标题。', { exact: true }));
  const title = field(panel, '需求标题');
  check((await title.getAttribute('maxlength')) === '100', '需求标题前端限制 100 字符');
  await title.pressSequentially('R'.repeat(101));
  check((await title.inputValue()).length === 100, '键盘输入第 101 个需求标题字符被阻止');
  requirement = await createRequirement(names.requirement);
  await openRequirement(requirement);
  check((await field(page, '验收标准').inputValue()).includes('关联任务'), '需求验收标准持久化');
  await field(page, '需求状态').selectOption('CONFIRMED');
  await responseTo(`${projectPath()}/requirements/${requirement.id}`, 'PATCH', () =>
    page.getByRole('button', { name: '保存需求', exact: true }).click(),
  );
  await visible(page.getByText('需求已保存。', { exact: true }));
  for (const length of [1, 100]) {
    const result = await api(owner, `${projectPath()}/requirements`, 'POST', {
      title: '界'.repeat(length),
      acceptanceCriteria: '可验证',
      priority: 'MEDIUM',
    });
    check(result.data.title.length === length, `真实 API 接受 ${length} 字需求标题`);
  }
  const tooLong = await api(
    owner,
    `${projectPath()}/requirements`,
    'POST',
    { title: '界'.repeat(101), acceptanceCriteria: '可验证', priority: 'MEDIUM' },
    400,
  );
  check(
    tooLong.errorCode === 'VALIDATION_FAILED',
    '真实 API 拒绝 101 字需求标题',
    tooLong.errorCode,
  );
  await screenshot('02-requirement.png');
});

group('03', '多关联任务、无负责人、截止日期和标签边界', ['FR-05', 'AC-03', 'AC-10'], async () => {
  await board();
  const panel = taskCreatePanel();
  const title = field(panel, '任务标题');
  await panel.getByRole('button', { name: '创建任务', exact: true }).click();
  await visible(panel.getByText('请输入任务标题。', { exact: true }));
  await title.pressSequentially('T'.repeat(101));
  check((await title.inputValue()).length === 100, '键盘输入第 101 个任务标题字符被阻止');
  await title.fill(names.main);
  await field(panel, '负责人').selectOption(member.id);
  await field(panel, '关联需求').selectOption(requirement.id);
  await field(panel, '截止日期').fill('2026-11-02');
  await responseTo(
    `${projectPath()}/tasks`,
    'POST',
    () => panel.getByRole('button', { name: '创建任务', exact: true }).click(),
    [422],
  );
  await visible(page.getByRole('alert').filter({ hasText: '任务截止日期不能早于项目开始日期' }));
  check((await page.locator('.task-card').count()) === 0, '错误截止日期未创建任务');
  await panel.getByLabel('新任务标签', { exact: true }).fill('backend,v2');
  await panel.getByRole('button', { name: '添加', exact: true }).click();
  await panel.getByLabel('新任务标签', { exact: true }).fill('urgent');
  await panel.getByLabel('新任务标签', { exact: true }).press('Enter');
  mainTask = await createTask(names.main, member.id, requirement.id);
  check(mainTask.dueDate.startsWith('2026-11-03'), '截止日期等于项目开始日期可保存');
  check(
    mainTask.tagNames.length === 2 && mainTask.tagNames.includes('backend,v2'),
    '含逗号标签保持单标签',
  );
  unassignedTask = await createTask(names.unassigned, null, requirement.id);
  check(unassignedTask.assigneeId === null, '允许无负责人任务');
  await visible(taskCard(unassignedTask).getByText('未分配', { exact: true }));
  ownerTask = await createTask(names.owner, owner.id, null);
  for (const length of [1, 100]) {
    const result = await api(owner, `${projectPath()}/tasks`, 'POST', {
      title: '题'.repeat(length),
      priority: 'MEDIUM',
    });
    check(result.data.title.length === length, `真实 API 接受 ${length} 字任务标题`);
  }
  const tooLong = await api(
    owner,
    `${projectPath()}/tasks`,
    'POST',
    { title: '题'.repeat(101), priority: 'MEDIUM' },
    400,
  );
  check(
    tooLong.errorCode === 'VALIDATION_FAILED',
    '真实 API 拒绝 101 字任务标题',
    tooLong.errorCode,
  );
  await openRequirement(requirement);
  await visible(page.getByText('0/2 个任务已完成', { exact: true }));
  check((await page.locator('.linked-task-row').count()) === 2, '需求详情展示两条关联任务');
  metadata.fixture.mainTaskId = mainTask.id;
  await screenshot('03-linked-tasks.png');
});

group('04', '真实鼠标拖拽的非法跳转与合法推进', ['FR-05', 'AC-04'], async () => {
  await board();
  await drag(mainTask, 'BACKLOG', 'IN_PROGRESS');
  await visible(page.getByRole('alert').filter({ hasText: '不能从“待规划”直接转为“进行中”' }));
  await visible(taskCard(mainTask, 'BACKLOG'));
  await taskStatus(mainTask, 'BACKLOG');
  await responseTo(`${taskPath(mainTask)}/status`, 'PATCH', () =>
    drag(mainTask, 'BACKLOG', 'TODO'),
  );
  await visible(taskCard(mainTask, 'TODO'));
  await taskStatus(mainTask, 'TODO');
  await screenshot('04-native-drag.png', page.locator('.task-board'));
});

group('05', '普通成员执行、阻塞恢复、完成说明校验与提交', ['FR-05', 'AC-04', 'AC-08'], async () => {
  await loginAs(member);
  await openTask(mainTask, 'TODO');
  await directStatus(mainTask, '开始处理', 'IN_PROGRESS');
  await directStatus(mainTask, '标记为阻塞', 'BLOCKED');
  await directStatus(mainTask, '开始处理', 'IN_PROGRESS');
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await transitionDialog().getByRole('button', { name: '确认提交', exact: true }).click();
  await visible(transitionDialog().getByText('请填写任务完成说明。', { exact: true }));
  await taskStatus(mainTask, 'IN_PROGRESS');
  await submitTransition(mainTask, '成员已完成主体功能和正常场景测试。');
  check(
    (await page.getByRole('button', { name: '审核通过', exact: true }).count()) === 0,
    '普通成员看不到审核通过',
  );
  check(
    (await page.getByRole('button', { name: '审核不通过', exact: true }).count()) === 0,
    '普通成员看不到审核不通过',
  );
  await screenshot('05-member-pending.png');
});

group('06', '负责人驳回、保留待审核并展示理由', ['FR-05', 'AC-04'], async () => {
  await loginAs(owner);
  await openTask(mainTask, 'PENDING_REVIEW');
  await page.getByRole('button', { name: '审核不通过', exact: true }).click();
  await transitionDialog().getByRole('button', { name: '确认不通过', exact: true }).click();
  await visible(transitionDialog().getByText('请填写审核不通过原因。', { exact: true }));
  const result = await submitTransition(mainTask, '缺少截止日期边界测试，请补充。', '确认不通过');
  check(result.rejectionReason === '缺少截止日期边界测试，请补充。', '真实 API 保留驳回理由');
  await visible(page.locator('.task-detail-rejection').filter({ hasText: '缺少截止日期边界测试' }));
  await screenshot('06-rejected.png');
});

group('07', '普通成员重新提交并清除驳回状态', ['FR-05', 'AC-04'], async () => {
  await loginAs(member);
  await openTask(mainTask, 'PENDING_REVIEW');
  await visible(page.locator('.task-detail-rejection').filter({ hasText: '缺少截止日期边界测试' }));
  await page.getByRole('button', { name: '重新提交审核', exact: true }).click();
  const result = await submitTransition(mainTask, '已补齐截止日期边界测试，重新提交验收。');
  check(result.rejectionReason === null, '重新提交后 API 不再报告驳回');
  await absent(page.locator('.task-detail-rejection'));
  await screenshot('07-resubmitted.png');
});

group(
  '08',
  '负责人审核完成、完成时间与关联进度',
  ['FR-04', 'FR-05', 'AC-03', 'AC-04'],
  async () => {
    await loginAs(owner);
    await openTask(mainTask, 'PENDING_REVIEW');
    await page.getByRole('button', { name: '审核通过', exact: true }).click();
    const note = await transitionDialog().locator('textarea').inputValue();
    check(note === '已补齐截止日期边界测试，重新提交验收。', '审核对话框保留成员完成说明');
    const result = await submitTransition(mainTask, note, '确认提交', 'COMPLETED');
    check(
      Number.isFinite(Date.parse(result.completedAt)),
      '真实 API 返回完成时间',
      result.completedAt,
    );
    check(
      !(await page.locator('.task-detail-list--compact').innerText()).includes('未记录'),
      '详情展示完成时间',
    );
    await screenshot('08-completed.png');
    await openRequirement(requirement);
    await visible(page.getByText('1/2 个任务已完成', { exact: true }));
    await visible(
      page
        .locator('.linked-task-row')
        .filter({ hasText: mainTask.title })
        .getByText('已完成', { exact: true }),
    );
    await visible(
      page
        .locator('.linked-task-row')
        .filter({ hasText: unassignedTask.title })
        .getByText('待规划', { exact: true }),
    );
    await page.reload();
    await waitRoute(`requirements/${requirement.id}`);
    await visible(page.getByText('1/2 个任务已完成', { exact: true }));
    check((await page.locator('.linked-task-row').count()) === 2, '刷新后关联任务完成比例仍为 1/2');
    await screenshot('08-requirement-progress.png');
  },
);

group('09', '已完成任务重新打开必须填写原因', ['FR-05', 'AC-04', 'AC-10'], async () => {
  await openTask(mainTask, 'COMPLETED');
  await page.getByRole('button', { name: '重新打开任务', exact: true }).click();
  await transitionDialog().getByRole('button', { name: '确认重新打开', exact: true }).click();
  await visible(transitionDialog().getByText('请填写重新打开任务的原因。', { exact: true }));
  await taskStatus(mainTask, 'COMPLETED');
  const reopened = await submitTransition(
    mainTask,
    '追加验收证据，需要补充说明。',
    '确认重新打开',
    'IN_PROGRESS',
  );
  check(reopened.completedAt === null, '重新打开清除完成时间');
  await visible(page.locator('.task-detail-list--compact').getByText('未记录', { exact: true }));
  await screenshot('09-reopened.png');
});

group('10', '成员仅调整他人任务负责人、观察者严格只读', ['FR-05', 'AC-08'], async () => {
  await loginAs(member);
  await board();
  check(
    (await taskCard(ownerTask).getByRole('button', { name: '编辑任务', exact: true }).count()) ===
      0,
    '成员不能编辑他人任务内容',
  );
  await taskCard(ownerTask).getByRole('button', { name: '调整负责人', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '调整任务负责人', exact: true });
  check((await dialog.getByRole('textbox').count()) === 0, '调整负责人弹窗不暴露任务内容编辑');
  await field(dialog, '新负责人').selectOption(member.id);
  await responseTo(taskPath(ownerTask), 'PATCH', () =>
    dialog.getByRole('button', { name: '确认调整', exact: true }).click(),
  );
  await absent(dialog);
  const changed = await api(member, taskPath(ownerTask));
  check(changed.data.assigneeId === member.id, '成员可以调整他人任务负责人');
  await taskCard(mainTask).getByRole('button', { name: '编辑任务', exact: true }).click();
  check(
    (await editDialog().getByRole('button', { name: '删除任务', exact: true }).count()) === 0,
    '成员不能删除任务',
  );
  await editDialog().getByRole('button', { name: '关闭', exact: true }).click();
  await loginAs(observer);
  await board();
  check((await taskCreatePanel().count()) === 0, '观察者没有创建任务表单');
  check(
    (await page.getByRole('button', { name: '编辑任务', exact: true }).count()) === 0,
    '观察者没有编辑任务入口',
  );
  check(
    (await page.getByRole('button', { name: '调整负责人', exact: true }).count()) === 0,
    '观察者没有负责人调整入口',
  );
  check(
    await page
      .locator('.task-card')
      .evaluateAll((cards) => cards.every((card) => card.draggable === false)),
    '观察者不能拖拽任务',
  );
  await screenshot('10-observer-board.png', page.locator('.task-board'));
  await openRequirement(requirement);
  check(await field(page, '需求标题').isDisabled(), '观察者需求详情只读');
  check(
    (await page.getByRole('button', { name: '保存需求', exact: true }).count()) === 0,
    '观察者没有保存需求按钮',
  );
  check(
    (await page.getByRole('button', { name: '删除需求', exact: true }).count()) === 0,
    '观察者没有删除需求按钮',
  );
  await openTask(mainTask, 'IN_PROGRESS');
  await visible(page.getByText('当前角色或项目状态只能查看任务。', { exact: true }));
  check(
    (await page.getByRole('button', { name: '提交审核', exact: true }).count()) === 0,
    '观察者没有状态更新操作',
  );
  await screenshot('10-observer-detail.png');
});

group('11', 'PR37 草稿关闭确认与任务删除取消确认', ['FR-05', 'AC-10', 'NFR-9.3'], async () => {
  await loginAs(owner);
  await board();
  await taskCard(mainTask).getByRole('button', { name: '编辑任务', exact: true }).click();
  await field(editDialog(), '任务描述').fill('保存标签重载验收');
  await responseTo(taskPath(mainTask), 'PATCH', () =>
    editDialog().getByRole('button', { name: '保存任务', exact: true }).click(),
  );
  await absent(editDialog());
  const tagsSaved = (await api(owner, taskPath(mainTask))).data;
  check(
    tagsSaved.tagNames.length === 2 && tagsSaved.tagNames.includes('backend,v2'),
    '保存其他字段不拆分含逗号标签',
  );
  await page.reload();
  await waitRoute('board');
  await visible(taskCard(mainTask).getByText('backend,v2', { exact: true }));
  await taskCard(mainTask).getByRole('button', { name: '编辑任务', exact: true }).click();
  await field(editDialog(), '任务标题').fill('仅本地未保存草稿');
  await editDialog().getByRole('button', { name: '关闭', exact: true }).click();
  const discard = page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true });
  await visible(discard);
  await discard.getByRole('button', { name: '取消', exact: true }).click();
  check(
    (await field(editDialog(), '任务标题').inputValue()) === '仅本地未保存草稿',
    '取消关闭保留编辑草稿',
  );
  await editDialog().getByRole('button', { name: '关闭', exact: true }).click();
  await discard.getByRole('button', { name: '放弃修改', exact: true }).click();
  await absent(editDialog());
  const stored = await api(owner, taskPath(mainTask));
  check(stored.data.title === mainTask.title, '放弃草稿没有更新真实任务');
  await taskCard(mainTask).getByRole('button', { name: '编辑任务', exact: true }).click();
  await editDialog().getByRole('button', { name: '关闭', exact: true }).click();
  await absent(editDialog());
  check((await discard.count()) === 0, '无草稿关闭无需确认');
  const disposable = await createTask('删除确认的独立测试任务', owner.id, null);
  await taskCard(disposable).getByRole('button', { name: '编辑任务', exact: true }).click();
  await editDialog().getByRole('button', { name: '删除任务', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: '删除任务', exact: true });
  await deletion.getByRole('button', { name: '取消', exact: true }).click();
  check((await api(owner, taskPath(disposable))).data.id === disposable.id, '取消删除保留任务');
  await editDialog().getByRole('button', { name: '删除任务', exact: true }).click();
  await responseTo(taskPath(disposable), 'DELETE', () =>
    deletion.getByRole('button', { name: '确认删除', exact: true }).click(),
  );
  await absent(editDialog());
  await absent(taskCard(disposable));
  await api(owner, taskPath(disposable), 'GET', undefined, 404);
  await screenshot('11-task-delete.png', page.locator('.task-board'));
});

group('12', 'PR37 删除带草稿需求后正常返回列表', ['FR-04', 'AC-10', 'NFR-9.3'], async () => {
  await requirements();
  const disposable = await createRequirement('删除回归的独立需求');
  await openRequirement(disposable);
  await field(page, '需求标题').fill('删除前尚未保存的需求草稿');
  await page.getByRole('button', { name: '删除需求', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除需求', exact: true });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  check(
    (await field(page, '需求标题').inputValue()) === '删除前尚未保存的需求草稿',
    '取消删除保留需求草稿',
  );
  await page.getByRole('button', { name: '删除需求', exact: true }).click();
  await responseTo(`${projectPath()}/requirements/${disposable.id}`, 'DELETE', () =>
    dialog.getByRole('button', { name: '确认删除', exact: true }).click(),
  );
  await waitRoute('requirements');
  await visible(page.locator('.requirement-list-section'));
  check(
    (await page.getByRole('dialog', { name: '存在未保存内容', exact: true }).count()) === 0,
    '删除成功不被旧草稿离开提示拦截',
  );
  await api(owner, `${projectPath()}/requirements/${disposable.id}`, 'GET', undefined, 404);
  await screenshot('12-requirement-delete.png');
});

group(
  '13',
  '创建断网保留草稿、重试成功与请求期间离开保护',
  ['FR-04', 'FR-05', 'AC-10'],
  async () => {
    await board();
    const path = `${projectPath()}/tasks`;
    const before = (await api(owner, path)).data.length;
    const abortTask = (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue();
    await page.route(apiBaseUrl + path, abortTask);
    await field(taskCreatePanel(), '任务标题').fill('断网后重试创建任务');
    await taskCreatePanel().getByRole('button', { name: '创建任务', exact: true }).click();
    await visible(page.getByRole('alert').filter({ hasText: '无法连接到服务' }));
    check(
      (await field(taskCreatePanel(), '任务标题').inputValue()) === '断网后重试创建任务',
      '任务创建断网保留草稿',
    );
    check((await api(owner, path)).data.length === before, '断网没有创建服务端任务');
    await page.unroute(apiBaseUrl + path, abortTask);
    const created = await responseTo(path, 'POST', () =>
      taskCreatePanel().getByRole('button', { name: '创建任务', exact: true }).click(),
    );
    await visible(taskCard(created));
    await poll(
      () => field(taskCreatePanel(), '任务标题').inputValue(),
      (value) => value === '',
      '任务重试成功清空草稿',
    );
    await requirements();
    const reqPath = `${projectPath()}/requirements`;
    const abortRequirement = (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue();
    await page.route(apiBaseUrl + reqPath, abortRequirement);
    await field(requirementCreatePanel(), '需求标题').fill('断网后重试创建需求');
    await field(requirementCreatePanel(), '验收标准').fill('断网不丢草稿');
    await requirementCreatePanel().getByRole('button', { name: '创建需求', exact: true }).click();
    await visible(page.getByRole('alert').filter({ hasText: '无法连接到服务' }));
    check(
      (await field(requirementCreatePanel(), '需求标题').inputValue()) === '断网后重试创建需求',
      '需求创建断网保留草稿',
    );
    await page.unroute(apiBaseUrl + reqPath, abortRequirement);
    const held = await holdRequest(reqPath, 'POST');
    const success = responseTo(reqPath, 'POST', () =>
      requirementCreatePanel().getByRole('button', { name: '创建需求', exact: true }).click(),
    );
    await Promise.race([held.arrived, success]);
    await page.locator('.sidebar-nav').getByRole('link', { name: '任务看板', exact: true }).click();
    const unsaved = page.getByRole('dialog', { name: '存在未保存内容', exact: true });
    await visible(unsaved);
    await unsaved.getByRole('button', { name: '继续编辑', exact: true }).click();
    check(
      await field(requirementCreatePanel(), '需求标题').isDisabled(),
      '真实创建请求等待时表单只读且保留草稿保护',
    );
    await screenshot('13-create-pending.png');
    held.release();
    await success;
    await held.remove();
    await poll(
      () => field(requirementCreatePanel(), '需求标题').inputValue(),
      (value) => value === '',
      '需求请求成功后才清空草稿',
    );
  },
);

group('14', '状态断网回退和 PR37 请求期间编辑互斥', ['FR-05', 'AC-04', 'AC-10'], async () => {
  await openTask(mainTask, 'IN_PROGRESS');
  const path = `${taskPath(mainTask)}/status`;
  const historyBefore = (await allActivities(mainTask)).length;
  const abort = (route) =>
    route.request().method() === 'PATCH' ? route.abort('failed') : route.continue();
  await page.route(apiBaseUrl + path, abort);
  await page.getByRole('button', { name: '标记为阻塞', exact: true }).click();
  await visible(page.getByRole('alert').filter({ hasText: '无法连接到服务' }));
  await detailStatus('IN_PROGRESS');
  await taskStatus(mainTask, 'IN_PROGRESS');
  check((await allActivities(mainTask)).length === historyBefore, '失败状态请求不产生伪造操作记录');
  await page.unroute(apiBaseUrl + path, abort);
  await directStatus(mainTask, '标记为阻塞', 'BLOCKED');
  await directStatus(mainTask, '开始处理', 'IN_PROGRESS');
  await board();
  await taskCard(mainTask).getByRole('button', { name: '编辑任务', exact: true }).click();
  const held = await holdRequest(path, 'PATCH');
  const success = responseTo(path, 'PATCH', () =>
    editDialog().getByRole('button', { name: '标记为阻塞', exact: true }).click(),
  );
  await Promise.race([held.arrived, success]);
  check(await field(editDialog(), '任务标题').isDisabled(), '状态等待期间禁止并发修改字段');
  check(
    await editDialog().getByRole('button', { name: '关闭', exact: true }).isDisabled(),
    '状态等待期间禁止关闭编辑器',
  );
  check(
    await editDialog().getByRole('button', { name: '保存任务', exact: true }).isDisabled(),
    '状态等待期间禁止保存',
  );
  check(
    await editDialog().getByRole('button', { name: '删除任务', exact: true }).isDisabled(),
    '状态等待期间禁止删除',
  );
  check(
    await taskCard(unassignedTask)
      .getByRole('button', { name: '编辑任务', exact: true })
      .isDisabled(),
    '状态等待期间禁止打开其他任务草稿',
  );
  await screenshot('14-task-pending.png');
  held.release();
  await success;
  await held.remove();
  await absent(editDialog());
  await visible(taskCard(mainTask, 'BLOCKED'));
  await taskStatus(mainTask, 'BLOCKED');
});

group('15', '完整状态历史、修改前后值、操作人与超过 100 条分页', ['FR-07', 'AC-04'], async () => {
  for (let index = 1; index <= 105; index++) {
    await api(owner, taskPath(mainTask), 'PATCH', {
      description: `分页验收说明 ${String(index).padStart(3, '0')}`,
    });
  }
  const records = await allActivities(mainTask);
  check(records.length > 100, '真实 API 生成超过 100 条任务操作记录', records.length);
  check(
    new Set(records.map((entry) => entry.id)).size === records.length,
    'API 游标分页无重复记录',
  );
  const statusChanges = records.filter((entry) => entry.action === 'TASK_STATUS_CHANGED');
  check(
    statusChanges.every(
      (entry) =>
        entry.actor?.id &&
        entry.beforeValue?.status &&
        entry.afterValue?.status &&
        Number.isFinite(Date.parse(entry.createdAt)),
    ),
    '每条状态历史都有操作人、前后状态和时间',
  );
  check(
    statusChanges.some(
      (entry) =>
        entry.actor.id === member.id &&
        entry.beforeValue.status === 'TODO' &&
        entry.afterValue.status === 'IN_PROGRESS',
    ),
    '历史证明普通成员执行 TODO→IN_PROGRESS',
  );
  check(
    statusChanges.some(
      (entry) => entry.actor.id === owner.id && entry.afterValue.status === 'COMPLETED',
    ),
    '历史证明负责人审核完成',
  );
  check(
    records.some((entry) => entry.action === 'TASK_REVIEW_REJECTED') &&
      records.some((entry) => entry.action === 'TASK_REVIEW_RESUBMITTED'),
    '驳回与重新提交均可追溯',
  );
  check(
    statusChanges.some(
      (entry) =>
        entry.beforeValue.status === 'COMPLETED' &&
        entry.afterValue.reopenReason === '追加验收证据，需要补充说明。',
    ),
    '重新打开原因写入历史',
  );
  evidence('15-task-activities.json', records);
  await openTask(mainTask, 'BLOCKED');
  await poll(
    () => page.locator('.activity-row').count(),
    (count) => count === 100,
    '首屏显示 100 条活动',
  );
  await screenshot('15-history-first-page.png', page.locator('.activity-timeline'));
  let pages = 1;
  while (await page.getByRole('button', { name: '加载更多操作记录', exact: true }).count()) {
    if (pages++ > 20) throw new Error('Activity pagination did not finish');
    const before = await page.locator('.activity-row').count();
    await page.getByRole('button', { name: '加载更多操作记录', exact: true }).click();
    await poll(
      async () => ({
        count: await page.locator('.activity-row').count(),
        loading: await page.getByRole('button', { name: '正在加载...', exact: true }).count(),
        more: await page.getByRole('button', { name: '加载更多操作记录', exact: true }).count(),
      }),
      (value) => !value.loading && (value.count > before || !value.more),
      '分页加载结束且可继续追溯',
    );
  }
  check(
    (await page.locator('.activity-row').count()) === records.length,
    'UI 完整显示真实 API 的所有活动',
    records.length,
  );
  await visible(page.locator('.activity-row').filter({ hasText: '创建任务' }).first());
  const text = await page.locator('.activity-timeline').innerText();
  check(text.includes('验收成员') && text.includes('验收负责人'), 'UI 展示真实历史操作人');
  check(
    text.includes('状态：') &&
      text.includes('→') &&
      text.includes('分页验收说明 104') &&
      text.includes('分页验收说明 105'),
    'UI 展示状态和字段修改前后值',
  );
  check(/2026/.test(text), 'UI 展示活动时间');
  await screenshot('15-history-oldest.png', page.locator('.activity-row').last());
});

group('16', '真实评论 fixture 的作者、内容和时间读取', ['FR-07', 'AC-04'], async () => {
  if (!fixtureModule) {
    currentCase.status = 'SKIP';
    currentCase.reason = '未提供隔离数据库评论 fixture；不能宣称 P3 评论读取已完整验收。';
    return;
  }
  if (!existsSync(fixtureModule)) throw new Error('Comment fixture module does not exist');
  const fixture = await import(pathToFileURL(resolve(fixtureModule)).href);
  if (typeof fixture.prepareComments !== 'function')
    throw new Error('Fixture must export prepareComments');
  const content = 'P3 评论读取验收：保留作者、内容与创建时间。';
  const secondContent = 'P3 第二条目标评论：负责人补充验收意见。';
  const otherContent = '其他任务专属评论，不应混入主任务。';
  const prepared = await fixture.prepareComments({
    projectId: project.id,
    taskId: mainTask.id,
    authorId: member.id,
    content,
  });
  const second = await fixture.prepareComments({
    projectId: project.id,
    taskId: mainTask.id,
    authorId: owner.id,
    content: secondContent,
  });
  const other = await fixture.prepareComments({
    projectId: project.id,
    taskId: unassignedTask.id,
    authorId: member.id,
    content: otherContent,
  });
  check(
    [prepared, second, other].every((entry) => typeof entry?.id === 'string'),
    'fixture 返回三条可追溯评论 ID',
  );
  const query = new URLSearchParams({ targetType: 'TASK', targetId: mainTask.id });
  const comments = (await api(owner, `${projectPath()}/comments?${query}`)).data;
  const comment = comments.find((entry) => entry.id === prepared.id);
  check(
    comment?.content === content && comment?.author.id === member.id,
    '真实 API 读取 fixture 评论及作者',
  );
  check(
    comments.length === 2 &&
      comments.some((entry) => entry.id === second.id) &&
      !comments.some((entry) => entry.id === other.id),
    '真实 API 只读取目标任务的两条评论',
  );
  await openTask(mainTask, 'BLOCKED');
  check((await page.locator('.comment-row').count()) === 2, 'UI 显示目标任务两条评论');
  check(
    (await page.getByText(otherContent, { exact: true }).count()) === 0,
    'UI 不混入其他任务评论',
  );
  await visible(
    page
      .locator('.comment-row')
      .filter({ hasText: secondContent })
      .getByText(owner.nickname, { exact: true }),
  );
  const row = page.locator('.comment-row').filter({ hasText: content });
  await visible(row);
  await visible(row.getByText(member.nickname, { exact: true }));
  const timestamp = await row.locator('time').getAttribute('datetime');
  check(
    timestamp === comment.createdAt && Number.isFinite(Date.parse(timestamp)),
    'UI 评论时间与真实 API 一致',
  );
  evidence(
    '16-comments.json',
    comments.map((entry) => ({
      id: entry.id,
      authorId: entry.author.id,
      content: entry.content,
      createdAt: entry.createdAt,
    })),
  );
  await screenshot('16-comment.png', row);
});

group('17', '不存在任务、读取失败重试与渲染稳定性', ['AC-10'], async () => {
  await board();
  const missingPath = `${projectPath()}/board/missing-${runId}`;
  await page.evaluate((path) => {
    globalThis.location.hash = `#${path}`;
  }, missingPath);
  await visible(page.locator('.error-state').getByText('任务详情加载失败', { exact: true }));
  check((await page.locator('.task-detail-grid').count()) === 0, '不存在的任务不会保留旧详情');
  await screenshot('17-missing-task.png');
  await board();
  await requirements();
  const path = `${projectPath()}/tasks`;
  const abort = (route) =>
    route.request().method() === 'GET' ? route.abort('failed') : route.continue();
  await page.route(apiBaseUrl + path, abort);
  await page.locator('.sidebar-nav').getByRole('link', { name: '任务看板', exact: true }).click();
  await waitRoute('board');
  await visible(page.locator('.error-state').getByText('任务看板加载失败', { exact: true }));
  await visible(page.getByText('无法连接到服务，请检查网络后重试。', { exact: true }));
  await page.unroute(apiBaseUrl + path, abort);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await visible(page.locator('.task-board'));
  await visible(taskCard(mainTask, 'BLOCKED'));
  check(rendererErrors.length === 0, '整个验收过程没有未处理的 renderer 异常', rendererErrors);
  await screenshot('17-read-retry.png', page.locator('.task-board'));
});

let failed = false;
// Observe fatal errors without installing an uncaughtException handler: Node
// must retain its normal crash and nonzero exit behavior after saving evidence.
process.on('uncaughtExceptionMonitor', (error, origin) => {
  failed = true;
  metadata.finishedAt = new Date().toISOString();
  metadata.fatalOrigin = origin;
  metadata.fatalError = redact(error.stack ?? error.message);
  if (currentCase) {
    currentCase.status = 'FAIL';
    currentCase.finishedAt = metadata.finishedAt;
    currentCase.error = metadata.fatalError;
  }
  try {
    checkpoint('FAIL');
  } catch {
    process.stderr.write('Fatal error evidence could not be persisted.\n');
  }
});

try {
  for (const item of groups) {
    currentCase = {
      id: item.id,
      name: item.name,
      references: item.references,
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      assertions: [],
      screenshots: [],
    };
    results.push(currentCase);
    console.log(`START ${item.id} ${item.name}`);
    checkpoint('RUNNING');
    try {
      await item.run();
      if (currentCase.status === 'RUNNING') currentCase.status = 'PASS';
    } catch (error) {
      failed = true;
      currentCase.status = 'FAIL';
      currentCase.error = redact(error.stack ?? error.message);
      if (page) {
        try {
          await screenshot(`${item.id}-failure.png`);
        } catch (captureError) {
          currentCase.screenshotError = redact(captureError.message);
        }
        try {
          currentCase.visibleText = redact(
            (await page.locator('body').innerText()).slice(0, 18000),
          );
        } catch (bodyError) {
          currentCase.bodyError = redact(bodyError.message);
        }
      }
    }
    currentCase.finishedAt = new Date().toISOString();
    console.log(`${currentCase.status} ${item.id} ${item.name}`);
    evidence('results.json', { metadata, cases: results, network, rendererErrors, consoleErrors });
    if (failed) break;
  }
} finally {
  for (const release of pendingReleases) release();
  for (const item of groups.slice(results.length))
    results.push({
      id: item.id,
      name: item.name,
      references: item.references,
      status: 'NOT_RUN',
      reason: '前置运行组失败，保留失败证据后停止。',
    });
  if (electronApp) {
    try {
      await electronApp.evaluate(({ app }) => app.exit(0));
    } catch (error) {
      metadata.closeError = redact(error.message);
    }
  }
  metadata.finishedAt = new Date().toISOString();
  metadata.overall = failed
    ? 'FAIL'
    : results.some((item) => item.status !== 'PASS')
      ? 'INCOMPLETE'
      : 'PASS';
  evidence('results.json', { metadata, cases: results, network, rendererErrors, consoleErrors });
  console.log(
    JSON.stringify({
      runDirectory,
      overall: metadata.overall,
      cases: results.map(({ id, name, status }) => ({ id, name, status })),
    }),
  );
  process.exitCode = metadata.overall === 'PASS' ? 0 : 1;
}
