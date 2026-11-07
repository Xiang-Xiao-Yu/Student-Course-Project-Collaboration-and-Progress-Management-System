// Real Electron + isolated P4 API test for FR-06/FR-07 and AC-05.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(process.argv[2] ?? '');
const playwrightPackage = process.argv[3];
const electronExe = process.argv[4];
const apiBaseUrl = process.argv[5];
const runDirectory = process.argv[6]
  ? resolve(process.argv[6])
  : join(root, 'tmp', 'ui-demo', 'p4-run-' + Date.now());
mkdirSync(runDirectory, { recursive: true });

const { _electron } = createRequire(playwrightPackage)('playwright');
const results = [];
const network = [];
const password = 'P4-ui-password-123';
let electronApp;
let page;

function check(condition, label) {
  if (!condition) {
    throw new Error(label);
  }
}

async function capture(filename) {
  const options = {
    animations: 'disabled',
    path: join(runDirectory, filename),
    timeout: 15000,
  };

  await page.bringToFront();
  await page.screenshot(options).catch(async () => {
    await page.bringToFront();
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
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${payload.error?.code ?? ''}`);
  }

  return payload.data;
}

async function createAccount(role, nickname) {
  const username = `${role}-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const user = await apiRequest('/auth/register', 'POST', undefined, {
    nickname,
    password,
    username,
  });
  const session = await apiRequest('/auth/login', 'POST', undefined, {
    password,
    username,
  });

  return { id: user.id, token: session.accessToken, username };
}

async function createTask(token, projectId, title, dueDate, extra = {}) {
  return apiRequest(`/projects/${projectId}/tasks`, 'POST', token, {
    dueDate,
    priority: 'MEDIUM',
    title,
    ...extra,
  });
}

async function setTaskStatus(token, projectId, taskId, status, extra = {}) {
  return apiRequest(`/projects/${projectId}/tasks/${taskId}/status`, 'PATCH', token, {
    status,
    ...extra,
  });
}

async function login(username) {
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '项目中心', exact: true }).waitFor();
}

async function logout() {
  const switchProject = page.getByRole('link', { name: '切换项目', exact: true });

  if ((await switchProject.count()) > 0) {
    await switchProject.click();
    await page.getByRole('heading', { name: '项目中心', exact: true }).waitFor();
  }

  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
}

async function enterProject() {
  await page.getByRole('link', { name: '进入项目', exact: true }).click();
  await page.getByRole('heading', { name: '项目概览', exact: true }).waitFor();
}

async function createIteration(name, goal, startDate, endDate) {
  const form = page.locator('.iteration-create-panel');

  await form.getByLabel('迭代名称', { exact: true }).fill(name);
  await form.getByLabel('迭代目标', { exact: true }).fill(goal);
  await form.getByLabel('开始日期', { exact: true }).fill(startDate);
  await form.getByLabel('结束日期', { exact: true }).fill(endDate);
  await form.getByRole('button', { name: '创建迭代', exact: true }).click();
  await page.getByText('迭代已创建。', { exact: true }).waitFor();
  await page.locator('.iteration-list-row').filter({ hasText: name }).waitFor();
}

async function addTaskToSelectedIteration(task) {
  await page.locator('.iteration-add-task select').selectOption(task.id);
  await page.getByRole('button', { name: '加入迭代', exact: true }).click();
  await page.locator('.iteration-task-row').filter({ hasText: task.title }).waitFor();
}

try {
  const owner = await createAccount('owner', 'P4 项目负责人');
  const observer = await createAccount('observer', 'P4 观察员');
  const project = await apiRequest('/projects', 'POST', owner.token, {
    description: 'P4 迭代与评论真实联调项目',
    endDate: '2026-12-31',
    name: 'P4 迭代与评论验证',
    startDate: '2026-10-01',
  });

  await apiRequest(`/projects/${project.id}/members`, 'POST', owner.token, {
    role: 'OBSERVER',
    username: observer.username,
  });
  const requirement = await apiRequest(
    `/projects/${project.id}/requirements`,
    'POST',
    owner.token,
    {
      acceptanceCriteria: 'P4 评论和迭代流程可以复核。',
      description: '用于真实 Electron 评论验证。',
      priority: 'MEDIUM',
      title: 'P4 评论验证需求',
    },
  );

  const overdueTask = await createTask(owner.token, project.id, '逾期未完成任务', '2026-11-01');
  const blockedTask = await createTask(owner.token, project.id, '阻塞任务', '2026-12-10');
  const completedTask = await createTask(owner.token, project.id, '已完成任务', '2026-12-12', {
    requirementId: requirement.id,
  });
  const removableTask = await createTask(owner.token, project.id, '临时移出任务', '2026-12-15');
  const staleTask = await createTask(owner.token, project.id, '并发迁移任务', '2026-12-16');

  await setTaskStatus(owner.token, project.id, blockedTask.id, 'TODO');
  await setTaskStatus(owner.token, project.id, blockedTask.id, 'BLOCKED');

  await setTaskStatus(owner.token, project.id, completedTask.id, 'TODO');
  await setTaskStatus(owner.token, project.id, completedTask.id, 'IN_PROGRESS');
  await setTaskStatus(owner.token, project.id, completedTask.id, 'PENDING_REVIEW', {
    completionNote: '已完成 P4 评论和迭代验证。',
  });
  await setTaskStatus(owner.token, project.id, completedTask.id, 'COMPLETED');

  electronApp = await _electron.launch({
    executablePath: electronExe,
    args: [
      join(root, 'apps', 'desktop', 'out', 'main', 'index.js'),
      '--user-data-dir=' + join(runDirectory, 'electron-profile'),
      ...(process.env.P4_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
    ],
    env: { ...process.env, ELECTRON_API_BASE_URL: apiBaseUrl },
    timeout: 20000,
  });
  page = await electronApp.firstWindow();
  page.setDefaultTimeout(12000);
  page.on('response', (response) => {
    if (response.url().startsWith(apiBaseUrl)) {
      network.push({
        method: response.request().method(),
        path: response.url().slice(apiBaseUrl.length),
        status: response.status(),
      });
    }
  });

  await login(owner.username);
  await enterProject();
  await page.getByRole('link', { name: '迭代计划', exact: true }).click();
  await page.getByRole('heading', { name: '迭代计划', exact: true }).waitFor();
  await createIteration(
    'P4 主迭代',
    '验证迭代统计、任务安排和关闭迁移。',
    '2026-11-01',
    '2026-11-30',
  );

  for (const task of [overdueTask, blockedTask, completedTask, removableTask]) {
    await addTaskToSelectedIteration(task);
  }

  const stats = page.locator('.iteration-stats');
  const firstStats = await stats.innerText();
  check(firstStats.includes('任务总数\n4'), 'Iteration total task count is incorrect');
  check(firstStats.includes('已完成\n1'), 'Iteration completed count is incorrect');
  check(firstStats.includes('阻塞\n1'), 'Iteration blocked count is incorrect');
  check(firstStats.includes('逾期\n1'), 'Iteration overdue count is incorrect');
  check(firstStats.includes('完成率\n25%'), 'Iteration completion rate is incorrect');

  const removableRow = page.locator('.iteration-task-row').filter({ hasText: removableTask.title });
  await removableRow.getByRole('button', { name: '移出迭代', exact: true }).click();
  await page.getByText('任务已移出迭代。', { exact: true }).waitFor();
  check(
    (await stats.innerText()).includes('任务总数\n3'),
    'Removing a task did not update iteration statistics',
  );
  await capture('iteration-stats.png');

  await page.getByRole('button', { name: '开始迭代', exact: true }).click();
  const confirmDialog = page.locator('.confirm-dialog');
  await confirmDialog.getByRole('button', { name: '确认更新', exact: true }).click();
  await page.getByText('迭代已更新为“进行中”。', { exact: true }).waitFor();

  await createIteration('P4 迁移迭代', '接收主迭代未完成任务。', '2026-12-01', '2026-12-31');
  await page.locator('.iteration-add-task select').selectOption(overdueTask.id);
  await page.getByRole('button', { name: '加入迭代', exact: true }).click();
  const migrationDialog = page.locator('.confirm-dialog').filter({ hasText: '迁移任务' });
  await migrationDialog.waitFor();
  check(
    (await migrationDialog.innerText()).includes('P4 主迭代'),
    'Task migration confirmation does not show the source iteration',
  );
  await migrationDialog.getByRole('button', { name: '取消', exact: true }).click();
  results.push({ name: 'task source display and migration confirmation', status: 'PASS' });
  await page.locator('.iteration-list-row').filter({ hasText: 'P4 主迭代' }).click();
  await page.locator('.iteration-detail-panel h2').filter({ hasText: 'P4 主迭代' }).waitFor();

  await page.getByRole('button', { name: '编辑迭代', exact: true }).click();
  await page.locator('.iteration-edit-form textarea').fill('尚未保存的迭代目标');
  await page.locator('.iteration-list-row').filter({ hasText: 'P4 迁移迭代' }).click();
  const switchDialog = page.locator('.confirm-dialog').filter({ hasText: '切换迭代' });
  await switchDialog.waitFor();
  await switchDialog.getByRole('button', { name: '取消', exact: true }).click();
  check(
    (await page.locator('.iteration-detail-panel').innerText()).includes('P4 主迭代'),
    'Unsaved edit confirmation cancel changed the selected iteration',
  );
  results.push({ name: 'unsaved iteration switch confirmation', status: 'PASS' });
  await createIteration('P4 草稿验证迭代', '验证创建时保留当前编辑。', '2026-12-01', '2026-12-31');
  check(
    (await page.locator('.iteration-edit-form textarea').inputValue()) === '尚未保存的迭代目标',
    'Creating another iteration lost the unsaved edit',
  );
  check(
    (await page.locator('.iteration-detail-panel h2').innerText()) === 'P4 主迭代',
    'Creating another iteration changed selection while editing',
  );
  await page.getByRole('button', { name: '收起编辑', exact: true }).click();
  await page.locator('.iteration-list-row').filter({ hasText: 'P4 迁移迭代' }).click();
  await switchDialog.waitFor();
  await switchDialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '编辑迭代', exact: true }).click();
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  results.push({ name: 'creation and collapsed editor preserve unsaved changes', status: 'PASS' });

  await page.getByRole('button', { name: '关闭迭代', exact: true }).click();
  const closeDialog = page.locator('.iteration-close-dialog');
  await closeDialog.locator('select').selectOption({ label: 'P4 迁移迭代 · 未开始' });
  await closeDialog.getByRole('button', { name: '确认关闭迭代', exact: true }).click();
  await page.getByText('迭代已关闭，未完成任务已迁移到下一迭代。', { exact: true }).waitFor();
  check(
    (await page.locator('.iteration-detail-panel').innerText()).includes('已完成'),
    'Closed iteration status is not shown',
  );
  check(
    (await stats.innerText()).includes('任务总数\n1'),
    'Completed task was not retained in the closed iteration',
  );

  await page.locator('.iteration-list-row').filter({ hasText: 'P4 迁移迭代' }).click();
  await page.locator('.iteration-task-row').filter({ hasText: overdueTask.title }).waitFor();
  await page.locator('.iteration-task-row').filter({ hasText: blockedTask.title }).waitFor();
  await capture('iteration-overview.png');
  const displayedTaskId = await page.locator('.iteration-add-task select').inputValue();
  const displayedTask = [removableTask, staleTask].find((task) => task.id === displayedTaskId);
  check(displayedTask, 'The default candidate is not an available unfinished task');
  await page.getByRole('button', { name: '加入迭代', exact: true }).click();
  const defaultAddedRow = page
    .locator('.iteration-task-row')
    .filter({ hasText: displayedTask.title });
  await defaultAddedRow.waitFor();
  await defaultAddedRow.getByRole('button', { name: '移出迭代', exact: true }).click();
  await page.getByText('任务已移出迭代。', { exact: true }).waitFor();
  results.push({ name: 'default task matches the visible candidate', status: 'PASS' });

  results.push({ name: 'iteration creation and task membership', status: 'PASS' });
  results.push({ name: 'iteration statistics and task removal', status: 'PASS' });
  results.push({ name: 'iteration close and incomplete task migration', status: 'PASS' });

  await createIteration('P4 取消迭代', '验证终态未完成任务迁移。', '2026-11-01', '2026-11-30');
  await addTaskToSelectedIteration(removableTask);
  await page.getByRole('button', { name: '取消迭代', exact: true }).click();
  await confirmDialog.getByRole('button', { name: '确认更新', exact: true }).click();
  await page.getByText('迭代已更新为“已取消”。', { exact: true }).waitFor();
  check(
    (await page.getByRole('button', { name: '加入迭代', exact: true }).count()) === 0,
    'Canceled iteration still offers an invalid add action',
  );
  await page.locator('.iteration-list-row').filter({ hasText: 'P4 迁移迭代' }).click();
  await page.locator('.iteration-add-task select').selectOption(removableTask.id);
  await page.getByRole('button', { name: '加入迭代', exact: true }).click();
  await migrationDialog.getByRole('button', { name: '确认迁移', exact: true }).click();
  await page.locator('.iteration-task-row').filter({ hasText: removableTask.title }).waitFor();
  results.push({ name: 'unfinished tasks can move out of canceled iterations', status: 'PASS' });

  const iterations = await apiRequest(`/projects/${project.id}/iterations`, 'GET', owner.token);
  const concurrentSource = iterations.find((item) => item.name === 'P4 草稿验证迭代');
  await apiRequest(
    `/projects/${project.id}/iterations/${concurrentSource.id}/tasks`,
    'POST',
    owner.token,
    { expectedIterationId: null, taskId: staleTask.id },
  );
  await page.locator('.iteration-add-task select').selectOption(staleTask.id);
  await page.getByRole('button', { name: '加入迭代', exact: true }).click();
  await page.getByText('任务归属已变化，请刷新后重试', { exact: true }).waitFor();
  const sourceAfterConflict = await apiRequest(
    `/projects/${project.id}/iterations/${concurrentSource.id}`,
    'GET',
    owner.token,
  );
  check(
    sourceAfterConflict.tasks.some((item) => item.id === staleTask.id),
    'Stale migration overwrote another iteration',
  );
  results.push({
    name: 'stale task ownership is rejected without moving the task',
    status: 'PASS',
  });

  await page.getByRole('link', { name: '任务看板', exact: true }).click();
  await page
    .locator('.board-column--completed .task-card')
    .filter({ hasText: completedTask.title })
    .getByRole('link', { name: completedTask.title, exact: true })
    .click();
  await page.getByRole('heading', { name: '任务详情', exact: true }).waitFor();

  const taskCommentPanel = page.locator('.comment-panel');
  await taskCommentPanel.getByLabel('发布评论', { exact: true }).fill('第一轮任务评论');
  await page.getByRole('link', { name: '需求管理', exact: true }).click();
  const unsavedDialog = page.locator('.confirm-dialog').filter({ hasText: '存在未保存内容' });
  await unsavedDialog.getByRole('button', { name: '继续编辑', exact: true }).click();
  check(
    (await taskCommentPanel.locator('.comment-compose textarea').inputValue()) === '第一轮任务评论',
    'Task comment draft was lost when navigation was canceled',
  );
  await taskCommentPanel.getByRole('button', { name: '发表评论', exact: true }).click();
  await page.getByText('评论已发布。', { exact: true }).waitFor();
  await taskCommentPanel.locator('.comment-compose textarea').fill('第二条任务评论');
  await taskCommentPanel.getByRole('button', { name: '发表评论', exact: true }).click();
  await taskCommentPanel.getByText('第二条任务评论', { exact: true }).waitFor();
  const taskComment = taskCommentPanel
    .locator('.comment-row')
    .filter({ hasText: '第一轮任务评论' });
  const secondTaskComment = taskCommentPanel
    .locator('.comment-row')
    .filter({ hasText: '第二条任务评论' });
  const editingTaskComment = taskCommentPanel.locator('.comment-row').first();
  await taskComment.getByRole('button', { name: '编辑', exact: true }).click();
  await editingTaskComment.locator('textarea').fill('修改后的任务评论');
  check(
    await secondTaskComment.getByRole('button', { name: '编辑', exact: true }).isDisabled(),
    'Another comment can replace an unsaved edit',
  );
  await page.getByRole('link', { name: '需求管理', exact: true }).click();
  await unsavedDialog.getByRole('button', { name: '继续编辑', exact: true }).click();
  await editingTaskComment.getByRole('button', { name: '保存评论', exact: true }).click();
  await page.getByText('评论已更新。', { exact: true }).waitFor();
  await capture('task-comment-edited.png');
  for (const content of ['修改后的任务评论', '第二条任务评论']) {
    await taskCommentPanel
      .locator('.comment-row')
      .filter({ hasText: content })
      .getByRole('button', { name: '删除', exact: true })
      .click();
    await page
      .locator('.confirm-dialog')
      .getByRole('button', { name: '确认删除', exact: true })
      .click();
    await taskCommentPanel
      .locator('.comment-row')
      .filter({ hasText: content })
      .waitFor({ state: 'detached' });
  }
  check(
    (await taskCommentPanel.locator('.comment-row').count()) === 0,
    'Task comment was not deleted',
  );

  results.push({ name: 'task comment create edit delete', status: 'PASS' });

  await page.getByRole('link', { name: '需求管理', exact: true }).click();
  const requirementLink = page.getByRole('link', { name: /^查看(与编辑|详情)$/ });
  await requirementLink.click();
  await page.getByRole('heading', { name: '需求详情', exact: true }).waitFor();
  const requirementCommentPanel = page.locator('.comment-panel');
  await requirementCommentPanel.locator('.comment-compose textarea').fill('尚未保存的需求评论');
  await page.getByRole('button', { name: '删除需求', exact: true }).click();
  const deleteRequirementDialog = page.locator('.confirm-dialog').filter({ hasText: '删除需求' });
  check(
    (await deleteRequirementDialog.innerText()).includes('未保存的评论也会丢失'),
    'Requirement deletion did not warn about the comment draft',
  );
  await deleteRequirementDialog.getByRole('button', { name: '取消', exact: true }).click();
  check(
    (await requirementCommentPanel.locator('.comment-compose textarea').inputValue()) ===
      '尚未保存的需求评论',
    'Canceling requirement deletion lost the comment draft',
  );
  results.push({ name: 'requirement deletion warns about comment draft', status: 'PASS' });
  await requirementCommentPanel
    .locator('.comment-compose textarea')
    .fill('观察员只能查看的需求评论');
  await page.getByRole('link', { name: '任务看板', exact: true }).click();
  await unsavedDialog.getByRole('button', { name: '继续编辑', exact: true }).click();
  await requirementCommentPanel.getByRole('button', { name: '发表评论', exact: true }).click();
  await page.getByText('评论已发布。', { exact: true }).waitFor();
  results.push({
    name: 'comment drafts block navigation on task and requirement pages',
    status: 'PASS',
  });

  await logout();
  await login(observer.username);
  await enterProject();
  await page.getByRole('link', { name: '需求管理', exact: true }).click();
  await page.getByRole('link', { name: /^查看(与编辑|详情)$/ }).click();
  await page.getByRole('heading', { name: '需求详情', exact: true }).waitFor();
  const observerCommentPanel = page.locator('.comment-panel');
  await observerCommentPanel.getByText('当前角色只能查看评论。', { exact: true }).waitFor();
  check(
    (await observerCommentPanel.getByLabel('发布评论', { exact: true }).count()) === 0,
    'Observer can see the comment editor',
  );
  await observerCommentPanel.getByText('观察员只能查看的需求评论', { exact: true }).waitFor();
  await observerCommentPanel.scrollIntoViewIfNeeded();
  await capture('observer-comments-readonly.png');
  results.push({ name: 'requirement comments and observer read-only access', status: 'PASS' });
} catch (error) {
  results.push({ name: 'HARNESS', status: 'FAIL', reason: error.message.split('\n')[0] });
  console.log(error.stack ?? error.message);
  if (page) {
    console.log('Failure body: ' + (await page.locator('body').innerText()).slice(0, 1400));
    await capture('failure.png').catch(() => {});
  }
} finally {
  if (electronApp) {
    await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
  writeFileSync(
    join(runDirectory, 'results.json'),
    JSON.stringify({ cases: results, network }, null, 2),
  );
  console.log(JSON.stringify({ runDirectory, cases: results }));
  if (results.some((result) => result.status === 'FAIL')) {
    process.exitCode = 1;
  }
  await delay(50);
}
