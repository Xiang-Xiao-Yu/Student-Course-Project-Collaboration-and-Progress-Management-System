// Real Electron + isolated P5 API test for FR-08/FR-09 and AC-06/AC-07.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(process.argv[2] ?? '');
const playwrightPackage = process.argv[3];
const electronExe = process.argv[4];
const apiBaseUrl = process.argv[5];
const runDirectory = join(root, 'tmp', 'ui-demo', 'p5-run-' + Date.now());
mkdirSync(runDirectory, { recursive: true });

const { _electron } = createRequire(playwrightPackage)('playwright');
const results = [];
const network = [];
const password = 'P5-ui-password-123';
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

  return { id: user.id, token: session.accessToken, username, nickname };
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
  const owner = await createAccount('owner', 'P5 项目负责人');
  const member = await createAccount('member', 'P5 项目成员');
  const observer = await createAccount('observer', 'P5 项目观察员');
  const project = await apiRequest('/projects', 'POST', owner.token, {
    description: 'P5 会议与阶段验收真实联调项目',
    endDate: '2026-12-31',
    name: 'P5 会议与验收验证',
    startDate: '2026-11-01',
  });

  await apiRequest(`/projects/${project.id}/members`, 'POST', owner.token, {
    role: 'MEMBER',
    username: member.username,
  });
  await apiRequest(`/projects/${project.id}/members`, 'POST', owner.token, {
    role: 'OBSERVER',
    username: observer.username,
  });
  const remediationIteration = await apiRequest(
    `/projects/${project.id}/iterations`,
    'POST',
    owner.token,
    {
      endDate: '2026-12-31',
      name: 'P5 整改迭代',
      startDate: '2026-11-01',
    },
  );

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

  let failNextIterationAssignment = true;
  await page.route('**/iterations/*/tasks', async (route) => {
    if (failNextIterationAssignment && route.request().method() === 'POST') {
      failNextIterationAssignment = false;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: '模拟加入迭代失败',
          },
          meta: {
            requestId: 'p5-remediation-failure',
            timestamp: new Date().toISOString(),
          },
          success: false,
        }),
        status: 500,
      });
      return;
    }

    await route.continue();
  });

  await login(owner.username);
  await enterProject();
  await page.getByRole('link', { name: '会议纪要', exact: true }).click();
  await page.locator('h1').filter({ hasText: '会议纪要' }).waitFor();

  const meetingForm = page.locator('.meeting-create-panel');
  await meetingForm.getByLabel('会议主题', { exact: true }).fill('P5 真实联调会议');
  await meetingForm.getByLabel('会议时间', { exact: true }).fill('2026-11-10T10:00');
  await meetingForm.getByLabel('会议议程', { exact: true }).fill('验证会议、行动项和转换流程。');
  await meetingForm
    .locator('.participant-selector label')
    .filter({ hasText: member.username })
    .getByRole('checkbox')
    .check();
  await meetingForm.getByRole('button', { name: '创建会议', exact: true }).click();
  await page.getByText('会议已创建。', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'P5 真实联调会议', exact: true }).waitFor();
  check(
    (await page.locator('.meeting-meta').innerText()).includes('创建人：P5 项目负责人'),
    'Meeting creator fallback is not displayed',
  );

  await page.getByRole('button', { name: '编辑会议', exact: true }).click();
  const meetingEditForm = page.locator('.meeting-edit-form');
  await meetingEditForm
    .locator('.participant-selector label')
    .filter({ hasText: observer.username })
    .getByRole('checkbox')
    .check();
  await meetingEditForm
    .locator('.participant-selector label')
    .filter({ hasText: member.username })
    .getByRole('checkbox')
    .uncheck();
  await meetingEditForm.getByLabel('会议纪要', { exact: true }).fill('已完成 P5 会议联调。');
  await meetingEditForm.getByLabel('会议决定', { exact: true }).fill('补齐真实契约问题。');
  await meetingEditForm.getByRole('button', { name: '保存会议', exact: true }).click();
  await page.getByText('会议信息已保存。', { exact: true }).waitFor();
  check(
    (await page.locator('.meeting-meta').innerText()).includes('参会 1 人'),
    'Meeting participant edit did not persist',
  );
  results.push({ name: 'meeting summary, creator fallback and participant edit', status: 'PASS' });

  const actionForm = page.locator('.meeting-action-form');
  await actionForm.getByLabel('行动项标题', { exact: true }).fill('P5 整改行动');
  await actionForm.locator('input[type="date"]').fill('2026-10-31');
  await actionForm.getByRole('button', { name: '创建行动项', exact: true }).click();
  await page.getByText('行动项截止日期不能早于项目开始日期。', { exact: true }).waitFor();
  await actionForm.locator('input[type="date"]').fill('2026-11-20');
  await actionForm.getByRole('button', { name: '创建行动项', exact: true }).click();
  await page.getByText('行动项已创建。', { exact: true }).waitFor();

  const actionRow = page.locator('.meeting-action-row').filter({ hasText: 'P5 整改行动' });
  await actionRow.getByRole('button', { name: '进行中', exact: true }).click();
  await page.getByText('行动项已更新为“进行中”。', { exact: true }).waitFor();
  await actionRow.getByRole('button', { name: '转为任务', exact: true }).click();
  await page.getByText('行动项已转换为任务“P5 整改行动”。', { exact: true }).waitFor();
  await actionRow.getByRole('link', { name: '查看任务', exact: true }).waitFor();
  await capture('meeting-action-converted.png');
  results.push({ name: 'action due-date guard and conversion response', status: 'PASS' });

  await page.getByRole('link', { name: '阶段验收', exact: true }).click();
  await page.getByRole('heading', { name: '阶段验收', exact: true }).waitFor();
  const acceptanceForm = page.locator('.acceptance-create-panel');
  await acceptanceForm.getByLabel('验收阶段名称', { exact: true }).fill('P5 阶段验收');
  await acceptanceForm.getByLabel('验收日期', { exact: true }).fill('2026-11-20');
  await acceptanceForm.getByLabel('验收目标', { exact: true }).fill('验证会议和阶段验收。');
  await acceptanceForm
    .getByLabel('验收标准', { exact: true })
    .fill('会议、行动项、转换任务和整改流程可复核。');
  await acceptanceForm
    .locator('.participant-selector label')
    .filter({ hasText: member.username })
    .getByRole('checkbox')
    .check();
  await acceptanceForm.getByRole('button', { name: '创建阶段验收', exact: true }).click();
  await page.getByText('阶段验收已创建。', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'P5 阶段验收', exact: true }).waitFor();
  results.push({ name: 'acceptance summary without participants', status: 'PASS' });

  await page.getByRole('button', { name: /进入“验收中”/ }).click();
  await page
    .locator('.acceptance-edit-form')
    .getByRole('button', { name: '保存验收', exact: true })
    .click();
  await page.getByText('阶段验收已保存。', { exact: true }).waitFor();
  await page.getByRole('button', { name: /进入“未通过”/ }).click();
  const acceptanceEditForm = page.locator('.acceptance-edit-form');
  await acceptanceEditForm.getByLabel('未通过原因', { exact: true }).fill('缺少最终复审。');
  await acceptanceEditForm.getByRole('button', { name: '保存验收', exact: true }).click();
  await page.getByText('阶段验收已保存。', { exact: true }).waitFor();
  results.push({ name: 'acceptance participant edit and failure reason', status: 'PASS' });

  const remediationForm = page.locator('.remediation-form');
  await remediationForm.getByLabel('整改任务标题', { exact: true }).fill('P5 整改任务');
  await remediationForm
    .locator('.form-field')
    .filter({ hasText: '负责人' })
    .locator('select')
    .selectOption(member.id);
  await remediationForm.locator('input[type="date"]').fill('2026-11-25');
  await remediationForm
    .locator('.form-field')
    .filter({ hasText: '关联迭代' })
    .locator('select')
    .selectOption(remediationIteration.id);
  await remediationForm.getByRole('button', { name: '创建整改任务', exact: true }).click();
  await page.getByText(/整改任务已创建，但加入迭代失败/).waitFor();
  await page.getByRole('link', { name: '查看已创建任务', exact: true }).waitFor();
  await capture('remediation-partial-success.png');
  await page.getByRole('button', { name: '重试加入迭代并刷新', exact: true }).click();
  await page.getByText('整改任务已创建。', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'P5 整改任务', exact: true }).waitFor();
  const projectTasks = await apiRequest(`/projects/${project.id}/tasks`, 'GET', owner.token);
  check(
    projectTasks.filter((task) => task.title === 'P5 整改任务').length === 1,
    'Remediation retry created a duplicate task',
  );
  await capture('acceptance-remediation.png');
  results.push({ name: 'acceptance remediation partial failure and retry', status: 'PASS' });

  await logout();
  await login(observer.username);
  await enterProject();
  await page.getByRole('link', { name: '会议纪要', exact: true }).click();
  await page.locator('h1').filter({ hasText: '会议纪要' }).waitFor();
  check(
    (await page.getByRole('heading', { name: '创建会议', exact: true }).count()) === 0,
    'Observer can see meeting creation',
  );
  check(
    (await page.getByRole('button', { name: '编辑会议', exact: true }).count()) === 0,
    'Observer can edit a meeting',
  );
  await capture('observer-meeting-readonly.png');
  results.push({ name: 'observer meeting read-only', status: 'PASS' });
} catch (error) {
  results.push({ name: 'HARNESS', status: 'FAIL', reason: error.message.split('\n')[0] });
  console.log(error.stack ?? error.message);
  if (page) {
    console.log('Failure body: ' + (await page.locator('body').innerText()).slice(0, 1600));
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
