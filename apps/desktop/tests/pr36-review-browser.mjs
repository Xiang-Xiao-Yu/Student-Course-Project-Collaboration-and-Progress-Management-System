// Real renderer/router regression checks with controlled API responses. FR-04/05, AC-03/04/10.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, relative, resolve, sep } from 'node:path';

const [rootArgument, playwrightPackage, browserExe] = process.argv.slice(2);
assert(
  rootArgument && playwrightPackage && browserExe,
  'Usage: node script root playwrightPackage browserExe',
);
const root = resolve(rootArgument);
const renderer = join(root, 'apps', 'desktop', 'out', 'renderer');
const output = join(root, 'tmp', 'ui-demo', 'pr36-review-browser', String(Date.now()));
const { chromium } = createRequire(resolve(playwrightPackage))('playwright');
const results = [];
const projectPath = '/projects/review-project';
const fixedDate = '2026-11-03T00:00:00.000Z';
let browser;

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolveValue) => {
    resolvePromise = resolveValue;
  });
  return { promise, resolve: resolvePromise };
}

async function waitForRequest(gate) {
  let timeout;
  try {
    await Promise.race([
      gate.received.promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('预期的受控 API 请求未到达')), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function fixtures() {
  const project = {
    id: 'review-project',
    name: 'PR36 浏览器回归',
    description: '隔离测试数据',
    accessRole: 'OWNER',
    ownerId: 'review-owner',
    status: 'ACTIVE',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    createdAt: fixedDate,
    updatedAt: fixedDate,
  };
  const requirement = {
    id: 'requirement-a',
    projectId: project.id,
    creatorId: project.ownerId,
    number: 'REQ-001',
    title: '需求 A',
    description: '原需求描述',
    acceptanceCriteria: '能够保留草稿并正确导航',
    priority: 'MEDIUM',
    status: 'DRAFT',
    tasks: [],
    createdAt: fixedDate,
    updatedAt: fixedDate,
  };
  const task = (id, title) => ({
    id,
    title,
    projectId: project.id,
    createdById: project.ownerId,
    assigneeId: project.ownerId,
    description: `${title}描述`,
    status: 'TODO',
    priority: 'MEDIUM',
    requirementId: requirement.id,
    dueDate: '2026-11-15',
    estimatedHours: 2,
    tagNames: ['回归'],
    completedAt: null,
    completionNote: null,
    rejectionReason: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  });
  return {
    project,
    requirements: [requirement],
    tasks: [task('task-a', '任务 A'), task('task-b', '任务 B')],
    members: [
      {
        id: 'member-owner',
        userId: project.ownerId,
        username: 'review-owner',
        nickname: '回归负责人',
        role: 'OWNER',
        avatarUrl: null,
        joinedAt: fixedDate,
      },
    ],
  };
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = resolve(renderer, `.${pathname === '/' ? '/index.html' : pathname}`);
    const localPath = relative(renderer, file);
    if (localPath === '..' || localPath.startsWith(`..${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
    };
    response.writeHead(200, {
      'content-type': `${mime[extname(file)] ?? 'application/octet-stream'}; charset=utf-8`,
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});

await readFile(join(renderer, 'index.html'));
await mkdir(output, { recursive: true });
await new Promise((resolveListening, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListening);
});
const origin = `http://127.0.0.1:${server.address().port}`;

async function scenario(name, run) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
  });
  const state = fixtures();
  const holds = new Map();
  const gates = [];
  const requests = [];
  const pageErrors = [];
  const unexpectedRequests = [];
  const session = {
    accessToken: randomBytes(32).toString('hex'),
    expiresAt: Date.now() + 60 * 60 * 1000,
    user: { id: state.project.ownerId, username: 'review-owner', displayName: '回归负责人' },
  };
  await context.addInitScript(
    ({ sessionValue, apiBaseUrl }) => {
      globalThis.desktopRuntime = { platform: 'browser', apiBaseUrl };
      globalThis.sessionStorage.setItem('scpc.auth.session', JSON.stringify(sessionValue));
    },
    { sessionValue: session, apiBaseUrl: `${origin}/api/v1` },
  );

  function hold(method, path) {
    const gate = { received: deferred(), released: deferred() };
    holds.set(`${method} ${path}`, gate);
    gates.push(gate);
    return gate;
  }

  await context.route(`${origin}/api/v1/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    const entry = { method, path, status: null };
    requests.push(entry);
    let data;
    let status = 200;
    let error;
    const gate = holds.get(`${method} ${path}`);
    if (gate) {
      holds.delete(`${method} ${path}`);
      gate.received.resolve();
      const result = await gate.released.promise;
      ({ status = 200, data, error } = result);
    } else if (method === 'GET' && path === '/users/me') {
      data = {
        id: state.project.ownerId,
        username: 'review-owner',
        nickname: '回归负责人',
        avatarUrl: null,
      };
    } else if (method === 'GET' && path === projectPath) {
      data = state.project;
    } else if (method === 'GET' && path === `${projectPath}/members`) {
      data = state.members;
    } else if (method === 'GET' && path === `${projectPath}/requirements`) {
      data = state.requirements;
    } else if (method === 'GET' && path.startsWith(`${projectPath}/requirements/`)) {
      data = state.requirements.find((item) => path.endsWith(`/${item.id}`));
    } else if (method === 'GET' && path === `${projectPath}/tasks`) {
      data = state.tasks;
    } else if (method === 'GET' && path.startsWith(`${projectPath}/tasks/`)) {
      data = state.tasks.find((item) => path.endsWith(`/${item.id}`));
    } else if (
      method === 'GET' &&
      (path === `${projectPath}/activity` || path === `${projectPath}/comments`)
    ) {
      data = [];
    } else if (method === 'PATCH' && path === `${projectPath}/tasks/task-b`) {
      state.tasks[1] = { ...state.tasks[1], ...request.postDataJSON() };
      data = state.tasks[1];
    } else {
      unexpectedRequests.push({ method, path });
      status = 500;
      error = { code: 'UNEXPECTED_TEST_REQUEST', message: '测试遇到未声明的请求。' };
    }
    entry.status = status;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        ...(error ? { success: false, error } : { success: true, data }),
        meta: { requestId: randomBytes(6).toString('hex'), timestamp: fixedDate },
      }),
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const screenshot = async (suffix) =>
    page.screenshot({
      path: join(output, `${name}-${suffix}.png`),
      animations: 'disabled',
      fullPage: true,
    });
  const go = (path) => page.goto(`${origin}/#${path}`);
  try {
    await run({ page, state, hold, go, screenshot, requests });
    assert.deepEqual(pageErrors, [], '页面不能出现未捕获异常');
    assert.deepEqual(unexpectedRequests, [], '不得出现测试未声明的请求');
    results.push({ name, status: 'passed', requests, pageErrors });
  } catch (error) {
    await screenshot('failure').catch(() => undefined);
    results.push({
      name,
      status: 'failed',
      error: error.message,
      requests,
      pageErrors,
      unexpectedRequests,
    });
  } finally {
    // Closing this isolated context discards its in-memory session; no storage state is exported.
    for (const gate of gates)
      gate.released.resolve({ status: 503, error: { code: 'TEST_END', message: '测试结束。' } });
    await context.close();
  }
}

try {
  browser = await chromium.launch({ executablePath: resolve(browserExe), headless: true });
  await scenario('requirement-pending-navigation', async ({ page, hold, go, screenshot }) => {
    await go(`${projectPath}/requirements`);
    const form = page.locator('.requirement-create-panel');
    const acceptance = form
      .locator('label')
      .filter({ has: page.locator('span').filter({ hasText: /^验收标准$/ }) })
      .locator('textarea');
    await form.getByLabel('需求标题', { exact: true }).fill('尚未保存的需求草稿');
    await acceptance.fill('请求失败后标题和验收标准仍然保留');
    const gate = hold('POST', `${projectPath}/requirements`);
    await form.getByRole('button', { name: '创建需求', exact: true }).click();
    await waitForRequest(gate);
    await page.getByRole('link', { name: '任务看板', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '存在未保存内容' });
    await dialog.waitFor();
    assert(page.url().endsWith('/requirements'), '请求处理中导航必须保留在需求页');
    await screenshot('guard');
    await dialog.getByRole('button', { name: '继续编辑' }).click();
    const responseDone = page.waitForResponse((response) => response.request().method() === 'POST');
    gate.released.resolve({
      status: 503,
      error: { code: 'TEST_UNAVAILABLE', message: '模拟服务暂时不可用' },
    });
    await responseDone;
    await page.getByText('模拟服务暂时不可用', { exact: true }).waitFor();
    assert.equal(
      await form.getByLabel('需求标题', { exact: true }).inputValue(),
      '尚未保存的需求草稿',
    );
    assert.equal(await acceptance.inputValue(), '请求失败后标题和验收标准仍然保留');
    assert.equal(
      await form.getByRole('button', { name: '创建需求', exact: true }).isEnabled(),
      true,
    );
    await screenshot('draft-retained');
  });

  await scenario('requirement-dirty-delete', async ({ page, state, hold, go, screenshot }) => {
    await go(`${projectPath}/requirements/requirement-a`);
    await page.getByLabel('需求标题', { exact: true }).fill('删除前尚未保存的标题');
    await page.getByRole('button', { name: '删除需求', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '删除需求' });
    await dialog.waitFor();
    const gate = hold('DELETE', `${projectPath}/requirements/requirement-a`);
    await page.evaluate(() => {
      globalThis.__reviewMaxDialogs =
        globalThis.document.querySelectorAll('[role="dialog"]').length;
      new globalThis.MutationObserver(() => {
        globalThis.__reviewMaxDialogs = Math.max(
          globalThis.__reviewMaxDialogs,
          globalThis.document.querySelectorAll('[role="dialog"]').length,
        );
      }).observe(globalThis.document.body, { childList: true, subtree: true });
    });
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await waitForRequest(gate);
    state.requirements = [];
    gate.released.resolve({ data: { deleted: true } });
    await page.getByRole('heading', { name: '需求管理', exact: true }).waitFor();
    assert(page.url().endsWith('/requirements'), '删除成功必须回到需求列表');
    assert.equal(await page.getByRole('dialog').count(), 0, '删除成功后不应遗留确认或未保存弹窗');
    assert.equal(
      await page.evaluate(() => globalThis.__reviewMaxDialogs),
      1,
      '删除过程中不能出现重叠弹窗',
    );
    await page.getByText('暂无需求', { exact: true }).waitFor();
    await screenshot('returned-to-list');
  });

  for (const shouldFail of [false, true]) {
    await scenario(
      `board-transition-${shouldFail ? 'failure' : 'success'}`,
      async ({ page, state, hold, go, screenshot, requests }) => {
        await go(`${projectPath}/board`);
        const cardA = page.locator('.task-card').filter({ hasText: '任务 A' });
        const cardB = page.locator('.task-card').filter({ hasText: '任务 B' });
        await cardA.getByRole('button', { name: '编辑任务', exact: true }).click();
        const editor = page.getByRole('dialog', { name: '编辑任务', exact: true });
        const gate = hold('PATCH', `${projectPath}/tasks/task-a/status`);
        await editor.getByRole('button', { name: '开始处理', exact: true }).click();
        await waitForRequest(gate);
        for (const name of ['关闭', '保存任务', '删除任务']) {
          assert.equal(
            await editor.getByRole('button', { name, exact: true }).isDisabled(),
            true,
            `${name}必须在状态请求期间禁用`,
          );
        }
        const fields = editor.locator('input, textarea, select');
        assert((await fields.count()) > 0, '真实任务编辑字段应存在');
        for (const field of await fields.all())
          assert.equal(await field.isDisabled(), true, '任务字段必须禁用');
        for (const button of await page.locator('.task-card__edit').all())
          assert.equal(await button.isDisabled(), true, '其他任务入口必须禁用');
        assert.equal(await editor.getByLabel('任务标题', { exact: true }).inputValue(), '任务 A');
        assert.equal(
          requests.filter((entry) => ['PATCH', 'DELETE'].includes(entry.method)).length,
          1,
          '不得出现并发任务写入',
        );
        await screenshot('locked');
        if (shouldFail) {
          gate.released.resolve({
            status: 503,
            error: { code: 'TEST_UNAVAILABLE', message: '模拟状态更新失败' },
          });
          await page.getByText('模拟状态更新失败', { exact: true }).waitFor();
          assert.equal(
            await editor.getByRole('button', { name: '关闭', exact: true }).isEnabled(),
            true,
          );
          assert.equal(await editor.getByLabel('任务标题', { exact: true }).isEnabled(), true);
          await editor.getByRole('button', { name: '关闭', exact: true }).click();
        } else {
          state.tasks[0] = { ...state.tasks[0], status: 'IN_PROGRESS' };
          gate.released.resolve({ data: state.tasks[0] });
          await page.getByText('任务已更新为“进行中”。', { exact: true }).waitFor();
          await page
            .locator('.board-column--in_progress .task-card')
            .filter({ hasText: '任务 A' })
            .waitFor();
        }
        await cardB.getByRole('button', { name: '编辑任务', exact: true }).click();
        assert.equal(await editor.getByLabel('任务标题', { exact: true }).inputValue(), '任务 B');
        await editor.getByLabel('任务标题', { exact: true }).fill('任务 B 正常保存');
        assert.equal(
          await editor.getByRole('button', { name: '保存任务', exact: true }).isEnabled(),
          true,
        );
        await editor.getByRole('button', { name: '保存任务', exact: true }).click();
        await page.getByText('任务信息已更新。', { exact: true }).waitFor();
        await page.locator('.task-card').filter({ hasText: '任务 B 正常保存' }).waitFor();
        assert.equal(state.tasks[0].title, '任务 A', '任务 B 的保存不能覆盖任务 A');
        await screenshot('unlocked');
      },
    );
  }

  await scenario('board-dirty-editor-close', async ({ page, go, screenshot, requests }) => {
    await go(`${projectPath}/board`);
    const card = page.locator('.task-card').filter({ hasText: '任务 A' });
    await card.getByRole('button', { name: '编辑任务', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '编辑任务', exact: true });
    await editor.getByLabel('任务标题', { exact: true }).fill('需要保留的任务草稿');
    await editor.getByRole('button', { name: '关闭', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true });
    await confirm.waitFor();
    await confirm.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(
      await editor.getByLabel('任务标题', { exact: true }).inputValue(),
      '需要保留的任务草稿',
    );
    await screenshot('cancel-retains-draft');
    await editor.getByRole('button', { name: '关闭', exact: true }).click();
    await confirm.getByRole('button', { name: '放弃修改', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });
    await card.getByRole('button', { name: '编辑任务', exact: true }).click();
    assert.equal(await editor.getByLabel('任务标题', { exact: true }).inputValue(), '任务 A');
    assert.equal(
      requests.filter((entry) => ['PATCH', 'DELETE'].includes(entry.method)).length,
      0,
      '放弃草稿不能触发写入',
    );
    await screenshot('confirmed-discard');
  });

  await scenario('requirement-detail-late-save', async ({ page, state, hold, go, screenshot }) => {
    state.requirements.push({
      ...state.requirements[0],
      id: 'requirement-b',
      number: 'REQ-002',
      title: '需求 B',
      acceptanceCriteria: '需求 B 的独立验收标准',
    });
    // Build real router-owned history entries so the dirty-form POP blocker is exercised.
    await go(`${projectPath}/requirements`);
    await page
      .locator('.requirement-row')
      .filter({ hasText: 'REQ-002' })
      .getByRole('link', { name: '查看与编辑', exact: true })
      .click();
    await page.getByText('REQ-002', { exact: true }).waitFor();
    await page.getByRole('link', { name: '返回需求列表', exact: true }).click();
    await page
      .locator('.requirement-row')
      .filter({ hasText: 'REQ-001' })
      .getByRole('link', { name: '查看与编辑', exact: true })
      .click();
    const detail = page.locator('.requirement-detail-grid');
    await detail.waitFor();
    await page.locator('.requirement-detail-meta').getByText('REQ-001', { exact: true }).waitFor();
    const title = detail.getByLabel('需求标题', { exact: true });
    await title.fill('需求 A 正在保存');
    assert.equal(await title.inputValue(), '需求 A 正在保存');
    const gate = hold('PATCH', `${projectPath}/requirements/requirement-a`);
    await page.getByRole('button', { name: '保存需求', exact: true }).click();
    await waitForRequest(gate);
    await page.evaluate(() => {
      globalThis.__reviewRequirementPageNode = globalThis.document.querySelector(
        'main.content > .page-stack',
      );
      globalThis.history.go(-2);
    });
    const dialog = page.getByRole('dialog', { name: '存在未保存内容', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '放弃更改', exact: true }).click();
    await page.locator('.requirement-detail-meta').getByText('REQ-002', { exact: true }).waitFor();
    assert.equal(await title.inputValue(), '需求 B');
    assert.equal(
      await page.evaluate(
        () =>
          globalThis.__reviewRequirementPageNode ===
          globalThis.document.querySelector('main.content > .page-stack'),
      ),
      true,
      '需求 A→B 必须复用页面 DOM，不能通过卸载重建规避旧保存响应',
    );
    const responseDone = page.waitForResponse(
      (response) => response.request().method() === 'PATCH',
    );
    gate.released.resolve({ data: { ...state.requirements[0], title: '需求 A 迟到保存结果' } });
    await responseDone;
    await page.evaluate(
      () =>
        new Promise((resolveFrame) =>
          globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolveFrame)),
        ),
    );
    assert.equal(await title.inputValue(), '需求 B');
    assert.equal(
      await page
        .locator('label')
        .filter({ has: page.locator('span').filter({ hasText: /^验收标准$/ }) })
        .locator('textarea')
        .inputValue(),
      '需求 B 的独立验收标准',
    );
    assert.equal(
      await page.getByText('需求已保存。', { exact: true }).count(),
      0,
      '需求 A 的成功提示不得污染需求 B',
    );
    assert.equal(await title.isEnabled(), true);
    await screenshot('requirement-b-retained');
  });

  await scenario('task-detail-late-response', async ({ page, state, hold, go, screenshot }) => {
    await go(`${projectPath}/board/task-a`);
    await page.getByRole('heading', { name: '任务 A', exact: true }).waitFor();
    const gate = hold('PATCH', `${projectPath}/tasks/task-a/status`);
    await page.getByRole('button', { name: '开始处理', exact: true }).click();
    await waitForRequest(gate);
    await page.evaluate((path) => {
      globalThis.__reviewTaskPageNode = globalThis.document.querySelector(
        'main.content > .page-stack',
      );
      globalThis.location.hash = path;
    }, `${projectPath}/board/task-b`);
    await page.getByRole('heading', { name: '任务 B', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          globalThis.__reviewTaskPageNode ===
          globalThis.document.querySelector('main.content > .page-stack'),
      ),
      true,
      '相邻任务路由必须复用同一个页面 DOM，不能通过刷新规避迟到响应',
    );
    const responseDone = page.waitForResponse(
      (response) => response.request().method() === 'PATCH',
    );
    gate.released.resolve({
      data: { ...state.tasks[0], title: '任务 A 迟到响应', status: 'IN_PROGRESS' },
    });
    await responseDone;
    await page.evaluate(
      () =>
        new Promise((resolveFrame) =>
          globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolveFrame)),
        ),
    );
    await page.getByRole('heading', { name: '任务 B', exact: true }).waitFor();
    assert.equal(await page.getByText('任务 A 迟到响应', { exact: true }).count(), 0);
    assert.equal(
      await page.getByText('任务已更新为“进行中”。', { exact: true }).count(),
      0,
      '旧任务的提示不能写入新任务页面',
    );
    assert.equal(
      await page.getByRole('button', { name: '开始处理', exact: true }).isEnabled(),
      true,
    );
    await screenshot('task-b-retained');
  });
} catch (error) {
  results.push({ name: 'browser-environment', status: 'failed', error: error.message });
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolveClosed) => server.close(resolveClosed));
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(
      {
        scope: '真实 Chrome + 已构建 React renderer + React Router；API 边界模拟，无真实后端验收',
        requirements: ['FR-04', 'FR-05', 'AC-03', 'AC-04', 'AC-10'],
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      output,
      passed: results.filter((result) => result.status === 'passed').length,
      failed: results.filter((result) => result.status === 'failed').length,
    }),
  );
  if (results.some((result) => result.status === 'failed')) process.exitCode = 1;
}
