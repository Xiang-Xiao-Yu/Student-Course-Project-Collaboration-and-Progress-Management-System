import 'reflect-metadata';

import { vi } from 'vitest';

vi.hoisted(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['APP_HOST'] = '127.0.0.1';
  process.env['APP_PORT'] = '3000';
  process.env['DATABASE_URL'] = 'file::memory:';
  process.env['JWT_SECRET'] = 'test-only-secret';
  process.env['JWT_EXPIRES_IN'] = '15m';
  process.env['CORS_ORIGINS'] = 'http://localhost:5173';
  process.env['LOG_LEVEL'] = 'error';
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';

interface RegisterEnvelope {
  data: { id: string };
}

interface LoginEnvelope {
  data: { accessToken: string };
}

interface ProjectEnvelope {
  data: { id: string };
}

interface IterationEnvelope {
  data: {
    endDate: string;
    id: string;
    name: string;
    startDate: string;
    status: string;
    taskCount: number;
    tasks: Array<{ id: string; status: string; title: string }>;
  };
}

interface IterationStatsEnvelope {
  data: {
    asOf: string;
    blocked: number;
    completed: number;
    completionRate: number;
    inProgress: number;
    overdue: number;
    total: number;
  };
}

interface CommentEnvelope {
  data: {
    author: { id: string };
    content: string;
    id: string;
    targetType: string;
  };
}

interface CommentListEnvelope {
  data: Array<{ content: string; id: string }>;
}

describe('P4 iterations and comments with SQLite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let testDirectory: string;
  const password = 'p4-test-password';
  const accounts: Record<
    'owner' | 'member' | 'outsider' | 'observer',
    { id: string; token: string; username: string }
  > = {} as never;

  beforeAll(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'scpc-p4-integration-'));
    const databasePath = join(testDirectory, 'p4.db');
    prisma = new PrismaService({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, '/')}` } },
    });
    const migrationsPath = resolve(__dirname, '../../../../../prisma/migrations');

    for (const entry of (await readdir(migrationsPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const sql = await readFile(resolve(migrationsPath, entry.name, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter((statement) => statement.trim())) {
        await prisma.$executeRawUnsafe(statement);
      }
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    for (const name of ['owner', 'member', 'outsider', 'observer'] as const) {
      accounts[name] = await createAccount(name);
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await rm(testDirectory, { force: true, recursive: true });
  });

  async function request(
    path: string,
    method: string,
    token?: string,
    body?: unknown,
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      method,
    });
  }

  async function createAccount(
    name: 'owner' | 'member' | 'outsider' | 'observer',
  ): Promise<{ id: string; token: string; username: string }> {
    const username = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registration = await request('/auth/register', 'POST', undefined, {
      nickname: name,
      password,
      username,
    });
    const registered = (await registration.json()) as RegisterEnvelope;
    const login = await request('/auth/login', 'POST', undefined, {
      password,
      username,
    });
    const session = (await login.json()) as LoginEnvelope;

    return {
      id: registered.data.id,
      token: session.data.accessToken,
      username,
    };
  }

  async function createProject(): Promise<string> {
    const created = await request('/projects', 'POST', accounts.owner.token, {
      endDate: '2026-12-31',
      name: `P4 项目 ${Date.now()}`,
      startDate: '2026-11-01',
    });
    const project = (await created.json()) as ProjectEnvelope;
    const projectId = project.data.id;
    await request(`/projects/${projectId}/members`, 'POST', accounts.owner.token, {
      role: 'MEMBER',
      username: accounts.member.username,
    });
    await request(`/projects/${projectId}/members`, 'POST', accounts.owner.token, {
      role: 'OBSERVER',
      username: accounts.observer.username,
    });

    return projectId;
  }

  it('supports the complete iteration lifecycle with statistics and task migration', async () => {
    const projectId = await createProject();
    const invalid = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.owner.token,
      {
        endDate: '2026-10-01T00:00:00.000Z',
        name: '非法迭代',
        startDate: '2026-11-01T00:00:00.000Z',
      },
    );
    expect(invalid.status).toBe(422);

    const memberCreate = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.member.token,
      {
        endDate: '2026-11-30T00:00:00.000Z',
        name: '成员创建',
        startDate: '2026-11-01T00:00:00.000Z',
      },
    );
    expect(memberCreate.status).toBe(403);

    const created = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.owner.token,
      {
        endDate: '2026-11-30T00:00:00.000Z',
        goal: 'P4 迭代',
        name: '迭代一',
        startDate: '2026-11-01T00:00:00.000Z',
      },
    );
    expect(created.status).toBe(201);
    const iteration = (await created.json()) as IterationEnvelope;
    expect(iteration.data).toMatchObject({ name: '迭代一', status: 'NOT_STARTED', taskCount: 0 });

    await prisma.task.createMany({
      data: [
        {
          createdById: accounts.owner.id,
          projectId,
          status: 'BACKLOG',
          title: '未完成任务',
        },
        {
          completedAt: new Date('2026-11-10T00:00:00.000Z'),
          createdById: accounts.owner.id,
          projectId,
          status: 'COMPLETED',
          title: '已完成任务',
        },
      ],
    });
    const unfinished = await prisma.task.findFirstOrThrow({
      select: { id: true },
      where: { projectId, title: '未完成任务' },
    });
    const completedTask = await prisma.task.findFirstOrThrow({
      select: { id: true },
      where: { projectId, title: '已完成任务' },
    });

    const started = await request(
      `/projects/${projectId}/iterations/${iteration.data.id}`,
      'PATCH',
      accounts.owner.token,
      { status: 'IN_PROGRESS' },
    );
    expect(started.status).toBe(200);
    expect(((await started.json()) as IterationEnvelope).data.status).toBe('IN_PROGRESS');

    for (const taskId of [unfinished.id, completedTask.id]) {
      const added = await request(
        `/projects/${projectId}/iterations/${iteration.data.id}/tasks`,
        'POST',
        accounts.owner.token,
        { taskId },
      );
      expect(added.status).toBe(200);
    }

    const statsResponse = await request(
      `/projects/${projectId}/iterations/${iteration.data.id}/stats`,
      'GET',
      accounts.member.token,
    );
    expect(statsResponse.status).toBe(200);
    expect(((await statsResponse.json()) as IterationStatsEnvelope).data).toEqual({
      asOf: expect.any(String),
      blocked: 0,
      completed: 1,
      completionRate: 0.5,
      inProgress: 0,
      overdue: 0,
      total: 2,
    });

    const nextCreated = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.owner.token,
      {
        endDate: '2026-12-31T00:00:00.000Z',
        name: '迭代二',
        startDate: '2026-12-01T00:00:00.000Z',
      },
    );
    const nextIteration = (await nextCreated.json()) as IterationEnvelope;
    const closed = await request(
      `/projects/${projectId}/iterations/${iteration.data.id}/close`,
      'POST',
      accounts.owner.token,
      { nextIterationId: nextIteration.data.id },
    );
    expect(closed.status).toBe(200);
    const closedIteration = (await closed.json()) as IterationEnvelope;
    expect(closedIteration.data.status).toBe('COMPLETED');
    expect(closedIteration.data.tasks.map((task) => task.title)).toEqual(['已完成任务']);
    const nextDetail = await request(
      `/projects/${projectId}/iterations/${nextIteration.data.id}`,
      'GET',
      accounts.owner.token,
    );
    expect(
      ((await nextDetail.json()) as IterationEnvelope).data.tasks.map((task) => task.title),
    ).toEqual(['未完成任务']);

    const deleted = await request(
      `/projects/${projectId}/iterations/${nextIteration.data.id}`,
      'DELETE',
      accounts.owner.token,
    );
    expect(deleted.status).toBe(200);
    expect(await prisma.iteration.count({ where: { id: nextIteration.data.id } })).toBe(0);
  });

  it('rejects iteration creation on paused projects and empty update dates', async () => {
    const projectId = await createProject();
    const endpoint = `/projects/${projectId}/iterations`;
    const created = await request(endpoint, 'POST', accounts.owner.token, {
      endDate: '2026-11-30T00:00:00.000Z',
      name: '暂定迭代',
      startDate: '2026-11-01T00:00:00.000Z',
    });
    expect(created.status).toBe(201);
    const iteration = (await created.json()) as IterationEnvelope;

    await request(`/projects/${projectId}/status`, 'PATCH', accounts.owner.token, {
      status: 'ACTIVE',
    });
    await request(`/projects/${projectId}/status`, 'PATCH', accounts.owner.token, {
      status: 'PAUSED',
    });

    const pausedCreate = await request(endpoint, 'POST', accounts.owner.token, {
      endDate: '2026-12-31T00:00:00.000Z',
      name: '暂停中新增',
      startDate: '2026-12-01T00:00:00.000Z',
    });
    expect(pausedCreate.status).toBe(409);
    expect(((await pausedCreate.json()) as { error?: { code?: string } }).error?.code).toBe(
      'PROJECT_PAUSED',
    );

    const nullDate = await request(
      `/projects/${projectId}/iterations/${iteration.data.id}`,
      'PATCH',
      accounts.owner.token,
      { startDate: null },
    );
    expect(nullDate.status).toBe(400);
    const emptyDate = await request(
      `/projects/${projectId}/iterations/${iteration.data.id}`,
      'PATCH',
      accounts.owner.token,
      { startDate: '' },
    );
    expect(emptyDate.status).toBe(400);

    const detail = await request(
      `/projects/${projectId}/iterations/${iteration.data.id}`,
      'GET',
      accounts.owner.token,
    );
    expect(((await detail.json()) as IterationEnvelope).data).toMatchObject({
      endDate: '2026-11-30T00:00:00.000Z',
      startDate: '2026-11-01T00:00:00.000Z',
      status: 'NOT_STARTED',
    });
  });

  it.each(['COMPLETED', 'CANCELED'])(
    'allows unfinished tasks to leave a %s iteration',
    async (status) => {
      const projectId = await createProject();
      const source = await prisma.iteration.create({
        data: {
          endDate: new Date('2026-11-30T00:00:00.000Z'),
          name: '已结束迭代',
          projectId,
          startDate: new Date('2026-11-01T00:00:00.000Z'),
          status,
        },
      });
      const target = await prisma.iteration.create({
        data: {
          endDate: new Date('2026-12-31T00:00:00.000Z'),
          name: '下一迭代',
          projectId,
          startDate: new Date('2026-12-01T00:00:00.000Z'),
        },
      });
      const moving = await prisma.task.create({
        data: {
          createdById: accounts.owner.id,
          iterationId: source.id,
          projectId,
          status: 'BACKLOG',
          title: '迁移未完成任务',
        },
      });
      const removing = await prisma.task.create({
        data: {
          createdById: accounts.owner.id,
          iterationId: source.id,
          projectId,
          status: 'BLOCKED',
          title: '移出未完成任务',
        },
      });

      const removed = await request(
        `/projects/${projectId}/iterations/${source.id}/tasks/${removing.id}`,
        'DELETE',
        accounts.owner.token,
      );
      expect(removed.status).toBe(200);
      const moved = await request(
        `/projects/${projectId}/iterations/${target.id}/tasks`,
        'POST',
        accounts.owner.token,
        { expectedIterationId: source.id, taskId: moving.id },
      );
      expect(moved.status).toBe(200);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: moving.id } })).iterationId).toBe(
        target.id,
      );
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: removing.id } })).iterationId,
      ).toBeNull();
    },
  );

  it('rejects stale task ownership instead of overwriting another iteration', async () => {
    const projectId = await createProject();
    const source = await prisma.iteration.create({
      data: {
        endDate: new Date('2026-11-30T00:00:00.000Z'),
        name: '实际来源',
        projectId,
        startDate: new Date('2026-11-01T00:00:00.000Z'),
      },
    });
    const target = await prisma.iteration.create({
      data: {
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        name: '目标迭代',
        projectId,
        startDate: new Date('2026-12-01T00:00:00.000Z'),
      },
    });
    const task = await prisma.task.create({
      data: {
        createdById: accounts.owner.id,
        iterationId: source.id,
        projectId,
        title: '已经安排的任务',
      },
    });
    const endpoint = `/projects/${projectId}/iterations/${target.id}/tasks`;

    for (const body of [{ taskId: task.id }, { expectedIterationId: null, taskId: task.id }]) {
      const stale = await request(endpoint, 'POST', accounts.owner.token, body);
      expect(stale.status).toBe(409);
      expect(((await stale.json()) as { error?: { code?: string } }).error?.code).toBe(
        'ITERATION_TASK_MOVED',
      );
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).iterationId).toBe(
        source.id,
      );
    }
    expect(
      await prisma.activityLog.count({
        where: { action: 'ITERATION_TASK_ADDED', projectId, targetId: target.id },
      }),
    ).toBe(0);

    const unauthorized = await request(endpoint, 'POST', accounts.member.token, {
      expectedIterationId: source.id,
      taskId: task.id,
    });
    expect(unauthorized.status).toBe(403);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).iterationId).toBe(
      source.id,
    );

    const confirmed = await request(endpoint, 'POST', accounts.owner.token, {
      expectedIterationId: source.id,
      taskId: task.id,
    });
    expect(confirmed.status).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).iterationId).toBe(
      target.id,
    );
  });

  it('freezes completed task membership for terminal iterations', async () => {
    const projectId = await createProject();

    const canceled = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.owner.token,
      {
        endDate: '2026-12-31T00:00:00.000Z',
        name: '已取消迭代',
        startDate: '2026-12-01T00:00:00.000Z',
      },
    );
    expect(canceled.status).toBe(201);
    const canceledIteration = (await canceled.json()) as IterationEnvelope;
    await request(
      `/projects/${projectId}/iterations/${canceledIteration.data.id}`,
      'PATCH',
      accounts.owner.token,
      {
        status: 'CANCELED',
      },
    );

    const completedTask = await prisma.task.create({
      data: {
        createdById: accounts.owner.id,
        projectId,
        status: 'COMPLETED',
        title: '已完成任务',
      },
    });

    const addToCanceled = await request(
      `/projects/${projectId}/iterations/${canceledIteration.data.id}/tasks`,
      'POST',
      accounts.owner.token,
      { taskId: completedTask.id },
    );
    expect(addToCanceled.status).toBe(422);
    expect(((await addToCanceled.json()) as { error?: { code?: string } }).error?.code).toBe(
      'ITERATION_TARGET_TERMINAL',
    );
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: completedTask.id } })).iterationId,
    ).toBeNull();

    const completed = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.owner.token,
      {
        endDate: '2026-12-31T00:00:00.000Z',
        name: '已完成迭代',
        startDate: '2026-12-01T00:00:00.000Z',
      },
    );
    const completedIteration = (await completed.json()) as IterationEnvelope;
    const added = await request(
      `/projects/${projectId}/iterations/${completedIteration.data.id}/tasks`,
      'POST',
      accounts.owner.token,
      { taskId: completedTask.id },
    );
    expect(added.status).toBe(200);
    await request(
      `/projects/${projectId}/iterations/${completedIteration.data.id}`,
      'PATCH',
      accounts.owner.token,
      {
        status: 'IN_PROGRESS',
      },
    );
    await request(
      `/projects/${projectId}/iterations/${completedIteration.data.id}`,
      'PATCH',
      accounts.owner.token,
      {
        status: 'COMPLETED',
      },
    );

    const active = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.owner.token,
      {
        endDate: '2027-01-31T00:00:00.000Z',
        name: '进行中迭代',
        startDate: '2027-01-01T00:00:00.000Z',
      },
    );
    const activeIteration = (await active.json()) as IterationEnvelope;

    const moveOut = await request(
      `/projects/${projectId}/iterations/${activeIteration.data.id}/tasks`,
      'POST',
      accounts.owner.token,
      { expectedIterationId: completedIteration.data.id, taskId: completedTask.id },
    );
    expect(moveOut.status).toBe(422);
    expect(((await moveOut.json()) as { error?: { code?: string } }).error?.code).toBe(
      'ITERATION_SOURCE_TERMINAL',
    );

    const removeFromCompleted = await request(
      `/projects/${projectId}/iterations/${completedIteration.data.id}/tasks/${completedTask.id}`,
      'DELETE',
      accounts.owner.token,
    );
    expect(removeFromCompleted.status).toBe(422);
    expect(((await removeFromCompleted.json()) as { error?: { code?: string } }).error?.code).toBe(
      'ITERATION_SOURCE_TERMINAL',
    );
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: completedTask.id } })).iterationId,
    ).toBe(completedIteration.data.id);
  });

  it('rejects closing an iteration into a terminal iteration', async () => {
    const projectId = await createProject();

    const source = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.owner.token,
      {
        endDate: '2026-12-31T00:00:00.000Z',
        name: '待关闭迭代',
        startDate: '2026-12-01T00:00:00.000Z',
      },
    );
    const sourceIteration = (await source.json()) as IterationEnvelope;
    await request(
      `/projects/${projectId}/iterations/${sourceIteration.data.id}`,
      'PATCH',
      accounts.owner.token,
      {
        status: 'IN_PROGRESS',
      },
    );

    const target = await request(
      `/projects/${projectId}/iterations`,
      'POST',
      accounts.owner.token,
      {
        endDate: '2026-12-31T00:00:00.000Z',
        name: '已取消目标迭代',
        startDate: '2026-12-01T00:00:00.000Z',
      },
    );
    const targetIteration = (await target.json()) as IterationEnvelope;
    await request(
      `/projects/${projectId}/iterations/${targetIteration.data.id}`,
      'PATCH',
      accounts.owner.token,
      {
        status: 'CANCELED',
      },
    );

    const closed = await request(
      `/projects/${projectId}/iterations/${sourceIteration.data.id}/close`,
      'POST',
      accounts.owner.token,
      { nextIterationId: targetIteration.data.id },
    );
    expect(closed.status).toBe(422);
    expect(((await closed.json()) as { error?: { code?: string } }).error?.code).toBe(
      'ITERATION_TARGET_TERMINAL',
    );

    const detail = await request(
      `/projects/${projectId}/iterations/${sourceIteration.data.id}`,
      'GET',
      accounts.owner.token,
    );
    expect(((await detail.json()) as IterationEnvelope).data.status).toBe('IN_PROGRESS');
  });
  it('allows members to create, edit and delete only their own comments', async () => {
    const projectId = await createProject();
    const task = await prisma.task.create({
      data: { createdById: accounts.member.id, projectId, title: '评论目标任务' },
    });

    const created = await request(
      `/projects/${projectId}/comments`,
      'POST',
      accounts.member.token,
      { content: '第一条评论', targetId: task.id, targetType: 'TASK' },
    );
    expect(created.status).toBe(201);
    const comment = (await created.json()) as CommentEnvelope;
    expect(comment.data).toMatchObject({
      author: { id: accounts.member.id },
      content: '第一条评论',
      targetType: 'TASK',
    });

    const updated = await request(
      `/projects/${projectId}/comments/${comment.data.id}`,
      'PATCH',
      accounts.member.token,
      { content: '修改后的评论' },
    );
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as CommentEnvelope).data.content).toBe('修改后的评论');

    const forbiddenUpdate = await request(
      `/projects/${projectId}/comments/${comment.data.id}`,
      'PATCH',
      accounts.owner.token,
      { content: '越权修改' },
    );
    expect(forbiddenUpdate.status).toBe(403);

    const observerList = await request(
      `/projects/${projectId}/comments?targetType=TASK&targetId=${task.id}`,
      'GET',
      accounts.observer.token,
    );
    expect(observerList.status).toBe(200);
    expect(((await observerList.json()) as CommentListEnvelope).data).toHaveLength(1);

    const observerCreate = await request(
      `/projects/${projectId}/comments`,
      'POST',
      accounts.observer.token,
      { content: '观察者评论', targetId: task.id, targetType: 'TASK' },
    );
    expect(observerCreate.status).toBe(403);

    const missingTarget = await request(
      `/projects/${projectId}/comments`,
      'POST',
      accounts.member.token,
      { content: '评论', targetId: 'missing-task', targetType: 'TASK' },
    );
    expect(missingTarget.status).toBe(404);

    const deletedTargetTask = await prisma.task.create({
      data: { createdById: accounts.member.id, projectId, title: '即将删除的目标' },
    });
    await prisma.task.delete({ where: { id: deletedTargetTask.id } });
    const deletedTarget = await request(
      `/projects/${projectId}/comments`,
      'POST',
      accounts.member.token,
      { content: '评论', targetId: deletedTargetTask.id, targetType: 'TASK' },
    );
    expect(deletedTarget.status).toBe(404);
    expect(await prisma.comment.count({ where: { projectId } })).toBe(1);

    const outsiderDelete = await request(
      `/projects/${projectId}/comments/${comment.data.id}`,
      'DELETE',
      accounts.outsider.token,
    );
    expect(outsiderDelete.status).toBe(404);

    const deleted = await request(
      `/projects/${projectId}/comments/${comment.data.id}`,
      'DELETE',
      accounts.member.token,
    );
    expect(deleted.status).toBe(200);
    expect(await prisma.comment.count({ where: { id: comment.data.id } })).toBe(0);

    expect(
      await prisma.activityLog.count({
        where: { projectId, targetType: 'COMMENT' },
      }),
    ).toBeGreaterThanOrEqual(3);
    expect(
      await prisma.activityLog.count({
        where: { projectId, targetType: 'ITERATION' },
      }),
    ).toBe(0);
  });
});
