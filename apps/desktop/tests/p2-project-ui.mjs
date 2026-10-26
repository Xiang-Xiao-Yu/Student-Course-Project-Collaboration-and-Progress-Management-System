// Real Electron UI smoke test for T-02 P2 using an isolated contract server.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
const playwrightPackage = process.argv[3];
const electronExe = process.argv[4];
const runDirectory = join(root, 'tmp', 'ui-demo', 'p2-run-' + Date.now());
mkdirSync(runDirectory, { recursive: true });

const { _electron } = createRequire(playwrightPackage)('playwright');
const results = [];
const network = [];
let archiveRequests = 0;
let outsiderMemberListRequests = 0;

const users = {
  owner: { id: 'u-owner', nickname: '项目负责人', username: 'owner' },
  member: { id: 'u-member', nickname: '普通成员', username: 'member' },
  observer: { id: 'u-observer', nickname: '课程观察员', username: 'observer' },
  outsider: { id: 'u-outsider', nickname: '未加入用户', username: 'outsider' },
};

const tokenUsers = new Map(
  Object.entries(users).map(([username, user]) => ['token-' + username, user]),
);

const projects = new Map([
  [
    'p-shared',
    {
      access: { owner: 'OWNER', member: 'MEMBER', observer: 'OBSERVER' },
      project: projectRecord('p-shared', '软件工程课程项目', 'ACTIVE'),
    },
  ],
  [
    'p-owner-archive',
    {
      access: { owner: 'OWNER' },
      project: projectRecord('p-owner-archive', '已归档课程项目', 'ARCHIVED'),
    },
  ],
]);

const members = [
  memberRecord(users.owner, 'OWNER'),
  memberRecord(users.member, 'MEMBER'),
  memberRecord(users.observer, 'OBSERVER'),
];

function projectRecord(
  id,
  name,
  status,
  description = '用于验证 P2 项目与成员界面的隔离测试项目。',
) {
  return {
    accessRole: 'OWNER',
    createdAt: '2026-10-22T08:00:00.000Z',
    description,
    endDate: '2026-12-31T00:00:00.000Z',
    id,
    name,
    ownerId: users.owner.id,
    startDate: '2026-10-22T00:00:00.000Z',
    status,
    updatedAt: '2026-10-22T08:00:00.000Z',
  };
}

function memberRecord(user, role) {
  return {
    avatarUrl: null,
    id: 'member-' + user.id,
    joinedAt: '2026-10-22T08:00:00.000Z',
    nickname: user.nickname,
    role,
    userId: user.id,
    username: user.username,
  };
}

function envelope(data) {
  return {
    success: true,
    data,
    meta: { requestId: randomBytes(6).toString('hex'), timestamp: new Date().toISOString() },
  };
}

function errorEnvelope(code, message) {
  return {
    success: false,
    error: { code, message, details: null },
    meta: { requestId: randomBytes(6).toString('hex'), timestamp: new Date().toISOString() },
  };
}

function send(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
}

function authenticate(request) {
  const header = request.headers.authorization ?? '';
  return tokenUsers.get(header.replace(/^Bearer\s+/i, '')) ?? null;
}

function accessFor(projectId, user) {
  return projects.get(projectId)?.access[user.username] ?? null;
}

function withAccess(projectId, user) {
  const entry = projects.get(projectId);

  if (!entry) {
    return null;
  }

  const accessRole = accessFor(projectId, user);

  if (!accessRole) {
    return null;
  }

  return { ...entry.project, accessRole };
}

async function readJson(request) {
  let body = '';

  for await (const chunk of request) {
    body += chunk;
  }

  return body ? JSON.parse(body) : {};
}

function check(condition, label) {
  if (!condition) {
    throw new Error(label);
  }
}

async function capture(filename) {
  await page.bringToFront();
  await page.screenshot({ path: join(runDirectory, filename), animations: 'disabled' });
}

async function login(username) {
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill('password1');
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

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      send(response, 204, {});
      return;
    }

    const url = new URL(request.url, 'http://127.0.0.1');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method ?? 'GET';

    if (method === 'GET' && path === '/health') {
      send(response, 200, envelope({ status: 'ok' }));
      return;
    }

    if (method === 'POST' && path === '/auth/login') {
      const body = await readJson(request);
      const user = users[body.username];

      if (!user) {
        send(response, 401, errorEnvelope('AUTH_INVALID_CREDENTIALS', '用户名或密码错误。'));
        return;
      }

      send(
        response,
        200,
        envelope({
          accessToken: 'token-' + user.username,
          expiresIn: '2h',
          tokenType: 'Bearer',
          user,
        }),
      );
      return;
    }

    const user = authenticate(request);

    if (!user) {
      send(response, 401, errorEnvelope('AUTH_SESSION_EXPIRED', '登录状态已失效，请重新登录。'));
      return;
    }

    if (method === 'POST' && path === '/auth/logout') {
      send(response, 200, envelope({ loggedOut: true }));
      return;
    }

    if (method === 'GET' && path === '/users/me') {
      send(
        response,
        200,
        envelope({
          avatarUrl: null,
          createdAt: '2026-10-01T00:00:00.000Z',
          id: user.id,
          nickname: user.nickname,
          status: 'ACTIVE',
          updatedAt: '2026-10-22T00:00:00.000Z',
          username: user.username,
        }),
      );
      return;
    }

    if (method === 'GET' && path === '/projects') {
      const visible = [...projects.keys()]
        .map((projectId) => withAccess(projectId, user))
        .filter(Boolean);

      send(response, 200, envelope(visible));
      return;
    }

    if (method === 'POST' && path === '/projects') {
      const body = await readJson(request);
      const project = projectRecord(
        'p-created',
        body.name,
        'PLANNING',
        body.description || '新建项目',
      );
      project.startDate = body.startDate ? body.startDate + 'T00:00:00.000Z' : null;
      project.endDate = body.endDate ? body.endDate + 'T00:00:00.000Z' : null;
      projects.set(project.id, {
        access: { [user.username]: 'OWNER' },
        project,
      });
      send(response, 201, envelope(project));
      return;
    }

    const projectMatch = /^\/projects\/([^/]+)$/.exec(path);

    if (projectMatch && method === 'GET') {
      const project = withAccess(projectMatch[1], user);

      if (!project) {
        send(response, 404, errorEnvelope('PROJECT_NOT_FOUND', '项目不存在或你无权访问该项目。'));
        return;
      }

      send(response, 200, envelope(project));
      return;
    }

    if (projectMatch && method === 'PATCH') {
      const entry = projects.get(projectMatch[1]);
      const access = accessFor(projectMatch[1], user);

      if (!entry || !access) {
        send(response, 404, errorEnvelope('PROJECT_NOT_FOUND', '项目不存在或你无权访问该项目。'));
        return;
      }

      if (access !== 'OWNER') {
        send(response, 403, errorEnvelope('PROJECT_PERMISSION_DENIED', '没有项目操作权限。'));
        return;
      }

      const body = await readJson(request);
      Object.assign(entry.project, body);
      entry.project.startDate = body.startDate
        ? body.startDate + 'T00:00:00.000Z'
        : entry.project.startDate;
      entry.project.endDate = body.endDate
        ? body.endDate + 'T00:00:00.000Z'
        : entry.project.endDate;
      send(response, 200, envelope({ ...entry.project, accessRole: access }));
      return;
    }

    if (projectMatch && method === 'DELETE') {
      const entry = projects.get(projectMatch[1]);
      const body = await readJson(request);

      if (!entry || !accessFor(projectMatch[1], user)) {
        send(response, 404, errorEnvelope('PROJECT_NOT_FOUND', '项目不存在或你无权访问该项目。'));
        return;
      }

      if (body.confirmName !== entry.project.name) {
        send(
          response,
          422,
          errorEnvelope('PROJECT_DELETE_CONFIRMATION_MISMATCH', '项目名称确认不匹配。'),
        );
        return;
      }

      projects.delete(projectMatch[1]);
      send(response, 200, envelope({ deleted: true }));
      return;
    }

    const statusMatch = /^\/projects\/([^/]+)\/status$/.exec(path);

    if (statusMatch && method === 'PATCH') {
      const entry = projects.get(statusMatch[1]);
      const body = await readJson(request);

      if (!entry || accessFor(statusMatch[1], user) !== 'OWNER') {
        send(response, 403, errorEnvelope('PROJECT_PERMISSION_DENIED', '没有项目操作权限。'));
        return;
      }

      entry.project.status = body.status;
      send(
        response,
        200,
        envelope({ ...entry.project, accessRole: accessFor(statusMatch[1], user) }),
      );
      return;
    }

    const archiveMatch = /^\/projects\/([^/]+)\/archive$/.exec(path);

    if (archiveMatch && method === 'POST') {
      const entry = projects.get(archiveMatch[1]);

      if (!entry || accessFor(archiveMatch[1], user) !== 'OWNER') {
        send(response, 403, errorEnvelope('PROJECT_PERMISSION_DENIED', '没有项目操作权限。'));
        return;
      }

      archiveRequests++;
      entry.project.status = 'ARCHIVED';
      send(
        response,
        200,
        envelope({ ...entry.project, accessRole: accessFor(archiveMatch[1], user) }),
      );
      return;
    }

    const membersMatch = /^\/projects\/([^/]+)\/members$/.exec(path);

    if (membersMatch && method === 'GET') {
      if (!accessFor(membersMatch[1], user)) {
        if (user.username === 'outsider') outsiderMemberListRequests++;
        send(response, 404, errorEnvelope('PROJECT_NOT_FOUND', '项目不存在或你无权访问该项目。'));
        return;
      }

      send(response, 200, envelope(members));
      return;
    }

    if (membersMatch && method === 'POST') {
      const body = await readJson(request);
      const target = users[body.username];

      if (accessFor(membersMatch[1], user) !== 'OWNER') {
        send(response, 403, errorEnvelope('PROJECT_PERMISSION_DENIED', '没有成员管理权限。'));
        return;
      }

      if (!target) {
        send(response, 404, errorEnvelope('USER_NOT_FOUND', '用户不存在。'));
        return;
      }

      const member = memberRecord(target, body.role);
      members.push(member);
      send(response, 201, envelope(member));
      return;
    }

    const memberMatch = /^\/projects\/([^/]+)\/members\/([^/]+)$/.exec(path);

    if (memberMatch && method === 'PATCH') {
      const body = await readJson(request);
      const member = members.find((item) => item.userId === memberMatch[2]);

      if (accessFor(memberMatch[1], user) !== 'OWNER' || !member) {
        send(response, 403, errorEnvelope('PROJECT_PERMISSION_DENIED', '没有成员管理权限。'));
        return;
      }

      member.role = body.role;
      send(response, 200, envelope(member));
      return;
    }

    if (memberMatch && method === 'DELETE') {
      const member = members.find((item) => item.userId === memberMatch[2]);

      if (accessFor(memberMatch[1], user) !== 'OWNER' || !member) {
        send(response, 403, errorEnvelope('PROJECT_PERMISSION_DENIED', '没有成员管理权限。'));
        return;
      }

      members.splice(members.indexOf(member), 1);
      send(response, 200, envelope({ removed: true }));
      return;
    }

    send(response, 404, errorEnvelope('NOT_FOUND', '请求的接口不存在。'));
  } catch (error) {
    send(response, 500, errorEnvelope('INTERNAL_SERVER_ERROR', '测试服务暂时不可用。'));
    console.error(error);
  }
});

let electronApp;
let page;

try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  const apiBaseUrl = 'http://127.0.0.1:' + port + '/api/v1';
  const environment = { ...process.env, ELECTRON_API_BASE_URL: apiBaseUrl };
  delete environment.ELECTRON_RUN_AS_NODE;

  electronApp = await _electron.launch({
    executablePath: electronExe,
    args: [
      join(root, 'apps', 'desktop', 'out', 'main', 'index.js'),
      '--user-data-dir=' + join(runDirectory, 'electron-profile'),
    ],
    env: environment,
    timeout: 20000,
  });
  page = await electronApp.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('response', (response) => {
    if (response.url().startsWith(apiBaseUrl)) {
      network.push({
        method: response.request().method(),
        path: response.url().slice(apiBaseUrl.length),
        status: response.status(),
      });
    }
  });

  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
  await login('owner');
  await page.getByRole('link', { name: '项目设置', exact: true }).first().waitFor();
  check((await page.locator('.project-card').count()) === 2, 'Owner project count mismatch');
  await capture('owner-projects.png');

  const createForm = page.locator('.project-create-panel');
  await createForm.getByLabel('项目名称', { exact: true }).fill('P2 新建课程项目');
  await createForm.getByLabel('项目简介', { exact: true }).fill('验证创建、状态和删除确认。');
  await createForm.locator('input[type="date"]').nth(0).fill('2026-12-31');
  await createForm.locator('input[type="date"]').nth(1).fill('2026-12-01');
  await createForm.getByRole('button', { name: '创建并进入项目', exact: true }).click();
  await page.getByText('结束日期不能早于开始日期。', { exact: true }).waitFor();
  await createForm.locator('input[type="date"]').nth(1).fill('2027-01-31');
  await createForm.getByRole('button', { name: '创建并进入项目', exact: true }).click();
  await page.getByRole('heading', { name: '项目概览', exact: true }).waitFor();

  await page.getByRole('link', { name: '成员管理', exact: true }).click();
  await page.getByRole('heading', { name: '成员管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '邀请成员', exact: true }).waitFor();
  await capture('owner-members.png');

  await page.getByRole('link', { name: '项目设置', exact: true }).click();
  await page.getByRole('heading', { name: '项目设置', exact: true }).waitFor();
  await page.getByRole('button', { name: '开始项目', exact: true }).waitFor();
  await capture('owner-settings.png');
  await page.getByRole('button', { name: '开始项目', exact: true }).click();
  await page.getByRole('button', { name: '标记为已完成', exact: true }).waitFor();
  await page.getByRole('button', { name: '标记为已完成', exact: true }).click();
  const projectNameField = page.getByLabel('项目名称', { exact: true });
  await projectNameField.fill('未保存的课程项目名称');
  const archiveRequestsBeforeDraft = archiveRequests;
  await page.getByRole('button', { name: '归档项目', exact: true }).click();
  await page.getByRole('button', { name: '确认归档', exact: true }).click();
  await page.getByText('请先保存或撤销未保存的项目资料，再归档。', { exact: true }).waitFor();
  check(archiveRequests === archiveRequestsBeforeDraft, 'Dirty project form was archived');
  check(
    (await projectNameField.inputValue()) === '未保存的课程项目名称',
    'Dirty project name was lost',
  );
  await projectNameField.fill('P2 新建课程项目');
  await page.getByRole('button', { name: '保存基本信息', exact: true }).click();
  await page.getByText('项目基本信息已保存。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '归档项目', exact: true }).click();
  await page.getByRole('button', { name: '确认归档', exact: true }).click();
  await page.getByText('项目已归档，仅可查看信息或删除项目。', { exact: true }).waitFor();
  await capture('owner-archived.png');

  await page.getByRole('button', { name: '删除项目', exact: true }).click();
  const deleteDialog = page.locator('.confirm-dialog');
  await deleteDialog.getByLabel('项目名称', { exact: true }).fill('错误名称');
  await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('输入的项目名称与当前项目不一致。', { exact: true }).waitFor();
  await deleteDialog.locator('input').fill('P2 新建课程项目');
  await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('heading', { name: '项目中心', exact: true }).waitFor();

  await logout();
  await login('member');
  await page.getByRole('link', { name: '进入项目', exact: true }).click();
  await page.getByRole('heading', { name: '项目概览', exact: true }).waitFor();
  check(
    (await page.getByRole('link', { name: '项目设置', exact: true }).count()) === 0,
    'Member can see project settings navigation',
  );
  await page.getByRole('link', { name: '成员管理', exact: true }).click();
  await page.getByRole('heading', { name: '成员管理', exact: true }).waitFor();
  check(
    (await page.getByRole('button', { name: '邀请成员', exact: true }).count()) === 0,
    'Member can see invite control',
  );
  check(
    (await page.getByRole('button', { name: '移交负责人', exact: true }).count()) === 0,
    'Member can see ownership transfer control',
  );
  await capture('member-members.png');
  await page.evaluate(() => {
    globalThis.location.hash = '#/projects/p-shared/settings';
  });
  await page.getByText('当前角色只能查看项目', { exact: true }).waitFor();
  check(
    (await page.getByRole('button', { name: '删除项目', exact: true }).count()) === 0,
    'Member can see delete control',
  );
  await capture('member-readonly-settings.png');

  await logout();
  await login('observer');
  await page.getByRole('link', { name: '进入项目', exact: true }).click();
  await page.getByRole('link', { name: '成员管理', exact: true }).click();
  await page.getByRole('heading', { name: '成员管理', exact: true }).waitFor();
  check(
    (await page.getByText('成员管理操作仅对项目负责人开放。', { exact: false }).count()) === 1,
    'Observer did not receive read-only member message',
  );
  check(
    (await page.getByRole('button', { name: '邀请成员', exact: true }).count()) === 0,
    'Observer can see invite control',
  );

  await logout();
  await login('outsider');
  await page.getByText('暂无项目', { exact: true }).waitFor();
  await page.evaluate(() => {
    globalThis.location.hash = '#/projects/p-shared/members';
  });
  await page.locator('.error-state').getByText('无法访问项目', { exact: true }).waitFor();
  await page.getByText('项目不存在或你无权访问该项目。', { exact: true }).waitFor();
  check(
    outsiderMemberListRequests === 0,
    'Non-member member page mounted before project access check',
  );
  await capture('outsider-denied.png');

  results.push({ name: 'owner P2 project lifecycle and member UI', status: 'PASS' });
  results.push({ name: 'member read-only role visibility', status: 'PASS' });
  results.push({ name: 'observer read-only member visibility', status: 'PASS' });
  results.push({ name: 'non-member project access denied', status: 'PASS' });
} catch (error) {
  results.push({ name: 'HARNESS', status: 'FAIL', reason: error.message.split('\n')[0] });
  if (page) {
    console.log('Failure body: ' + (await page.locator('body').innerText()).slice(0, 800));
    await capture('failure.png').catch(() => {});
  }
} finally {
  if (electronApp) {
    await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
  await new Promise((done) => server.close(done));
  writeFileSync(
    join(runDirectory, 'results.json'),
    JSON.stringify({ cases: results, network }, null, 2),
  );
  console.log(JSON.stringify({ runDirectory, cases: results }));
  if (results.some((result) => result.status === 'FAIL')) {
    process.exitCode = 1;
  }
}
