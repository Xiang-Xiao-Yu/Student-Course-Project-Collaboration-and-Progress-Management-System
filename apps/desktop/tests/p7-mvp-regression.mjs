// Real Electron + API + SQLite regression for P7 MVP and role boundaries.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

if (process.argv.slice(2).length !== 4) {
  throw new Error(
    'Usage: node p7-mvp-regression.mjs root playwrightPackage electronExe apiBaseUrl',
  );
}
const root = resolve(process.argv[2]);
const playwrightPackage = process.argv[3];
const electronExe = process.argv[4];
const apiBaseUrl = process.argv[5];
const runDirectory = process.env.P7_OUTPUT_DIRECTORY
  ? resolve(process.env.P7_OUTPUT_DIRECTORY)
  : join(root, 'tmp', 'p7-mvp-regression-' + Date.now());
mkdirSync(runDirectory, { recursive: true });

const { _electron } = createRequire(playwrightPackage)('playwright');
const password = randomBytes(24).toString('base64url');
const results = [];
let electronApp;
let page;
const rendererErrors = [];

function logStep(label) {
  console.log(`[p7] ${label}`);
}

function check(condition, label) {
  if (!condition) {
    throw new Error(label);
  }
}

async function capture(filename) {
  await page.bringToFront();
  await page.evaluate(() => globalThis.scrollTo(0, 0)).catch(() => undefined);
  const options = {
    animations: 'disabled',
    path: join(runDirectory, filename),
    timeout: 30000,
  };

  await page.screenshot(options).catch(async () => {
    await page.bringToFront();
    await page.waitForTimeout(250);
    await page.screenshot(options);
  });
}

async function apiRequest(path, method = 'GET', token, body) {
  const response = await fetch(apiBaseUrl + path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    method,
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${payload.error?.code ?? ''}`);
  }

  return payload.data;
}

async function createAccount(role, nickname) {
  const username = `p7-${role}-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const user = await apiRequest('/auth/register', 'POST', undefined, {
    nickname,
    password,
    username,
  });
  const session = await apiRequest('/auth/login', 'POST', undefined, { password, username });
  return { id: user.id, nickname, token: session.accessToken, username };
}

async function login(user) {
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill(user.username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.url().endsWith('/auth/login')),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ]);
  check(response.status() === 200, `Login failed for ${user.username}: ${response.status()}`);
  user.token = (await response.json()).data.accessToken;
  await page.evaluate(() => {
    globalThis.location.hash = '#/projects';
  });
  await page.getByRole('heading', { name: '项目中心', exact: true }).waitFor();
}

async function logout() {
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
}

async function enterProject() {
  await page.getByRole('link', { name: '进入项目', exact: true }).click();
  await page.getByRole('heading', { name: '项目概览', exact: true }).waitFor();
}

function currentProjectId() {
  const match = /#\/projects\/([^/]+)\/overview/.exec(new URL(page.url()).hash);
  check(match?.[1], 'Unable to determine created project ID');
  return decodeURIComponent(match[1]);
}

async function taskTransition(title, action, status, note) {
  const card = page.locator('.task-card').filter({ hasText: title });
  await card.getByRole('button', { name: '编辑任务', exact: true }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
  if (note) {
    await page.locator('.task-status-dialog textarea').fill(note);
    await page.getByRole('button', { name: '确认提交', exact: true }).click();
  }
  await page.getByText(`任务已更新为“${status}”。`, { exact: true }).waitFor();
}

async function saveAcceptanceResult(result, reason) {
  const detail = page.locator('.acceptance-detail-panel');
  await detail.getByRole('button', { name: `进入“${result}”`, exact: true }).click();
  if (reason) {
    await detail.getByLabel('未通过原因', { exact: true }).fill(reason);
  }
  await detail.getByRole('button', { name: '保存验收', exact: true }).click();
  await page.getByText('阶段验收已保存。', { exact: true }).waitFor();
  await detail
    .locator('.panel__header .acceptance-result')
    .getByText(result, { exact: true })
    .waitFor();
}

async function verifyPassedAcceptance(remediationTitle) {
  const detail = page.locator('.acceptance-detail-panel');
  await detail.getByRole('heading', { name: 'P7 阶段验收', exact: true }).waitFor();
  await detail
    .locator('.panel__header .acceptance-result')
    .getByText('已通过', { exact: true })
    .waitFor();
  const task = detail.locator('.linked-task-row').filter({ hasText: remediationTitle });
  await task.getByRole('link', { name: remediationTitle, exact: true }).waitFor();
  await task.getByText('已完成', { exact: true }).waitFor();
}

async function verifyDashboard() {
  const metrics = page.locator('.metric-card');
  await metrics
    .filter({ has: page.getByText('任务总数', { exact: true }) })
    .getByText('3', { exact: true })
    .waitFor();
  await metrics
    .filter({ has: page.getByText('任务完成率', { exact: true }) })
    .getByText('66.67%', { exact: true })
    .waitFor();
}

async function downloadProgressReport(projectName, projectId) {
  const index = await electronApp.evaluate(() => globalThis.p7Downloads.length);
  await page.getByRole('button', { name: '导出项目进度报告', exact: true }).click();
  let item;
  for (let attempt = 0; attempt < 150; attempt++) {
    item = await electronApp.evaluate((_electron, i) => globalThis.p7Downloads[i], index);
    if (item?.state) break;
    await page.waitForTimeout(100);
  }
  check(
    item?.state === 'completed',
    `Progress report download failed: ${item?.state ?? 'missing'}`,
  );
  check(item.filename === `progress-${projectId}.csv`, 'Progress report filename mismatch');
  const bytes = readFileSync(item.path);
  check(bytes.subarray(0, 3).toString('hex') === 'efbbbf', 'CSV UTF-8 BOM missing');
  const lines = bytes
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);
  for (const line of [
    `"项目","${projectName}"`,
    '"任务总数","3"',
    '"已完成任务","2"',
    '"任务完成率","66.67%"',
  ]) {
    check(lines.includes(line), `Progress report row mismatch: ${line}`);
  }
  await page.getByText('项目进度报告已导出。', { exact: true }).waitFor();
}

try {
  const owner = await createAccount('owner', 'P7 项目负责人');
  const member = await createAccount('member', 'P7 项目成员');
  const observer = await createAccount('observer', 'P7 项目观察者');
  const outsider = await createAccount('outsider', 'P7 非项目用户');

  electronApp = await _electron.launch({
    executablePath: electronExe,
    args: [
      join(root, 'apps', 'desktop', 'out', 'main', 'index.js'),
      '--user-data-dir=' + join(runDirectory, 'electron-profile'),
    ],
    env: { ...process.env, ELECTRON_API_BASE_URL: apiBaseUrl },
    timeout: 20000,
  });
  await electronApp.evaluate(({ session }, destination) => {
    globalThis.p7Downloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const record = {
        filename: item.getFilename(),
        path: `${destination}/download-${globalThis.p7Downloads.length}.csv`,
        state: null,
      };
      globalThis.p7Downloads.push(record);
      item.setSavePath(record.path);
      item.once('done', (_doneEvent, state) => {
        record.state = state;
      });
    });
  }, runDirectory);
  page = await electronApp.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => rendererErrors.push(error.message));
  page.on('dialog', (dialog) => {
    void dialog.accept().catch(() => undefined);
  });

  logStep('login owner');
  await login(owner);
  logStep('create project');
  const projectName = 'P7 MVP 回归项目';
  await page.getByLabel('项目名称', { exact: true }).fill(projectName);
  await page.getByLabel('项目简介', { exact: true }).fill('覆盖核心流程、权限、隔离和失败恢复。');
  await page.getByLabel('开始日期', { exact: true }).fill('2026-11-01');
  await page.getByLabel('结束日期', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: '创建并进入项目', exact: true }).click();
  await page.getByRole('heading', { name: '项目概览', exact: true }).waitFor();
  const projectId = currentProjectId();

  logStep('invite members');
  await apiRequest(`/projects/${projectId}/members`, 'POST', owner.token, {
    role: 'MEMBER',
    username: member.username,
  });
  logStep('member invited');
  await apiRequest(`/projects/${projectId}/members`, 'POST', owner.token, {
    role: 'OBSERVER',
    username: observer.username,
  });
  logStep('observer invited');

  const sidebar = page.locator('.sidebar');
  logStep('open requirements');
  await sidebar.getByRole('link', { name: '需求管理', exact: true }).click();
  logStep('requirements opened');
  await page.getByRole('heading', { name: '需求管理', exact: true }).waitFor();
  const requirementTitle = 'P7 核心需求';
  const requirementCreatePanel = page.locator('.requirement-create-panel');
  await requirementCreatePanel.getByLabel('需求标题', { exact: true }).fill(requirementTitle);
  await requirementCreatePanel
    .getByLabel('需求描述', { exact: true })
    .fill('验证需求到任务再到验收的完整链路。');
  await requirementCreatePanel
    .getByLabel('验收标准', { exact: true })
    .fill('任务完成并由负责人审核，统计页显示最新结果。');
  await requirementCreatePanel.getByRole('button', { name: '创建需求', exact: true }).click();
  await page.getByText(requirementTitle, { exact: true }).waitFor();
  logStep('requirement created');

  logStep('open task board');
  await sidebar.getByRole('link', { name: '任务看板', exact: true }).click();
  logStep('task board opened');
  await page.getByRole('heading', { name: '任务看板', exact: true }).waitFor();
  const createPanel = page.locator('.task-create-panel');
  const taskTitle = 'P7 核心任务';
  logStep('fill task title');
  await createPanel.getByLabel('任务标题', { exact: true }).fill(taskTitle);
  logStep('fill task description');
  await createPanel.getByLabel('任务描述', { exact: true }).fill('由成员执行并提交审核。');
  logStep('fill task due date');
  await createPanel.getByLabel('截止日期', { exact: true }).fill('2026-11-20');
  logStep('fill task estimate');
  await createPanel.getByLabel('预估工时', { exact: true }).fill('4');
  logStep('submit task');
  await createPanel.getByRole('button', { name: '创建任务', exact: true }).click();
  logStep('wait task card');
  await page.locator('.task-card').filter({ hasText: taskTitle }).waitFor();
  logStep('task card visible');
  const ownerTasks = await apiRequest(`/projects/${projectId}/tasks`, 'GET', owner.token);
  const createdTask = ownerTasks.find((task) => task.title === taskTitle);
  check(createdTask?.id, 'Created task was not returned by the API');
  const requirements = await apiRequest(`/projects/${projectId}/requirements`, 'GET', owner.token);
  const createdRequirement = requirements.find(
    (requirement) => requirement.title === requirementTitle,
  );
  check(createdRequirement?.id, 'Created requirement was not returned by the API');
  await apiRequest(`/projects/${projectId}/tasks/${createdTask.id}`, 'PATCH', owner.token, {
    assigneeId: member.id,
    requirementId: createdRequirement.id,
  });
  logStep('task assigned and linked to requirement');
  results.push({ name: 'owner-project-requirement-task-flow', status: 'passed' });
  await capture('owner-task-created.png');

  logStep('member executes task');
  await logout();
  await login(member);
  await enterProject();
  await sidebar.getByRole('link', { name: '任务看板', exact: true }).click();
  const memberTaskCard = page.locator('.task-card').filter({ hasText: taskTitle });
  await memberTaskCard.getByRole('button', { name: '编辑任务', exact: true }).click();
  await page.getByRole('button', { name: '移至待开始', exact: true }).click();
  await page.getByText('任务已更新为“待开始”。', { exact: true }).waitFor();
  await memberTaskCard.getByRole('button', { name: '编辑任务', exact: true }).click();
  await page.getByRole('button', { name: '开始处理', exact: true }).click();
  await page.getByText('任务已更新为“进行中”。', { exact: true }).waitFor();
  await memberTaskCard.getByRole('button', { name: '编辑任务', exact: true }).click();
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.getByLabel('完成说明', { exact: true }).fill('P7 成员已完成任务并提交审核。');
  await page.getByRole('button', { name: '确认提交', exact: true }).click();
  await page.getByText('任务已更新为“待审核”。', { exact: true }).waitFor();
  results.push({ name: 'member-task-execution', status: 'passed' });

  logStep('owner reviews task and creates acceptance');
  await logout();
  await login(owner);
  await enterProject();
  await sidebar.getByRole('link', { name: '任务看板', exact: true }).click();
  const ownerTaskCard = page.locator('.task-card').filter({ hasText: taskTitle });
  await ownerTaskCard.getByRole('button', { name: '编辑任务', exact: true }).click();
  await page.getByRole('button', { name: '审核通过', exact: true }).click();
  await page.locator('.task-status-dialog textarea').fill('P7 负责人审核通过。');
  await page.getByRole('button', { name: '确认提交', exact: true }).click();
  await page.getByText('任务已更新为“已完成”。', { exact: true }).waitFor();

  const refreshedOwner = await apiRequest('/auth/login', 'POST', undefined, {
    password,
    username: owner.username,
  });
  owner.token = refreshedOwner.accessToken;
  const iteration = await apiRequest(`/projects/${projectId}/iterations`, 'POST', owner.token, {
    endDate: '2026-12-15',
    goal: '确认任务完成率和迭代迁移。',
    name: 'P7 回归迭代',
    startDate: '2026-11-01',
  });
  const emptyIteration = await apiRequest(
    `/projects/${projectId}/iterations`,
    'POST',
    owner.token,
    {
      endDate: '2026-12-20',
      goal: '验证空迭代统计。',
      name: 'P7 空迭代',
      startDate: '2026-11-01',
    },
  );
  await apiRequest(`/projects/${projectId}/iterations/${iteration.id}/tasks`, 'POST', owner.token, {
    expectedIterationId: null,
    taskId: createdTask.id,
  });
  const iterationStats = await apiRequest(
    `/projects/${projectId}/iterations/${iteration.id}/stats`,
    'GET',
    owner.token,
  );
  const emptyIterationStats = await apiRequest(
    `/projects/${projectId}/iterations/${emptyIteration.id}/stats`,
    'GET',
    owner.token,
  );
  check(iterationStats.total === 1 && iterationStats.completed === 1, 'Iteration stats mismatch');
  check(emptyIterationStats.total === 0, 'Empty iteration stats mismatch');
  await sidebar.getByRole('link', { name: '迭代计划', exact: true }).click();
  await page.getByRole('heading', { name: '迭代计划', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'P7 回归迭代', exact: true }).waitFor();

  const meeting = await apiRequest(`/projects/${projectId}/meetings`, 'POST', owner.token, {
    agenda: '核对会议行动项转任务。',
    decisions: '行动项需要进入任务看板继续跟踪。',
    minutes: 'P7 会议纪要。',
    participantIds: [member.id, observer.id],
    scheduledAt: '2026-11-20T10:00:00.000Z',
    title: 'P7 回归会议',
  });
  const meetingAction = await apiRequest(
    `/projects/${projectId}/meetings/${meeting.id}/actions`,
    'POST',
    owner.token,
    {
      assigneeId: member.id,
      dueDate: '2026-11-22',
      title: 'P7 会议行动项',
    },
  );
  const conversion = await apiRequest(
    `/projects/${projectId}/meetings/${meeting.id}/actions/${meetingAction.id}/convert`,
    'POST',
    owner.token,
    {
      description: '由 P7 会议行动项转换。',
      priority: 'MEDIUM',
      requirementId: createdRequirement.id,
    },
  );
  check(conversion.task?.id, 'Meeting action conversion did not return a task');
  await sidebar.getByRole('link', { name: '会议纪要', exact: true }).click();
  await page.getByRole('heading', { name: '会议纪要', exact: true }).waitFor();
  await page.getByRole('button', { name: /P7 回归会议/ }).click();
  const actionRow = page.locator('.meeting-action-row').filter({ hasText: 'P7 会议行动项' });
  await actionRow.getByRole('link', { name: '查看任务', exact: true }).waitFor();
  results.push({ name: 'iteration-meeting-action-flow', status: 'passed' });

  logStep('UI acceptance failure, remediation and re-acceptance');
  await sidebar.getByRole('link', { name: '阶段验收', exact: true }).click();
  const acceptanceForm = page.locator('.acceptance-create-panel');
  await acceptanceForm.getByLabel('验收阶段名称', { exact: true }).fill('P7 阶段验收');
  await acceptanceForm.getByLabel('验收日期', { exact: true }).fill('2026-11-25');
  await acceptanceForm.getByLabel('验收目标', { exact: true }).fill('确认 P7 MVP 主流程可用');
  await acceptanceForm
    .getByLabel('验收标准', { exact: true })
    .fill('整改完成后重新验收，统计与导出一致。');
  await acceptanceForm
    .getByRole('checkbox', { name: `${owner.nickname} (@${owner.username})`, exact: true })
    .check();
  await acceptanceForm.getByRole('button', { name: '创建阶段验收', exact: true }).click();
  await page.getByRole('heading', { name: 'P7 阶段验收', exact: true }).waitFor();
  await saveAcceptanceResult('验收中');
  await saveAcceptanceResult('未通过', '首次验收发现整改项。');

  const remediationTitle = 'P7 验收整改任务';
  const remediationForm = page.locator('.remediation-form');
  await remediationForm.getByLabel('整改任务标题', { exact: true }).fill(remediationTitle);
  await remediationForm.getByRole('combobox', { name: /^负责人/ }).selectOption(member.id);
  await remediationForm.getByLabel('截止日期', { exact: true }).fill('2026-11-24');
  await remediationForm
    .getByRole('combobox', { name: /^关联需求/ })
    .selectOption(createdRequirement.id);
  await remediationForm.getByRole('button', { name: '创建整改任务', exact: true }).click();
  await page.getByText('整改任务已创建。', { exact: true }).waitFor();
  await page
    .locator('.linked-task-row')
    .getByRole('link', { name: remediationTitle, exact: true })
    .waitFor();
  const acceptanceList = await apiRequest(`/projects/${projectId}/acceptances`, 'GET', owner.token);
  const acceptance = acceptanceList.find((item) => item.stageName === 'P7 阶段验收');
  check(acceptance?.result === 'FAILED', 'Failed acceptance was not persisted');
  const remediationTasks = (
    await apiRequest(`/projects/${projectId}/tasks`, 'GET', owner.token)
  ).filter((task) => task.title === remediationTitle);
  check(remediationTasks.length === 1, 'Expected exactly one remediation task');
  check(
    remediationTasks[0].acceptanceId === acceptance.id &&
      remediationTasks[0].requirementId === createdRequirement.id,
    'Remediation task is linked to the wrong acceptance or requirement',
  );

  await logout();
  await login(member);
  await enterProject();
  await sidebar.getByRole('link', { name: '任务看板', exact: true }).click();
  await taskTransition(remediationTitle, '移至待开始', '待开始');
  await taskTransition(remediationTitle, '开始处理', '进行中');
  await taskTransition(remediationTitle, '提交审核', '待审核', 'P7 整改已完成，请负责人复核。');
  await logout();
  await login(owner);
  await enterProject();
  await sidebar.getByRole('link', { name: '任务看板', exact: true }).click();
  await taskTransition(remediationTitle, '审核通过', '已完成', 'P7 整改审核通过。');
  await sidebar.getByRole('link', { name: '阶段验收', exact: true }).click();
  await page.getByRole('heading', { name: 'P7 阶段验收', exact: true }).waitFor();
  await saveAcceptanceResult('验收中');
  await saveAcceptanceResult('已通过');
  await page.reload();
  await verifyPassedAcceptance(remediationTitle);
  const persistedAcceptance = await apiRequest(
    `/projects/${projectId}/acceptances/${acceptance.id}`,
    'GET',
    owner.token,
  );
  check(
    persistedAcceptance.result === 'PASSED' && persistedAcceptance.failureReason === null,
    'Re-acceptance result was not persisted',
  );
  check(
    persistedAcceptance.remediationTasks.some(
      (task) => task.id === remediationTasks[0].id && task.status === 'COMPLETED',
    ),
    'Completed remediation association was not persisted',
  );

  await page.route('**/dashboard', async (route) => route.abort());
  await sidebar.getByRole('link', { name: '项目概览', exact: true }).click();
  await page.getByText('项目数据加载失败', { exact: true }).waitFor();
  await page.unroute('**/dashboard');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.locator('.dashboard-chart canvas').first().waitFor();
  await verifyDashboard();
  results.push({ name: 'dashboard-failure-retry', status: 'passed' });
  await capture('owner-dashboard.png');

  await sidebar.getByRole('link', { name: '统计与导出', exact: true }).click();
  await page.getByRole('heading', { name: '统计与导出', exact: true }).waitFor();
  await verifyDashboard();
  await downloadProgressReport(projectName, projectId);
  await capture('owner-reports.png');
  await page.getByRole('link', { name: '阶段验收', exact: true }).click();
  await verifyPassedAcceptance(remediationTitle);
  results.push({ name: 'acceptance-dashboard-report', status: 'passed' });
  await capture('owner-acceptance.png');

  logStep('observer read-only');
  await logout();
  await login(observer);
  await enterProject();
  await sidebar.getByRole('link', { name: '任务看板', exact: true }).click();
  await page.locator('.task-filter-panel').waitFor();
  check(
    (await page.getByRole('button', { name: '创建任务', exact: true }).count()) === 0,
    'Observer can create tasks',
  );
  check(
    (await sidebar.getByRole('link', { name: '项目设置', exact: true }).count()) === 0,
    'Observer can access project settings',
  );
  results.push({ name: 'observer-read-only', status: 'passed' });
  await capture('observer-board.png');

  logStep('outsider isolation');
  await logout();
  await login(outsider);
  await page.evaluate((id) => {
    globalThis.location.hash = `#/projects/${encodeURIComponent(id)}/overview`;
  }, projectId);
  await page.getByRole('alert').getByText('无法访问项目', { exact: true }).waitFor();
  check(
    (await page.getByText(projectName, { exact: true }).count()) === 0,
    'Outsider saw project details',
  );
  results.push({ name: 'cross-project-isolation', status: 'passed' });

  check(rendererErrors.length === 0, 'Renderer reported an unhandled error');
  writeFileSync(join(runDirectory, 'results.json'), JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ runDirectory, results }, null, 2));
} catch (error) {
  writeFileSync(
    join(runDirectory, 'results.json'),
    JSON.stringify({ results, status: 'failed' }, null, 2),
  );
  if (page) {
    await capture('failure.png').catch(() => undefined);
    const text = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    console.error(text.slice(-1500));
  }
  throw error;
} finally {
  // Failed assertions may leave a draft whose unsaved-change guard blocks close().
  await electronApp?.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await electronApp?.close().catch(() => undefined);
}
