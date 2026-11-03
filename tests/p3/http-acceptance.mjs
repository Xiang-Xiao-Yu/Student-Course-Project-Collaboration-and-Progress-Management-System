// FR-04/05/07; AC-03/04/08/10. Run only against the isolated acceptance API.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIREMENT_INPUT = {
  title: '验收需求',
  acceptanceCriteria: '完成明确的验收步骤',
  priority: 'MEDIUM',
};
const TASK_INPUT = { title: '验收任务', priority: 'MEDIUM' };
const TASK_EDGES = {
  BACKLOG: ['TODO'],
  TODO: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['PENDING_REVIEW', 'BLOCKED'],
  PENDING_REVIEW: ['COMPLETED'],
  COMPLETED: ['IN_PROGRESS'],
  BLOCKED: ['IN_PROGRESS'],
};

export function assertSafeErrorPayload(payload, secrets = []) {
  // response.json() has already decoded escaped newlines and nested string fields.
  const pending = [payload];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string') {
      assert(
        !/(?:[A-Za-z]:\\|\/(?:Users|home|workspace)\/|^\s+at\s+\S)/m.test(value),
        '错误响应不能泄露路径或堆栈',
      );
      for (const secret of secrets) assert(!value.includes(secret), '错误响应不能泄露会话凭据');
    } else if (value !== null && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) pending.push(key, nested);
    }
  }
}

export function getNewActivityLogs(logsBefore, logsAfter) {
  const beforeIds = new Set(logsBefore.map((entry) => entry.id));
  const afterIds = new Set(logsAfter.map((entry) => entry.id));
  assert.equal(afterIds.size, logsAfter.length, 'ActivityLog 不得出现重复 ID');
  for (const id of beforeIds) assert(afterIds.has(id), '成功写入不得删除历史 ActivityLog');
  return logsAfter.filter((entry) => !beforeIds.has(entry.id));
}

export async function main(apiBaseUrl, outputDirectory) {
  assert(
    apiBaseUrl && outputDirectory,
    'Usage: node tests/p3/http-acceptance.mjs apiBaseUrl outputDirectory',
  );
  const baseUrl = new URL(apiBaseUrl);
  assert(['http:', 'https:'].includes(baseUrl.protocol), 'API address must use HTTP or HTTPS');
  assert(!baseUrl.username && !baseUrl.password, 'API URL must not contain credentials');
  const base = baseUrl.href.replace(/\/$/, '');
  const runId = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const results = [];
  const secrets = new Set();
  const actors = {};
  let currentCase;
  let project;
  let foreignProject;
  let foreignRequirement;
  let aborted = false;

  function safeError(error) {
    let message = error instanceof Error ? error.message : '验收步骤出现未知错误';
    for (const secret of secrets) message = message.split(secret).join('[redacted]');
    return message;
  }
  function match(actual, expected, label) {
    for (const [key, value] of Object.entries(expected)) {
      assert.deepEqual(actual?.[key], value, `${label}: ${key}`);
    }
  }
  async function test(name, execute) {
    const entry = {
      id: `HTTP-${String(results.length + 1).padStart(3, '0')}`,
      name,
      status: 'running',
      requests: [],
      checks: [],
    };
    results.push(entry);
    currentCase = entry;
    try {
      const value = await execute();
      entry.status = 'passed';
      return value;
    } catch (error) {
      entry.status = 'failed';
      entry.error = safeError(error);
      return undefined;
    } finally {
      currentCase = null;
    }
  }
  async function send(actor, method, path, body) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json();
    const requestEvidence = {
      method,
      path,
      actor: actor?.role ?? 'anonymous',
      status: response.status,
    };
    currentCase?.requests.push(requestEvidence);
    assert.equal(typeof payload.success, 'boolean', '统一响应必须包含 success');
    assert.equal(typeof payload.meta?.requestId, 'string', '响应必须包含 requestId');
    assert(Number.isFinite(Date.parse(payload.meta?.timestamp)), '响应必须包含有效时间');
    if (!payload.success) {
      assert.equal(typeof payload.error?.message, 'string', '失败响应必须包含明确提示');
      assert(payload.error.message.length > 0, '错误提示不能留空');
      assertSafeErrorPayload(payload, secrets);
    }
    if (payload.error?.code) requestEvidence.errorCode = payload.error.code;
    requestEvidence.requestId = payload.meta.requestId;
    return { status: response.status, payload };
  }
  function expectResponse(response, status, code) {
    assert.equal(
      response.status,
      status,
      `HTTP 状态应为 ${status}，实际 ${response.status} (${response.payload.error?.code ?? 'success'})`,
    );
    assert.equal(response.payload.success, status < 400, 'success 必须匹配 HTTP 状态');
    if (code) assert.equal(response.payload.error?.code, code, '错误码不匹配');
    return response.payload.data;
  }
  async function request(actor, method, path, body, status = 200, code) {
    return expectResponse(await send(actor, method, path, body), status, code);
  }
  const pathFor = (item = project) => `/projects/${item.id}`;
  async function activity(item = project) {
    const items = [];
    let cursor;
    for (let page = 0; page < 100; page += 1) {
      const next = await request(
        actors.owner,
        'GET',
        `${pathFor(item)}/activity?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      assert(Array.isArray(next), 'ActivityLog 必须返回数组');
      items.push(...next);
      if (next.length < 100) return items;
      assert.notEqual(next.at(-1).id, cursor, 'ActivityLog 分页游标必须前进');
      cursor = next.at(-1).id;
    }
    throw new Error('ActivityLog 分页未结束');
  }
  async function snapshot() {
    const requirements = await request(actors.owner, 'GET', `${pathFor()}/requirements`);
    const tasks = await request(actors.owner, 'GET', `${pathFor()}/tasks`);
    return {
      requirements: requirements
        .map((item) => ({
          ...item,
          tasks: [...item.tasks].sort((a, b) => a.id.localeCompare(b.id)),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      tasks: tasks.sort((a, b) => a.id.localeCompare(b.id)),
      activity: await activity(),
    };
  }
  async function reject(name, actor, method, path, body, status, code) {
    return test(name, async () => {
      const before = await snapshot();
      const response = await send(actor, method, path, body);
      const after = await snapshot();
      currentCase.checks.push({
        invariant: '拒绝写入前后业务数据与 ActivityLog 不变',
        requirementsUnchanged:
          JSON.stringify(before.requirements) === JSON.stringify(after.requirements),
        tasksUnchanged: JSON.stringify(before.tasks) === JSON.stringify(after.tasks),
        activityUnchanged: JSON.stringify(before.activity) === JSON.stringify(after.activity),
      });
      expectResponse(response, status, code);
      assert.deepEqual(after, before, '失败操作不能改变数据或 ActivityLog');
    });
  }
  async function audited(
    actor,
    method,
    path,
    input,
    { action, type, targetId, before, after, status = 200 },
  ) {
    const logsBefore = await activity();
    const started = Date.now();
    const data = await request(actor, method, path, input, status);
    const newLogs = getNewActivityLogs(logsBefore, await activity());
    assert.equal(newLogs.length, 1, '每次成功业务写入必须新增一条 ActivityLog');
    const log = newLogs[0];
    match(log, { action, targetType: type, targetId: targetId ?? data.id }, '审计标识');
    assert.equal(log.actor?.id, actor.id, '审计操作者必须匹配请求账号');
    const recorded = Date.parse(log.createdAt);
    assert(
      Number.isFinite(recorded) && recorded >= started - 2000 && recorded <= Date.now() + 2000,
      '审计时间必须属于本次操作',
    );
    if (before === null) assert.equal(log.beforeValue, null, '创建日志 beforeValue 应为空');
    else match(log.beforeValue, before, '审计 beforeValue');
    if (after === null) assert.equal(log.afterValue, null, '删除日志 afterValue 应为空');
    else match(log.afterValue, after, '审计 afterValue');
    currentCase.checks.push({
      invariant: '成功日志可追溯',
      logId: log.id,
      action,
      actorRole: actor.role,
      actorId: log.actor.id,
      targetType: type,
      targetId: log.targetId,
      createdAt: log.createdAt,
      beforeValue: log.beforeValue,
      afterValue: log.afterValue,
    });
    return data;
  }
  async function createRequirement(title, actor = actors.owner) {
    return audited(
      actor,
      'POST',
      `${pathFor()}/requirements`,
      { ...REQUIREMENT_INPUT, title },
      {
        action: 'REQUIREMENT_CREATED',
        type: 'REQUIREMENT',
        before: null,
        after: {
          title,
          status: 'DRAFT',
          creatorId: actor.id,
          projectId: project.id,
          acceptanceCriteria: REQUIREMENT_INPUT.acceptanceCriteria,
        },
        status: 201,
      },
    );
  }
  async function createTask(title, extra = {}, actor = actors.owner) {
    return audited(
      actor,
      'POST',
      `${pathFor()}/tasks`,
      { ...TASK_INPUT, title, ...extra },
      {
        action: 'TASK_CREATED',
        type: 'TASK',
        before: null,
        after: { title, status: 'BACKLOG', createdById: actor.id, projectId: project.id },
        status: 201,
      },
    );
  }
  const taskPath = (task) => `${pathFor()}/tasks/${task.id}`;
  const requirementPath = (requirement) => `${pathFor()}/requirements/${requirement.id}`;

  try {
    const setup = await test('fixture-setup: 五类独立账号、两个隔离项目与真实登录', async () => {
      for (const role of ['owner', 'member', 'member2', 'observer', 'outsider']) {
        const password = randomBytes(32).toString('hex');
        secrets.add(password);
        const username = `p3-${role}-${runId}`;
        const user = await request(
          null,
          'POST',
          '/auth/register',
          { username, password, nickname: `验收-${role}` },
          201,
        );
        const session = await request(null, 'POST', '/auth/login', { username, password });
        assert.equal(typeof session.accessToken, 'string', '登录必须返回访问令牌');
        assert(session.accessToken.length > 0, '登录访问令牌不能为空');
        secrets.add(session.accessToken);
        actors[role] = { id: user.id, username, token: session.accessToken, role };
      }
      project = await request(
        actors.owner,
        'POST',
        '/projects',
        { name: `P3 HTTP ${runId}`, startDate: '2026-11-03', endDate: '2026-12-31' },
        201,
      );
      match(project, { status: 'PLANNING', ownerId: actors.owner.id }, '新项目');
      for (const role of ['member', 'member2', 'observer']) {
        await request(
          actors.owner,
          'POST',
          `${pathFor()}/members`,
          { username: actors[role].username, role: role === 'observer' ? 'OBSERVER' : 'MEMBER' },
          201,
        );
      }
      await request(actors.owner, 'PATCH', `${pathFor()}/status`, { status: 'ACTIVE' });
      foreignProject = await request(
        actors.outsider,
        'POST',
        '/projects',
        { name: `P3 外部 ${runId}` },
        201,
      );
      foreignRequirement = await request(
        actors.outsider,
        'POST',
        `${pathFor(foreignProject)}/requirements`,
        REQUIREMENT_INPUT,
        201,
      );
      return true;
    });
    if (!setup) throw new Error('独立夹具建立失败，后续 P3 测试未执行');

    await test('empty-project: 需求与任务列表为空', async () => {
      assert.deepEqual(await request(actors.member, 'GET', `${pathFor()}/requirements`), []);
      assert.deepEqual(await request(actors.observer, 'GET', `${pathFor()}/tasks`), []);
    });
    const requirement = await test('requirement-create: 默认草稿、编号与创建审计', async () => {
      const value = await createRequirement('P3 主需求');
      match(
        value,
        { number: 'REQ-001', status: 'DRAFT', creatorId: actors.owner.id, priority: 'MEDIUM' },
        '新需求',
      );
      return value;
    });
    const shortRequirement = await test('requirement-title-1: 单字符标题可创建', () =>
      createRequirement('需'));
    const longRequirement = await test('requirement-title-100: 100 字标题可创建', () =>
      createRequirement('需'.repeat(100)));
    if (!requirement || !shortRequirement || !longRequirement)
      throw new Error('基础需求创建失败，后续依赖场景未执行');
    for (const [label, patch] of [
      ['title-101', { title: '需'.repeat(101) }],
      ['title-empty', { title: '' }],
      ['title-whitespace', { title: '   ' }],
      ['acceptance-empty', { acceptanceCriteria: '' }],
      ['acceptance-whitespace', { acceptanceCriteria: '  ' }],
      ['priority-invalid', { priority: 'URGENT' }],
    ])
      await reject(
        `requirement-invalid-${label}`,
        actors.owner,
        'POST',
        `${pathFor()}/requirements`,
        { ...REQUIREMENT_INPUT, ...patch },
        400,
        'VALIDATION_FAILED',
      );
    await reject(
      'requirement-invalid-state-jump: 草稿不能直接完成',
      actors.owner,
      'PATCH',
      requirementPath(requirement),
      { status: 'COMPLETED' },
      422,
      'REQUIREMENT_STATUS_TRANSITION_INVALID',
    );
    await reject(
      'requirement-update-empty-acceptance',
      actors.owner,
      'PATCH',
      requirementPath(requirement),
      { acceptanceCriteria: '' },
      400,
      'VALIDATION_FAILED',
    );
    await test('requirement-edit: 成员可编辑需求且审计保存前后值', async () => {
      const data = await audited(
        actors.member,
        'PATCH',
        requirementPath(requirement),
        {
          title: 'P3 已编辑需求',
          description: 'HTTP 验收修改',
          priority: 'HIGH',
          acceptanceCriteria: '关联任务全部可追溯',
        },
        {
          action: 'REQUIREMENT_UPDATED',
          type: 'REQUIREMENT',
          targetId: requirement.id,
          before: { title: 'P3 主需求', priority: 'MEDIUM' },
          after: {
            title: 'P3 已编辑需求',
            priority: 'HIGH',
            acceptanceCriteria: '关联任务全部可追溯',
          },
        },
      );
      match(
        await request(actors.owner, 'GET', requirementPath(requirement)),
        { title: 'P3 已编辑需求', priority: 'HIGH' },
        '需求持久化',
      );
      return data;
    });
    for (const [from, to] of [
      ['DRAFT', 'CONFIRMED'],
      ['CONFIRMED', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'PENDING_ACCEPTANCE'],
      ['PENDING_ACCEPTANCE', 'COMPLETED'],
    ]) {
      await test(`requirement-state-${from}-to-${to}`, () =>
        audited(
          actors.owner,
          'PATCH',
          requirementPath(requirement),
          { status: to },
          {
            action: 'REQUIREMENT_STATUS_CHANGED',
            type: 'REQUIREMENT',
            targetId: requirement.id,
            before: { status: from },
            after: { status: to },
          },
        ));
    }
    await reject(
      'requirement-terminal-state: 已完成不得回草稿',
      actors.owner,
      'PATCH',
      requirementPath(requirement),
      { status: 'DRAFT' },
      422,
      'REQUIREMENT_STATUS_TRANSITION_INVALID',
    );
    for (const [from, to] of [
      ['DRAFT', 'CONFIRMED'],
      ['CONFIRMED', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'PENDING_ACCEPTANCE'],
      ['PENDING_ACCEPTANCE', 'REJECTED'],
    ]) {
      await test(`requirement-rejection-${from}-to-${to}`, () =>
        audited(
          actors.owner,
          'PATCH',
          requirementPath(shortRequirement),
          { status: to },
          {
            action: 'REQUIREMENT_STATUS_CHANGED',
            type: 'REQUIREMENT',
            targetId: shortRequirement.id,
            before: { status: from },
            after: { status: to },
          },
        ));
    }
    await test('requirement-delete: 删除审计与后续404', async () => {
      assert.deepEqual(
        await audited(actors.owner, 'DELETE', requirementPath(longRequirement), undefined, {
          action: 'REQUIREMENT_DELETED',
          type: 'REQUIREMENT',
          targetId: longRequirement.id,
          before: { title: '需'.repeat(100) },
          after: null,
        }),
        { deleted: true },
      );
      await request(
        actors.owner,
        'GET',
        requirementPath(longRequirement),
        undefined,
        404,
        'REQUIREMENT_NOT_FOUND',
      );
    });

    const unassigned = await test('task-create-unassigned: 允许无负责人且默认待规划', async () => {
      const task = await createTask('无负责人任务');
      match(
        task,
        { assigneeId: null, requirementId: null, status: 'BACKLOG', completedAt: null },
        '无负责人任务',
      );
      return task;
    });
    const memberTask = await test('task-create-linked: 项目开始日当天截止且完整字段', async () => {
      const task = await createTask(
        '成员任务',
        {
          assigneeId: actors.member.id,
          requirementId: requirement.id,
          dueDate: '2026-11-03',
          estimatedHours: 2.5,
          tagNames: ['验收', '边界'],
        },
        actors.member,
      );
      match(
        task,
        {
          assigneeId: actors.member.id,
          requirementId: requirement.id,
          dueDate: '2026-11-03T00:00:00.000Z',
          estimatedHours: 2.5,
          tagNames: ['边界', '验收'],
        },
        '任务字段',
      );
      return task;
    });
    const otherTask = await test('task-create-other: 第二成员的任务', () =>
      createTask('他人任务', { assigneeId: actors.member2.id, requirementId: requirement.id }));
    const longTask = await test('task-title-100: 100字边界', () => createTask('任'.repeat(100)));
    await test('task-title-1: 单字符边界', () => createTask('任'));
    if (!unassigned || !memberTask || !otherTask || !longTask)
      throw new Error('基础任务创建失败，状态机和权限依赖场景未执行');
    for (const [label, patch, status, code] of [
      ['title-101', { title: '任'.repeat(101) }, 400, 'VALIDATION_FAILED'],
      ['title-empty', { title: '' }, 400, 'VALIDATION_FAILED'],
      ['due-date-earlier', { dueDate: '2026-11-02' }, 422, 'TASK_DUE_DATE_INVALID'],
      ['due-date-invalid', { dueDate: '2026-02-30' }, 400, 'VALIDATION_FAILED'],
      ['nonmember-assignee', { assigneeId: actors.outsider.id }, 422, 'TASK_ASSIGNEE_INVALID'],
      [
        'foreign-requirement',
        { requirementId: foreignRequirement.id },
        422,
        'TASK_REQUIREMENT_INVALID',
      ],
      ['negative-hours', { estimatedHours: -1 }, 400, 'VALIDATION_FAILED'],
    ])
      await reject(
        `task-create-invalid-${label}`,
        actors.owner,
        'POST',
        `${pathFor()}/tasks`,
        { ...TASK_INPUT, ...patch },
        status,
        code,
      );
    for (const [label, patch, status, code] of [
      ['due-date-earlier', { dueDate: '2026-11-02' }, 422, 'TASK_DUE_DATE_INVALID'],
      ['nonmember-assignee', { assigneeId: actors.outsider.id }, 422, 'TASK_ASSIGNEE_INVALID'],
      [
        'foreign-requirement',
        { requirementId: foreignRequirement.id },
        422,
        'TASK_REQUIREMENT_INVALID',
      ],
      ['title-101', { title: '任'.repeat(101) }, 400, 'VALIDATION_FAILED'],
    ])
      await reject(
        `task-update-invalid-${label}`,
        actors.owner,
        'PATCH',
        taskPath(memberTask),
        patch,
        status,
        code,
      );
    await test('task-edit-own: 本人字段、优先级、工时与标签可编辑', async () => {
      const task = await audited(
        actors.member,
        'PATCH',
        taskPath(memberTask),
        {
          title: '成员已编辑任务',
          description: '本人修改',
          priority: 'HIGH',
          estimatedHours: 0,
          tagNames: ['alpha', 'beta', 'alpha'],
        },
        {
          action: 'TASK_UPDATED',
          type: 'TASK',
          targetId: memberTask.id,
          before: { title: '成员任务', priority: 'MEDIUM', estimatedHours: 2.5 },
          after: {
            title: '成员已编辑任务',
            priority: 'HIGH',
            estimatedHours: 0,
            tagNames: ['alpha', 'beta'],
          },
        },
      );
      match(task, { title: '成员已编辑任务', tagNames: ['alpha', 'beta'] }, '任务编辑响应');
    });
    await reject(
      'member-other-fields-denied',
      actors.member,
      'PATCH',
      taskPath(otherTask),
      { title: '越权标题' },
      403,
      'PROJECT_PERMISSION_DENIED',
    );
    await reject(
      'member-other-reassignment-mixed-fields-denied',
      actors.member,
      'PATCH',
      taskPath(otherTask),
      { assigneeId: actors.member.id, title: '越权混合更新' },
      403,
      'PROJECT_PERMISSION_DENIED',
    );
    await test('member-other-reassignment-only-allowed', () =>
      audited(
        actors.member,
        'PATCH',
        taskPath(otherTask),
        { assigneeId: actors.owner.id },
        {
          action: 'TASK_UPDATED',
          type: 'TASK',
          targetId: otherTask.id,
          before: { assigneeId: actors.member2.id, title: '他人任务' },
          after: { assigneeId: actors.owner.id, title: '他人任务' },
        },
      ));
    await reject(
      'member-task-delete-denied',
      actors.member,
      'DELETE',
      taskPath(memberTask),
      undefined,
      403,
      'PROJECT_PERMISSION_DENIED',
    );
    await reject(
      'member-requirement-delete-denied',
      actors.member,
      'DELETE',
      requirementPath(requirement),
      undefined,
      403,
      'PROJECT_PERMISSION_DENIED',
    );
    await test('requirement-linked-task-details: 多任务摘要与进度状态', async () => {
      const linked = await request(actors.member, 'GET', requirementPath(requirement));
      assert.deepEqual(
        linked.tasks.map((item) => item.id).sort(),
        [memberTask.id, otherTask.id].sort(),
      );
      match(
        linked.tasks.find((item) => item.id === memberTask.id),
        { title: '成员已编辑任务', assigneeId: actors.member.id, status: 'BACKLOG' },
        '关联任务摘要',
      );
    });
    for (const [label, method, path, body] of [
      ['requirement-create', 'POST', `${pathFor()}/requirements`, REQUIREMENT_INPUT],
      ['requirement-update', 'PATCH', requirementPath(requirement), { title: '观察者修改' }],
      ['requirement-delete', 'DELETE', requirementPath(requirement), undefined],
      ['task-create', 'POST', `${pathFor()}/tasks`, TASK_INPUT],
      ['task-update', 'PATCH', taskPath(memberTask), { title: '观察者修改' }],
      ['task-status', 'PATCH', `${taskPath(memberTask)}/status`, { status: 'TODO' }],
      ['task-delete', 'DELETE', taskPath(memberTask), undefined],
    ])
      await reject(
        `observer-${label}-denied`,
        actors.observer,
        method,
        path,
        body,
        403,
        'PROJECT_PERMISSION_DENIED',
      );
    for (const [label, method, path, body] of [
      ['requirements-list', 'GET', `${pathFor()}/requirements`],
      ['requirement-detail', 'GET', requirementPath(requirement)],
      ['tasks-list', 'GET', `${pathFor()}/tasks`],
      ['task-detail', 'GET', taskPath(memberTask)],
      ['requirement-create', 'POST', `${pathFor()}/requirements`, REQUIREMENT_INPUT],
      ['requirement-update', 'PATCH', requirementPath(requirement), { title: '外部修改' }],
      ['task-create', 'POST', `${pathFor()}/tasks`, TASK_INPUT],
      ['task-update', 'PATCH', taskPath(memberTask), { title: '外部修改' }],
      ['task-status', 'PATCH', `${taskPath(memberTask)}/status`, { status: 'TODO' }],
      ['task-delete', 'DELETE', taskPath(memberTask)],
      ['requirement-delete', 'DELETE', requirementPath(requirement)],
      ['activity', 'GET', `${pathFor()}/activity`],
      ['comments', 'GET', `${pathFor()}/comments?targetType=TASK&targetId=${memberTask.id}`],
    ])
      await reject(
        `outsider-${label}-404`,
        actors.outsider,
        method,
        path,
        body,
        404,
        'PROJECT_NOT_FOUND',
      );
    await reject(
      'anonymous-protected-access',
      null,
      'GET',
      `${pathFor()}/tasks`,
      undefined,
      401,
      'AUTH_SESSION_EXPIRED',
    );
    await reject(
      'missing-task-detail',
      actors.owner,
      'GET',
      `${pathFor()}/tasks/not-found`,
      undefined,
      404,
      'TASK_NOT_FOUND',
    );
    await reject(
      'missing-requirement-detail',
      actors.owner,
      'GET',
      `${pathFor()}/requirements/not-found`,
      undefined,
      404,
      'REQUIREMENT_NOT_FOUND',
    );

    const checkedStates = new Set();
    async function checkState(source) {
      if (checkedStates.has(source)) return;
      checkedStates.add(source);
      for (const target of Object.keys(TASK_EDGES)) {
        if (target === source || TASK_EDGES[source].includes(target)) continue;
        await reject(
          `task-illegal-${source}-to-${target}`,
          actors.owner,
          'PATCH',
          `${taskPath(memberTask)}/status`,
          { status: target },
          422,
          'TASK_STATUS_TRANSITION_INVALID',
        );
      }
      await test(`task-retry-${source}: 同状态重试不新增日志或改数据`, async () => {
        const before = await snapshot();
        await request(actors.owner, 'PATCH', `${taskPath(memberTask)}/status`, { status: source });
        assert.deepEqual(await snapshot(), before);
      });
    }
    async function transition(from, to, actor = actors.member, extra = {}) {
      await checkState(from);
      return test(`task-legal-${from}-to-${to}${extra.reopenReason ? '-with-reason' : ''}`, async () => {
        const task = await audited(
          actor,
          'PATCH',
          `${taskPath(memberTask)}/status`,
          { status: to, ...extra },
          {
            action: 'TASK_STATUS_CHANGED',
            type: 'TASK',
            targetId: memberTask.id,
            before: { status: from },
            after: {
              status: to,
              ...(extra.reopenReason
                ? { completedAt: null, reopenReason: extra.reopenReason }
                : {}),
            },
          },
        );
        assert.equal(task.status, to);
        if (to === 'COMPLETED')
          assert(Number.isFinite(Date.parse(task.completedAt)), '完成任务应保存完成时间');
        if (from === 'COMPLETED') assert.equal(task.completedAt, null, '重开任务必须清空完成时间');
        return task;
      });
    }
    await transition('BACKLOG', 'TODO');
    await transition('TODO', 'BLOCKED');
    await transition('BLOCKED', 'IN_PROGRESS');
    await transition('IN_PROGRESS', 'BLOCKED');
    await transition('BLOCKED', 'IN_PROGRESS');
    await reject(
      'task-empty-completion-note',
      actors.member,
      'PATCH',
      `${taskPath(memberTask)}/status`,
      { status: 'PENDING_REVIEW', completionNote: '   ' },
      422,
      'TASK_COMPLETION_NOTE_REQUIRED',
    );
    await reject(
      'task-missing-completion-note',
      actors.member,
      'PATCH',
      `${taskPath(memberTask)}/status`,
      { status: 'PENDING_REVIEW' },
      422,
      'TASK_COMPLETION_NOTE_REQUIRED',
    );
    await transition('IN_PROGRESS', 'PENDING_REVIEW', actors.member, {
      completionNote: '完成实现并提供验证结果',
    });
    await checkState('PENDING_REVIEW');
    await reject(
      'member-cannot-approve',
      actors.member,
      'PATCH',
      `${taskPath(memberTask)}/status`,
      { status: 'COMPLETED' },
      403,
      'PROJECT_PERMISSION_DENIED',
    );
    await reject(
      'member-cannot-reject-review',
      actors.member,
      'PATCH',
      `${taskPath(memberTask)}/status`,
      { status: 'PENDING_REVIEW', rejectionReason: '不得自行审核' },
      403,
      'PROJECT_PERMISSION_DENIED',
    );
    await reject(
      'owner-empty-rejection-reason',
      actors.owner,
      'PATCH',
      `${taskPath(memberTask)}/status`,
      { status: 'PENDING_REVIEW', rejectionReason: '   ' },
      422,
      'VALIDATION_FAILED',
    );
    await reject(
      'other-member-cannot-edit-completion-note',
      actors.member2,
      'PATCH',
      `${taskPath(memberTask)}/status`,
      { status: 'PENDING_REVIEW', completionNote: '越权替换说明' },
      403,
      'PROJECT_PERMISSION_DENIED',
    );
    await test('review-rejected: 保持待审核且原因在详情和列表持久展示', async () => {
      const task = await audited(
        actors.owner,
        'PATCH',
        `${taskPath(memberTask)}/status`,
        { status: 'PENDING_REVIEW', rejectionReason: '缺少边界测试' },
        {
          action: 'TASK_REVIEW_REJECTED',
          type: 'TASK',
          targetId: memberTask.id,
          before: { status: 'PENDING_REVIEW' },
          after: { status: 'PENDING_REVIEW', rejectionReason: '缺少边界测试' },
        },
      );
      match(
        task,
        { status: 'PENDING_REVIEW', rejectionReason: '缺少边界测试', completedAt: null },
        '驳回响应',
      );
      match(
        await request(actors.member, 'GET', taskPath(memberTask)),
        { status: 'PENDING_REVIEW', rejectionReason: '缺少边界测试' },
        '驳回详情',
      );
      const list = await request(actors.member, 'GET', `${pathFor()}/tasks`);
      assert.equal(list.find((item) => item.id === memberTask.id).rejectionReason, '缺少边界测试');
    });
    await test('review-resubmitted: 新完成说明清除驳回原因并留审计', async () => {
      const task = await audited(
        actors.member,
        'PATCH',
        `${taskPath(memberTask)}/status`,
        { status: 'PENDING_REVIEW', completionNote: '已补充边界测试并重新提交' },
        {
          action: 'TASK_REVIEW_RESUBMITTED',
          type: 'TASK',
          targetId: memberTask.id,
          before: { completionNote: '完成实现并提供验证结果', status: 'PENDING_REVIEW' },
          after: { completionNote: '已补充边界测试并重新提交', status: 'PENDING_REVIEW' },
        },
      );
      match(task, { status: 'PENDING_REVIEW', rejectionReason: null }, '重提响应');
      assert.equal(
        (await request(actors.owner, 'GET', taskPath(memberTask))).rejectionReason,
        null,
      );
    });
    await transition('PENDING_REVIEW', 'COMPLETED', actors.owner);
    await checkState('COMPLETED');
    await test('completed-linked-summary: 需求详情同步已完成任务', async () => {
      const value = await request(actors.owner, 'GET', requirementPath(requirement));
      assert.equal(value.tasks.find((item) => item.id === memberTask.id).status, 'COMPLETED');
    });
    await reject(
      'reopen-missing-reason',
      actors.owner,
      'PATCH',
      `${taskPath(memberTask)}/status`,
      { status: 'IN_PROGRESS' },
      422,
      'TASK_REOPEN_REASON_REQUIRED',
    );
    await reject(
      'reopen-whitespace-reason',
      actors.owner,
      'PATCH',
      `${taskPath(memberTask)}/status`,
      { status: 'IN_PROGRESS', reopenReason: '  ' },
      422,
      'TASK_REOPEN_REASON_REQUIRED',
    );
    await transition('COMPLETED', 'IN_PROGRESS', actors.owner, {
      reopenReason: '补充验收后发现的问题',
    });
    await test('task-legal-TODO-to-IN_PROGRESS: 补齐另一合法分支', async () => {
      await audited(
        actors.owner,
        'PATCH',
        `${taskPath(unassigned)}/status`,
        { status: 'TODO' },
        {
          action: 'TASK_STATUS_CHANGED',
          type: 'TASK',
          targetId: unassigned.id,
          before: { status: 'BACKLOG' },
          after: { status: 'TODO' },
        },
      );
      await audited(
        actors.owner,
        'PATCH',
        `${taskPath(unassigned)}/status`,
        { status: 'IN_PROGRESS' },
        {
          action: 'TASK_STATUS_CHANGED',
          type: 'TASK',
          targetId: unassigned.id,
          before: { status: 'TODO' },
          after: { status: 'IN_PROGRESS' },
        },
      );
    });
    await test('task-delete: 删除记录保留且业务对象404', async () => {
      assert.deepEqual(
        await audited(actors.owner, 'DELETE', taskPath(longTask), undefined, {
          action: 'TASK_DELETED',
          type: 'TASK',
          targetId: longTask.id,
          before: { title: '任'.repeat(100) },
          after: null,
        }),
        { deleted: true },
      );
      await request(actors.owner, 'GET', taskPath(longTask), undefined, 404, 'TASK_NOT_FOUND');
    });

    for (const actor of [actors.member, actors.observer]) {
      await test(`${actor.role}-comments-and-activity-read`, async () => {
        assert.deepEqual(
          await request(
            actor,
            'GET',
            `${pathFor()}/comments?targetType=TASK&targetId=${memberTask.id}`,
          ),
          [],
        );
        assert.deepEqual(
          await request(
            actor,
            'GET',
            `${pathFor()}/comments?targetType=REQUIREMENT&targetId=${requirement.id}`,
          ),
          [],
        );
        const logs = await request(
          actor,
          'GET',
          `${pathFor()}/activity?targetType=TASK&targetId=${memberTask.id}&limit=100`,
        );
        assert(logs.length > 0, '任务日志应存在');
        assert(
          logs.every((log) => log.targetId === memberTask.id && log.targetType === 'TASK'),
          '目标筛选不应混入其他对象',
        );
      });
    }
    await reject(
      'comments-missing-target',
      actors.owner,
      'GET',
      `${pathFor()}/comments?targetType=TASK&targetId=not-found`,
      undefined,
      404,
      'COMMENT_TARGET_NOT_FOUND',
    );
    await reject(
      'comments-cross-project-target',
      actors.owner,
      'GET',
      `${pathFor()}/comments?targetType=REQUIREMENT&targetId=${foreignRequirement.id}`,
      undefined,
      404,
      'COMMENT_TARGET_NOT_FOUND',
    );
    await test('activity-missing-or-foreign-target-empty', async () => {
      for (const targetId of ['not-found', foreignRequirement.id])
        assert.deepEqual(
          await request(
            actors.owner,
            'GET',
            `${pathFor()}/activity?targetType=REQUIREMENT&targetId=${targetId}`,
          ),
          [],
        );
    });
    await test('activity-pagination: 顺序读取无重复无遗漏', async () => {
      const all = await activity();
      const first = await request(actors.owner, 'GET', `${pathFor()}/activity?limit=2`);
      const next = await request(
        actors.owner,
        'GET',
        `${pathFor()}/activity?limit=2&cursor=${first.at(-1).id}`,
      );
      assert.deepEqual(
        [...first, ...next].map((log) => log.id),
        all.slice(0, 4).map((log) => log.id),
      );
    });
    await test('pause-project: 激活项目可暂停', async () => {
      assert.equal(
        (await request(actors.owner, 'PATCH', `${pathFor()}/status`, { status: 'PAUSED' })).status,
        'PAUSED',
      );
    });
    await reject(
      'paused-requirement-create-denied',
      actors.owner,
      'POST',
      `${pathFor()}/requirements`,
      REQUIREMENT_INPUT,
      409,
      'PROJECT_PAUSED',
    );
    await reject(
      'paused-task-create-denied',
      actors.owner,
      'POST',
      `${pathFor()}/tasks`,
      TASK_INPUT,
      409,
      'PROJECT_PAUSED',
    );
    await test('archive-project: 恢复、完成、归档', async () => {
      for (const status of ['ACTIVE', 'COMPLETED', 'ARCHIVED'])
        assert.equal(
          (await request(actors.owner, 'PATCH', `${pathFor()}/status`, { status })).status,
          status,
        );
    });
    for (const [label, method, path, body] of [
      ['requirement-create', 'POST', `${pathFor()}/requirements`, REQUIREMENT_INPUT],
      ['requirement-update', 'PATCH', requirementPath(requirement), { title: '归档修改' }],
      ['requirement-delete', 'DELETE', requirementPath(requirement)],
      ['task-create', 'POST', `${pathFor()}/tasks`, TASK_INPUT],
      ['task-update', 'PATCH', taskPath(memberTask), { title: '归档修改' }],
      ['task-status', 'PATCH', `${taskPath(memberTask)}/status`, { status: 'BLOCKED' }],
      ['task-delete', 'DELETE', taskPath(memberTask)],
    ])
      await reject(
        `archived-${label}-denied`,
        actors.owner,
        method,
        path,
        body,
        409,
        'PROJECT_ARCHIVED',
      );
    await test('archived-read: 归档后列表、详情和历史仍可读', async () => {
      await request(actors.observer, 'GET', requirementPath(requirement));
      await request(actors.observer, 'GET', taskPath(memberTask));
      assert((await activity()).length > 0);
    });
  } catch (error) {
    aborted = true;
    results.push({
      name: 'dependent-scenarios-aborted',
      status: 'failed',
      error: safeError(error),
      requests: [],
    });
  }
  const summary = {
    passed: results.filter((item) => item.status === 'passed').length,
    failed: results.filter((item) => item.status === 'failed').length,
    aborted,
  };
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const reportPath = join(output, `http-acceptance-${runId}.json`);
  const report = {
    runId,
    scope: '真实 HTTP / 实际 Nest API；独立随机账号与项目；不使用 mocked API',
    requirements: ['FR-04', 'FR-05', 'FR-07', 'AC-03', 'AC-04', 'AC-08', 'AC-10'],
    ...summary,
    results,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
  return { ...summary, reportPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2], process.argv[3])
    .then((summary) => {
      console.log(JSON.stringify(summary));
      if (summary.failed > 0 || summary.aborted) process.exitCode = 1;
    })
    .catch(() => {
      console.error('P3 HTTP 验收未能启动或保存报告；请检查参数、服务连接及输出目录权限。');
      process.exitCode = 1;
    });
}
