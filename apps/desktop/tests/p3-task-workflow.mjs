// Real Electron + isolated P3 API test for FR-04/FR-05 and AC-03/AC-04.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(process.argv[2] ?? '');
const playwrightPackage = process.argv[3];
const electronExe = process.argv[4];
const apiBaseUrl = process.argv[5];
const runDirectory = join(root, 'tmp', 'ui-demo', 'p3-run-' + Date.now());
mkdirSync(runDirectory, { recursive: true });

const { _electron } = createRequire(playwrightPackage)('playwright');
const results = [];
const network = [];
const password = 'P3-ui-password-123';
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
  await page.evaluate(() => globalThis.scrollTo(0, 0));

  try {
    await page.screenshot(options);
  } catch {
    await page.bringToFront();
    await page.screenshot(options);
  }
}

async function captureCurrent(filename) {
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

async function dragTaskToColumn(card, columnSelector) {
  const dataTransfer = await page.evaluateHandle(() => new globalThis.DataTransfer());
  const target = page.locator(columnSelector);

  await card.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragenter', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
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

async function createAccount(role) {
  const username = `${role}-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const nickname = role === 'owner' ? '项目负责人' : role === 'member' ? '普通成员' : '课程观察员';
  const user = await apiRequest('/auth/register', 'POST', undefined, {
    nickname,
    password,
    username,
  });
  const session = await apiRequest('/auth/login', 'POST', undefined, {
    password,
    username,
  });

  return {
    id: user.id,
    token: session.accessToken,
    username,
  };
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

try {
  const owner = await createAccount('owner');
  const member = await createAccount('member');
  const observer = await createAccount('observer');
  const project = await apiRequest('/projects', 'POST', owner.token, {
    description: 'P3 真实 API 与 Electron 联调项目',
    endDate: '2026-12-31',
    name: 'P3 任务工作流验证',
    startDate: '2026-10-27',
  });

  await apiRequest(`/projects/${project.id}/members`, 'POST', owner.token, {
    role: 'MEMBER',
    username: member.username,
  });
  await apiRequest(`/projects/${project.id}/members`, 'POST', owner.token, {
    role: 'OBSERVER',
    username: observer.username,
  });

  electronApp = await _electron.launch({
    executablePath: electronExe,
    args: [
      join(root, 'apps', 'desktop', 'out', 'main', 'index.js'),
      '--user-data-dir=' + join(runDirectory, 'electron-profile'),
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
  await page.getByRole('link', { name: '需求管理', exact: true }).click();
  await page.getByRole('heading', { name: '需求管理', exact: true }).waitFor();

  const createRequirementForm = page.locator('.requirement-create-panel');
  await createRequirementForm.getByLabel('需求标题', { exact: true }).fill('P3 关联任务需求');
  await createRequirementForm.getByLabel('需求描述', { exact: true }).fill('验证需求与任务关联。');
  await createRequirementForm
    .getByLabel('验收标准', { exact: true })
    .fill('需求详情可以看到关联任务及完成状态。');
  await createRequirementForm.getByLabel('优先级').selectOption('HIGH');
  await createRequirementForm.getByRole('button', { name: '创建需求', exact: true }).click();
  await page.getByText('需求 REQ-001 已创建。', { exact: true }).waitFor();
  await page.getByRole('link', { name: '查看与编辑', exact: true }).click();
  await page.getByRole('heading', { name: '需求详情', exact: true }).waitFor();
  await page.getByLabel('需求状态').selectOption('CONFIRMED');
  await page.getByRole('button', { name: '保存需求', exact: true }).click();
  await page.getByText('需求已保存。', { exact: true }).waitFor();
  await capture('requirement-detail.png');

  await page.getByRole('link', { name: '任务看板', exact: true }).click();
  await page.getByRole('heading', { name: '任务看板', exact: true }).waitFor();
  const createTaskForm = page.locator('.task-create-panel');
  await createTaskForm.getByLabel('任务标题', { exact: true }).fill('实现 P3 任务工作流');
  await createTaskForm.getByLabel('任务描述', { exact: true }).fill('验证创建、拖拽和审核流程。');
  await createTaskForm.getByLabel('负责人').selectOption(member.id);
  await createTaskForm.getByLabel('关联需求').selectOption({ label: 'REQ-001 · P3 关联任务需求' });
  await createTaskForm.getByLabel('优先级').selectOption('HIGH');
  await createTaskForm.locator('input[type="date"]').fill('2026-01-01');
  await createTaskForm.getByLabel('预估工时', { exact: true }).fill('4.5');
  const tagInput = createTaskForm.getByLabel('新任务标签', { exact: true });
  await tagInput.fill('backend,v2');
  await createTaskForm.getByRole('button', { name: '添加', exact: true }).click();
  await tagInput.fill('urgent');
  await tagInput.press('Enter');
  await createTaskForm.getByRole('button', { name: '创建任务', exact: true }).click();
  await page.getByText('任务截止日期不能早于项目开始日期', { exact: false }).waitFor();
  await createTaskForm.locator('input[type="date"]').fill('2026-11-15');
  await createTaskForm.getByRole('button', { name: '创建任务', exact: true }).click();
  await page.getByText('任务已创建。', { exact: true }).waitFor();

  const backlogCard = page
    .locator('.board-column--backlog .task-card')
    .filter({ hasText: '实现 P3 任务工作流' });
  await backlogCard.waitFor();
  await backlogCard.getByText('backend,v2', { exact: true }).waitFor();
  await dragTaskToColumn(backlogCard, '.board-column--completed');
  await page.getByText('任务不能从“待规划”直接转为“已完成”。', { exact: true }).waitFor();
  check(
    (await page
      .locator('.board-column--backlog .task-card')
      .filter({ hasText: '实现 P3 任务工作流' })
      .count()) === 1,
    'Illegal drag removed the task from its original column',
  );
  await dragTaskToColumn(backlogCard, '.board-column--todo');
  await page
    .locator('.board-column--todo .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .waitFor();
  await page.locator('.task-board').scrollIntoViewIfNeeded();
  await captureCurrent('task-board.png');

  await page
    .locator('.board-column--todo .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .getByRole('button', { name: '编辑任务', exact: true })
    .click();
  const editDialog = page.locator('.task-edit-dialog');
  await editDialog.getByRole('button', { name: '开始处理', exact: true }).click();
  await page
    .locator('.board-column--in_progress .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .waitFor();

  await page
    .locator('.board-column--in_progress .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .getByRole('button', { name: '编辑任务', exact: true })
    .click();
  await editDialog.getByRole('button', { name: '提交审核', exact: true }).click();
  let transitionDialog = page.locator('.task-status-dialog');
  await transitionDialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await page.getByText('请填写任务完成说明。', { exact: true }).waitFor();
  await transitionDialog.locator('textarea').fill('功能与自动化验证已完成。');
  await transitionDialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await page
    .locator('.board-column--pending_review .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .waitFor();

  await page
    .locator('.board-column--pending_review .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .getByRole('button', { name: '编辑任务', exact: true })
    .click();
  await editDialog.getByRole('button', { name: '审核不通过', exact: true }).click();
  transitionDialog = page.locator('.task-status-dialog');
  await transitionDialog.locator('textarea').fill('缺少边界测试，请补充后重新提交。');
  await transitionDialog.getByRole('button', { name: '确认不通过', exact: true }).click();
  await page.getByText('审核不通过原因已记录。', { exact: true }).waitFor();
  await page.getByText('审核不通过：缺少边界测试，请补充后重新提交。', { exact: true }).waitFor();

  await page
    .locator('.board-column--pending_review .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .getByRole('button', { name: '编辑任务', exact: true })
    .click();
  await editDialog.getByRole('button', { name: '重新提交审核', exact: true }).click();
  transitionDialog = page.locator('.task-status-dialog');
  await transitionDialog.locator('textarea').fill('已补充边界测试，重新提交审核。');
  await transitionDialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await page.getByText('任务已更新为“待审核”。', { exact: true }).waitFor();
  check(
    (await page
      .getByText('审核不通过：缺少边界测试，请补充后重新提交。', { exact: true })
      .count()) === 0,
    'Rejection reason remained after resubmission',
  );

  await page
    .locator('.board-column--pending_review .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .getByRole('button', { name: '编辑任务', exact: true })
    .click();
  await editDialog.getByRole('button', { name: '审核通过', exact: true }).click();
  transitionDialog = page.locator('.task-status-dialog');
  await transitionDialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await page
    .locator('.board-column--completed .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .waitFor();

  await page
    .locator('.board-column--completed .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .getByRole('link', { name: '实现 P3 任务工作流', exact: true })
    .click();
  await page.getByRole('heading', { name: '任务详情', exact: true }).waitFor();
  await page.getByText('已补充边界测试，重新提交审核。', { exact: true }).waitFor();
  check(
    (await page.locator('.completion-note').innerText()).includes('已补充边界测试，重新提交审核。'),
    'Task completion note is missing from the detail page',
  );
  check(
    !(await page.locator('.task-detail-list--compact').innerText()).includes('未记录'),
    'Completed task did not show a completion time',
  );
  await page.getByText('暂无评论', { exact: true }).waitFor();
  check(
    (await page.locator('.activity-timeline').innerText()).includes('状态：') &&
      (await page.locator('.activity-timeline').innerText()).includes('审核不通过原因：') &&
      (await page.locator('.activity-timeline').innerText()).includes('完成说明：'),
    'Task activity timeline is missing review history',
  );
  await capture('task-detail-completed.png');
  await page.locator('.activity-timeline').scrollIntoViewIfNeeded();
  await captureCurrent('task-history-diff.png');

  await page.getByRole('button', { name: '重新打开任务', exact: true }).click();
  await transitionDialog.locator('textarea').fill('需要补充验收说明');
  await transitionDialog.getByRole('button', { name: '确认重新打开', exact: true }).click();
  await page.getByText('任务已更新为“进行中”。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await transitionDialog.locator('textarea').fill('补充验收说明后再次提交。');
  await transitionDialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await page.getByText('任务已更新为“待审核”。', { exact: true }).waitFor();

  await page.getByRole('link', { name: '需求管理', exact: true }).click();
  await page.getByRole('link', { name: '查看与编辑', exact: true }).click();
  await page.getByRole('heading', { name: '需求详情', exact: true }).waitFor();
  await page.getByRole('link', { name: '实现 P3 任务工作流', exact: true }).waitFor();
  await capture('requirement-linked-task.png');

  await logout();
  await login(member.username);
  await enterProject();
  await page.getByRole('link', { name: '任务看板', exact: true }).click();
  await page
    .locator('.board-column--pending_review .task-card')
    .filter({ hasText: '实现 P3 任务工作流' })
    .getByRole('button', { name: '编辑任务', exact: true })
    .click();
  check(
    (await editDialog.getByRole('button', { name: '审核通过', exact: true }).count()) === 0,
    'Member can see the owner-only approval action',
  );
  await editDialog.getByRole('button', { name: '关闭', exact: true }).click();
  await capture('member-board.png');

  await logout();
  await login(observer.username);
  await enterProject();
  await page.getByRole('link', { name: '任务看板', exact: true }).click();
  check(
    (await page.getByRole('heading', { name: '创建任务', exact: true }).count()) === 0,
    'Observer can see the task creation form',
  );
  check(
    (await page.getByRole('button', { name: '编辑任务', exact: true }).count()) === 0,
    'Observer can see task edit controls',
  );
  await capture('observer-board.png');

  results.push({ name: 'requirement creation and status flow', status: 'PASS' });
  results.push({ name: 'task creation and invalid due date', status: 'PASS' });
  results.push({ name: 'drag rejection and legal board transition', status: 'PASS' });
  results.push({ name: 'completion, approval, detail and reopen flow', status: 'PASS' });
  results.push({ name: 'member and observer role visibility', status: 'PASS' });
} catch (error) {
  results.push({ name: 'HARNESS', status: 'FAIL', reason: error.message.split('\n')[0] });
  console.log(error.stack ?? error.message);
  if (page) {
    console.log('Failure body: ' + (await page.locator('body').innerText()).slice(0, 1000));
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
