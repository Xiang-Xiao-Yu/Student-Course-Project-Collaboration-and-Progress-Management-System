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

interface ErrorEnvelope {
  error?: { code?: string };
}

interface LoginEnvelope {
  data: { accessToken: string };
}

interface ProjectEnvelope {
  data: { id: string };
}

interface RegisterEnvelope {
  data: { id: string };
}

interface TaskEnvelope {
  data: Array<{ id: string; title: string }>;
}

interface RequirementListEnvelope {
  data: Array<{ id: string; title: string }>;
}

interface DashboardEnvelope {
  data: {
    burndown: Array<{
      completedTasks: number;
      date: string;
      idealRemainingTasks: number;
      remainingTasks: number;
    }>;
    completionTrend: Array<{
      completed: number;
      cumulativeCompleted: number;
      date: string;
    }>;
    iterationCompletion: Array<{
      completedTasks: number;
      completionRate: number;
      id: string;
      totalTasks: number;
    }>;
    memberTaskDistribution: Array<{
      blockedTasks: number;
      completedTasks: number;
      inProgressTasks: number;
      overdueTasks: number;
      totalTasks: number;
      userId: string;
    }>;
    project: {
      requirementCompletionRate: number;
      taskCompletionRate: number;
    };
    recentActivities: Array<{ action: string; actor: { id: string } | null }>;
    summary: {
      blockedTasks: number;
      completedRequirements: number;
      completedTasks: number;
      inProgressTasks: number;
      overdueTasks: number;
      pendingReviewTasks: number;
      requirementCompletionRate: number;
      taskCompletionRate: number;
      totalRequirements: number;
      totalTasks: number;
    };
    taskStatusDistribution: Array<{ count: number; status: string }>;
    upcomingTasks: Array<{ id: string; title: string }>;
  };
}

describe('P6 dashboard, filters and exports with SQLite', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let testDirectory: string;
  const password = 'p6-test-password';
  const accounts: Record<
    'owner' | 'member' | 'outsider' | 'observer',
    { id: string; token: string; username: string }
  > = {} as never;

  beforeAll(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'scpc-p6-integration-'));
    const databasePath = join(testDirectory, 'p6.db');
    prisma = new PrismaService({
      datasources: { db: { url: 'file:' + databasePath.replace(/\\/g, '/') } },
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
    baseUrl = 'http://127.0.0.1:' + address.port + '/api/v1';

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
    requestPath: string,
    method: string,
    token?: string,
    body?: unknown,
  ): Promise<Response> {
    return fetch(baseUrl + requestPath, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      method,
    });
  }

  async function createAccount(
    name: 'owner' | 'member' | 'outsider' | 'observer',
  ): Promise<{ id: string; token: string; username: string }> {
    const username = name + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
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

  async function createProject(name: string): Promise<string> {
    const created = await request('/projects', 'POST', accounts.owner.token, {
      endDate: offsetDate(20).toISOString(),
      name,
      startDate: offsetDate(-20).toISOString(),
    });
    expect(created.status).toBe(201);
    const project = (await created.json()) as ProjectEnvelope;
    const projectId = project.data.id;

    const member = await request(
      '/projects/' + projectId + '/members',
      'POST',
      accounts.owner.token,
      {
        role: 'MEMBER',
        username: accounts.member.username,
      },
    );
    const observer = await request(
      '/projects/' + projectId + '/members',
      'POST',
      accounts.owner.token,
      {
        role: 'OBSERVER',
        username: accounts.observer.username,
      },
    );
    expect(member.status).toBe(201);
    expect(observer.status).toBe(201);

    return projectId;
  }

  function offsetDate(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  async function seedDashboardData(projectId: string): Promise<{
    iterationOneId: string;
    iterationTwoId: string;
  }> {
    const iterationOne = await prisma.iteration.create({
      data: {
        endDate: offsetDate(7),
        name: '迭代一',
        projectId,
        startDate: offsetDate(-14),
        status: 'IN_PROGRESS',
      },
    });
    const iterationTwo = await prisma.iteration.create({
      data: {
        endDate: offsetDate(20),
        name: '迭代二',
        projectId,
        startDate: offsetDate(8),
        status: 'NOT_STARTED',
      },
    });
    const requirementCompletedOne = await prisma.requirement.create({
      data: {
        acceptanceCriteria: '完成登录',
        creatorId: accounts.owner.id,
        number: 'P6-001',
        priority: 'HIGH',
        projectId,
        status: 'COMPLETED',
        title: '登录模块',
      },
    });
    await prisma.requirement.createMany({
      data: [
        {
          acceptanceCriteria: '完成任务看板',
          creatorId: accounts.owner.id,
          number: 'P6-002',
          priority: 'MEDIUM',
          projectId,
          status: 'COMPLETED',
          title: '任务看板',
        },
        {
          acceptanceCriteria: '完成统计页面',
          creatorId: accounts.owner.id,
          number: 'P6-003',
          priority: 'MEDIUM',
          projectId,
          status: 'IN_PROGRESS',
          title: '统计页面',
        },
      ],
    });

    const dashboardCompleted = await prisma.task.create({
      data: {
        assigneeId: accounts.member.id,
        completedAt: offsetDate(-2),
        completionNote: '已完成',
        createdAt: offsetDate(-10),
        createdById: accounts.owner.id,
        dueDate: offsetDate(1),
        iterationId: iterationOne.id,
        priority: 'HIGH',
        projectId,
        requirementId: requirementCompletedOne.id,
        status: 'COMPLETED',
        title: '完成登录接口',
      },
    });
    const ownerCompleted = await prisma.task.create({
      data: {
        assigneeId: accounts.owner.id,
        completedAt: offsetDate(0),
        completionNote: '已完成',
        createdAt: offsetDate(-8),
        createdById: accounts.owner.id,
        dueDate: offsetDate(0),
        priority: 'MEDIUM',
        projectId,
        status: 'COMPLETED',
        title: '检查需求',
      },
    });
    const memberInProgress = await prisma.task.create({
      data: {
        assigneeId: accounts.member.id,
        createdAt: offsetDate(-5),
        createdById: accounts.owner.id,
        dueDate: offsetDate(0),
        iterationId: iterationOne.id,
        priority: 'HIGH',
        projectId,
        status: 'IN_PROGRESS',
        title: '实现统计接口',
      },
    });
    const overdueBlocked = await prisma.task.create({
      data: {
        assigneeId: accounts.owner.id,
        createdAt: offsetDate(-4),
        createdById: accounts.owner.id,
        dueDate: offsetDate(-1),
        iterationId: iterationTwo.id,
        priority: 'HIGH',
        projectId,
        status: 'BLOCKED',
        title: '修复阻塞问题',
      },
    });
    const upcomingTodo = await prisma.task.create({
      data: {
        assigneeId: accounts.member.id,
        createdAt: offsetDate(-3),
        createdById: accounts.owner.id,
        dueDate: offsetDate(3),
        iterationId: iterationTwo.id,
        priority: 'MEDIUM',
        projectId,
        status: 'TODO',
        title: '补充筛选测试',
      },
    });
    await prisma.task.create({
      data: {
        createdAt: offsetDate(-2),
        createdById: accounts.owner.id,
        dueDate: offsetDate(8),
        priority: 'LOW',
        projectId,
        status: 'BACKLOG',
        title: '待规划任务',
      },
    });

    await prisma.activityLog.createMany({
      data: [
        {
          action: 'TASK_CREATED',
          actorId: accounts.owner.id,
          afterValue: JSON.stringify({ id: dashboardCompleted.id }),
          projectId,
          targetId: dashboardCompleted.id,
          targetType: 'TASK',
        },
        {
          action: 'TASK_STATUS_CHANGED',
          actorId: accounts.member.id,
          afterValue: JSON.stringify({ status: 'COMPLETED' }),
          beforeValue: JSON.stringify({ status: 'PENDING_REVIEW' }),
          projectId,
          targetId: ownerCompleted.id,
          targetType: 'TASK',
        },
      ],
    });

    expect([memberInProgress.id, overdueBlocked.id, upcomingTodo.id]).toHaveLength(3);

    return {
      iterationOneId: iterationOne.id,
      iterationTwoId: iterationTwo.id,
    };
  }

  async function seedFilterData(projectId: string): Promise<{
    iterationId: string;
    matchedTaskId: string;
  }> {
    const iteration = await prisma.iteration.create({
      data: {
        endDate: offsetDate(10),
        name: '筛选迭代',
        projectId,
        startDate: offsetDate(-5),
        status: 'IN_PROGRESS',
      },
    });
    const requirement = await prisma.requirement.create({
      data: {
        acceptanceCriteria: '可以登录',
        creatorId: accounts.owner.id,
        number: 'P6-FILTER-001',
        priority: 'HIGH',
        projectId,
        status: 'IN_PROGRESS',
        title: '登录模块筛选目标',
      },
    });
    const backendTag = await prisma.tag.create({
      data: { color: '#2563eb', name: 'backend', projectId },
    });
    const frontendTag = await prisma.tag.create({
      data: { color: '#16a34a', name: 'frontend', projectId },
    });
    const matchedTask = await prisma.task.create({
      data: {
        assigneeId: accounts.member.id,
        createdById: accounts.owner.id,
        dueDate: offsetDate(5),
        iterationId: iteration.id,
        priority: 'HIGH',
        projectId,
        requirementId: requirement.id,
        status: 'IN_PROGRESS',
        title: '=SUM(1,2)',
      },
    });
    const otherTask = await prisma.task.create({
      data: {
        assigneeId: accounts.owner.id,
        createdById: accounts.owner.id,
        dueDate: offsetDate(10),
        priority: 'LOW',
        projectId,
        status: 'TODO',
        title: '前端页面',
      },
    });
    const completedTask = await prisma.task.create({
      data: {
        assigneeId: accounts.member.id,
        completedAt: offsetDate(-1),
        completionNote: '完成',
        createdById: accounts.owner.id,
        dueDate: offsetDate(5),
        iterationId: iteration.id,
        priority: 'HIGH',
        projectId,
        status: 'COMPLETED',
        title: '后端已完成任务',
      },
    });
    await prisma.taskTag.createMany({
      data: [
        { tagId: backendTag.id, taskId: matchedTask.id },
        { tagId: frontendTag.id, taskId: otherTask.id },
        { tagId: backendTag.id, taskId: completedTask.id },
      ],
    });

    return { iterationId: iteration.id, matchedTaskId: matchedTask.id };
  }

  it('returns an empty dashboard for an empty project', async () => {
    const projectId = await createProject('P6 空项目');
    const response = await request(
      '/projects/' + projectId + '/dashboard',
      'GET',
      accounts.observer.token,
    );
    expect(response.status).toBe(200);
    const dashboard = ((await response.json()) as DashboardEnvelope).data;
    expect(dashboard.summary).toMatchObject({
      blockedTasks: 0,
      completedRequirements: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      overdueTasks: 0,
      pendingReviewTasks: 0,
      requirementCompletionRate: 0,
      taskCompletionRate: 0,
      totalRequirements: 0,
      totalTasks: 0,
    });
    expect(dashboard.memberTaskDistribution.every((item) => item.totalTasks === 0)).toBe(true);
    expect(dashboard.iterationCompletion).toEqual([]);
    expect(dashboard.recentActivities.length).toBeGreaterThanOrEqual(1);
    expect(dashboard.recentActivities.map((item) => item.action)).toContain('PROJECT_CREATED');
    expect(dashboard.upcomingTasks).toEqual([]);
    expect(dashboard.taskStatusDistribution.every((item) => item.count === 0)).toBe(true);
    expect(dashboard.completionTrend).toHaveLength(14);
    expect(dashboard.burndown.length).toBeGreaterThan(0);

    expect(
      (await request('/projects/' + projectId + '/dashboard', 'GET', accounts.outsider.token))
        .status,
    ).toBe(404);
  });

  it('returns dashboard aggregates, charts, activities and upcoming tasks', async () => {
    const projectId = await createProject('P6 仪表盘项目');
    const iterations = await seedDashboardData(projectId);
    const response = await request(
      '/projects/' + projectId + '/dashboard',
      'GET',
      accounts.member.token,
    );
    expect(response.status).toBe(200);
    const dashboard = ((await response.json()) as DashboardEnvelope).data;

    expect(dashboard.summary).toMatchObject({
      blockedTasks: 1,
      completedRequirements: 2,
      completedTasks: 2,
      inProgressTasks: 1,
      overdueTasks: 1,
      pendingReviewTasks: 0,
      requirementCompletionRate: 0.6667,
      taskCompletionRate: 0.3333,
      totalRequirements: 3,
      totalTasks: 6,
    });
    expect(dashboard.project).toMatchObject({
      requirementCompletionRate: 0.6667,
      taskCompletionRate: 0.3333,
    });
    expect(
      dashboard.taskStatusDistribution.find((item) => item.status === 'COMPLETED')?.count,
    ).toBe(2);

    const memberTasks = dashboard.memberTaskDistribution.find(
      (item) => item.userId === accounts.member.id,
    );
    expect(memberTasks).toMatchObject({
      blockedTasks: 0,
      completedTasks: 1,
      inProgressTasks: 1,
      overdueTasks: 0,
      totalTasks: 3,
    });
    const ownerTasks = dashboard.memberTaskDistribution.find(
      (item) => item.userId === accounts.owner.id,
    );
    expect(ownerTasks).toMatchObject({
      blockedTasks: 1,
      completedTasks: 1,
      overdueTasks: 1,
      totalTasks: 2,
    });

    expect(
      dashboard.iterationCompletion.find((item) => item.id === iterations.iterationOneId),
    ).toMatchObject({ completedTasks: 1, completionRate: 0.5, totalTasks: 2 });
    expect(
      dashboard.iterationCompletion.find((item) => item.id === iterations.iterationTwoId),
    ).toMatchObject({ completedTasks: 0, completionRate: 0, totalTasks: 2 });
    expect(dashboard.recentActivities.length).toBeGreaterThanOrEqual(2);
    expect(
      dashboard.recentActivities.find((item) => item.action === 'TASK_STATUS_CHANGED'),
    ).toMatchObject({
      actor: { id: expect.any(String) },
    });
    expect(dashboard.upcomingTasks.map((task) => task.title).sort()).toEqual(
      ['实现统计接口', '补充筛选测试'].sort(),
    );
    expect(dashboard.completionTrend.reduce((sum, item) => sum + item.completed, 0)).toBe(2);
    expect(dashboard.completionTrend.at(-1)?.cumulativeCompleted).toBe(2);
    expect(dashboard.burndown.length).toBeGreaterThan(10);
    expect(
      dashboard.burndown.every(
        (item) =>
          item.remainingTasks >= 0 && item.idealRemainingTasks >= 0 && item.completedTasks >= 0,
      ),
    ).toBe(true);
  });

  it('combines task filters, handles empty results and searches requirements', async () => {
    const projectId = await createProject('P6 筛选项目');
    const fixture = await seedFilterData(projectId);
    const from = offsetDate(4).toISOString().slice(0, 10);
    const to = offsetDate(6).toISOString().slice(0, 10);
    const query =
      '?assigneeId=' +
      accounts.member.id +
      '&status=IN_PROGRESS&priority=HIGH&tag=backend&iterationId=' +
      fixture.iterationId +
      '&dueDateFrom=' +
      from +
      '&dueDateTo=' +
      to;
    const filtered = await request(
      '/projects/' + projectId + '/tasks' + query,
      'GET',
      accounts.observer.token,
    );
    expect(filtered.status).toBe(200);
    expect(((await filtered.json()) as TaskEnvelope).data).toEqual([
      expect.objectContaining({ id: fixture.matchedTaskId, title: '=SUM(1,2)' }),
    ]);

    const noResult = await request(
      '/projects/' + projectId + '/tasks?status=BLOCKED',
      'GET',
      accounts.member.token,
    );
    expect(noResult.status).toBe(200);
    expect(((await noResult.json()) as TaskEnvelope).data).toEqual([]);

    const titleSearch = await request(
      '/projects/' + projectId + '/tasks?search=' + encodeURIComponent('SUM'),
      'GET',
      accounts.member.token,
    );
    expect(((await titleSearch.json()) as TaskEnvelope).data).toEqual([
      expect.objectContaining({ id: fixture.matchedTaskId }),
    ]);

    const cleared = await request(
      '/projects/' + projectId + '/tasks',
      'GET',
      accounts.member.token,
    );
    expect(((await cleared.json()) as TaskEnvelope).data).toHaveLength(3);

    const invalidStatus = await request(
      '/projects/' + projectId + '/tasks?status=UNKNOWN',
      'GET',
      accounts.member.token,
    );
    expect(invalidStatus.status).toBe(400);

    const invalidRange = await request(
      '/projects/' +
        projectId +
        '/tasks?dueDateFrom=' +
        offsetDate(7).toISOString().slice(0, 10) +
        '&dueDateTo=' +
        offsetDate(1).toISOString().slice(0, 10),
      'GET',
      accounts.member.token,
    );
    expect(invalidRange.status).toBe(422);
    expect(((await invalidRange.json()) as ErrorEnvelope).error?.code).toBe(
      'TASK_FILTER_DATE_RANGE_INVALID',
    );

    const requirements = await request(
      '/projects/' + projectId + '/requirements?search=' + encodeURIComponent('登录'),
      'GET',
      accounts.member.token,
    );
    expect(requirements.status).toBe(200);
    expect(((await requirements.json()) as RequirementListEnvelope).data).toHaveLength(1);

    const noRequirements = await request(
      '/projects/' + projectId + '/requirements?search=' + encodeURIComponent('不存在'),
      'GET',
      accounts.member.token,
    );
    expect(((await noRequirements.json()) as RequirementListEnvelope).data).toEqual([]);
  });

  it('exports filtered raw CSV task data and a progress report with owner-only permission', async () => {
    const projectId = await createProject('P6 导出项目');
    await seedFilterData(projectId);
    const exportPath =
      '/projects/' + projectId + '/tasks/export?status=IN_PROGRESS&priority=HIGH&tag=backend';
    const taskExport = await request(exportPath, 'GET', accounts.owner.token);
    expect(taskExport.status).toBe(200);
    expect(taskExport.headers.get('content-type')).toContain('text/csv');
    expect(taskExport.headers.get('content-disposition')).toContain('attachment');
    const taskCsvBytes = new Uint8Array(await taskExport.arrayBuffer());
    expect([...taskCsvBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const taskCsv = new TextDecoder().decode(taskCsvBytes);
    expect(taskCsv).toContain('"任务 ID","标题","状态"');
    expect(taskCsv).toContain('"\'=SUM(1,2)"');
    expect(taskCsv).not.toContain('"前端页面"');
    expect(taskCsv.trimStart().startsWith('{')).toBe(false);

    expect((await request(exportPath, 'GET', accounts.member.token)).status).toBe(403);
    expect((await request(exportPath, 'GET', accounts.observer.token)).status).toBe(403);
    expect((await request(exportPath, 'GET', accounts.outsider.token)).status).toBe(404);

    const invalidExport = await request(
      '/projects/' +
        projectId +
        '/tasks/export?dueDateFrom=' +
        offsetDate(7).toISOString().slice(0, 10) +
        '&dueDateTo=' +
        offsetDate(1).toISOString().slice(0, 10),
      'GET',
      accounts.owner.token,
    );
    expect(invalidExport.status).toBe(422);

    const reportPath = '/projects/' + projectId + '/reports/progress';
    const report = await request(reportPath, 'GET', accounts.owner.token);
    expect(report.status).toBe(200);
    expect(report.headers.get('content-type')).toContain('text/csv');
    const reportCsvBytes = new Uint8Array(await report.arrayBuffer());
    expect([...reportCsvBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const reportCsv = new TextDecoder().decode(reportCsvBytes);
    expect(reportCsv).toContain('"项目进度报告"');
    expect(reportCsv).toContain('"任务状态分布"');
    expect(reportCsv).toContain('"P6 导出项目"');
    expect((await request(reportPath, 'GET', accounts.member.token)).status).toBe(403);
  });
});
