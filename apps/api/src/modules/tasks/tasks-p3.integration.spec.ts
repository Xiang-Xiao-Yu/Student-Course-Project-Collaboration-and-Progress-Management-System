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

interface RequirementEnvelope {
  data: {
    id: string;
    number: string;
    status: string;
    tasks: Array<{ id: string; status: string; title: string }>;
  };
}

interface TaskEnvelope {
  data: {
    assigneeId: string | null;
    completedAt: string | null;
    completionNote: string | null;
    id: string;
    status: string;
    tagNames: string[];
  };
}

describe('P3 requirements and tasks with SQLite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let testDirectory: string;
  const password = 'p3-test-password';
  const accounts: Record<
    'owner' | 'member' | 'outsider',
    { id: string; token: string; username: string }
  > = {} as never;

  beforeAll(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'scpc-p3-integration-'));
    const databasePath = join(testDirectory, 'p3.db');
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

    for (const name of ['owner', 'member', 'outsider'] as const) {
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
    name: 'owner' | 'member' | 'outsider',
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

  async function createProjectWithMember(): Promise<string> {
    const created = await request('/projects', 'POST', accounts.owner.token, {
      endDate: '2026-12-31',
      name: `P3 项目 ${Date.now()}`,
      startDate: '2026-10-26',
    });
    const project = (await created.json()) as ProjectEnvelope;
    const invitation = await request(
      `/projects/${project.data.id}/members`,
      'POST',
      accounts.owner.token,
      { role: 'MEMBER', username: accounts.member.username },
    );
    expect(invitation.status).toBe(201);

    return project.data.id;
  }

  it('supports requirement-task association, tags and the complete task review flow', async () => {
    const projectId = await createProjectWithMember();
    const requirementResponse = await request(
      `/projects/${projectId}/requirements`,
      'POST',
      accounts.member.token,
      {
        acceptanceCriteria: '任务完成后可在需求详情查看',
        priority: 'HIGH',
        title: '关联任务需求',
      },
    );
    expect(requirementResponse.status).toBe(201);
    const requirement = (await requirementResponse.json()) as RequirementEnvelope;
    expect(requirement.data.number).toBe('REQ-001');

    const confirmed = await request(
      `/projects/${projectId}/requirements/${requirement.data.id}`,
      'PATCH',
      accounts.member.token,
      { status: 'CONFIRMED' },
    );
    expect(confirmed.status).toBe(200);

    const taskResponse = await request(
      `/projects/${projectId}/tasks`,
      'POST',
      accounts.member.token,
      {
        assigneeId: accounts.member.id,
        dueDate: '2026-11-15',
        priority: 'HIGH',
        requirementId: requirement.data.id,
        tagNames: ['backend', 'urgent'],
        title: '实现需求关联任务',
      },
    );
    expect(taskResponse.status).toBe(201);
    const task = (await taskResponse.json()) as TaskEnvelope;
    expect(task.data.assigneeId).toBe(accounts.member.id);
    expect(task.data.tagNames).toEqual(['backend', 'urgent']);

    const requirementDetail = await request(
      `/projects/${projectId}/requirements/${requirement.data.id}`,
      'GET',
      accounts.owner.token,
    );
    const requirementWithTask = (await requirementDetail.json()) as RequirementEnvelope;
    expect(requirementWithTask.data.tasks).toEqual([
      {
        assigneeId: accounts.member.id,
        id: task.data.id,
        status: 'BACKLOG',
        title: '实现需求关联任务',
      },
    ]);

    const invalidAssignee = await request(
      `/projects/${projectId}/tasks`,
      'POST',
      accounts.member.token,
      {
        assigneeId: accounts.outsider.id,
        priority: 'MEDIUM',
        title: '非法负责人任务',
      },
    );
    expect(invalidAssignee.status).toBe(422);

    for (const status of ['TODO', 'IN_PROGRESS'] as const) {
      const transition = await request(
        `/projects/${projectId}/tasks/${task.data.id}/status`,
        'PATCH',
        accounts.member.token,
        { status },
      );
      expect(transition.status).toBe(200);
    }

    const pendingReview = await request(
      `/projects/${projectId}/tasks/${task.data.id}/status`,
      'PATCH',
      accounts.member.token,
      { completionNote: '功能与测试已完成', status: 'PENDING_REVIEW' },
    );
    expect(pendingReview.status).toBe(200);

    const memberApprove = await request(
      `/projects/${projectId}/tasks/${task.data.id}/status`,
      'PATCH',
      accounts.member.token,
      { status: 'COMPLETED' },
    );
    expect(memberApprove.status).toBe(403);

    const completed = await request(
      `/projects/${projectId}/tasks/${task.data.id}/status`,
      'PATCH',
      accounts.owner.token,
      { status: 'COMPLETED' },
    );
    expect(completed.status).toBe(200);
    const completedTask = (await completed.json()) as TaskEnvelope;
    expect(completedTask.data.completedAt).not.toBeNull();

    const reopenWithoutReason = await request(
      `/projects/${projectId}/tasks/${task.data.id}/status`,
      'PATCH',
      accounts.owner.token,
      { status: 'IN_PROGRESS' },
    );
    expect(reopenWithoutReason.status).toBe(422);

    const reopened = await request(
      `/projects/${projectId}/tasks/${task.data.id}/status`,
      'PATCH',
      accounts.owner.token,
      { reopenReason: '需要补充验收项', status: 'IN_PROGRESS' },
    );
    expect(reopened.status).toBe(200);
    const reopenedTask = (await reopened.json()) as TaskEnvelope;
    expect(reopenedTask.data.completedAt).toBeNull();

    const statusLogs = await prisma.activityLog.count({
      where: {
        action: 'TASK_STATUS_CHANGED',
        projectId,
        targetId: task.data.id,
      },
    });
    expect(statusLogs).toBe(5);
  });

  it('hides requirements and tasks from project outsiders', async () => {
    const projectId = await createProjectWithMember();
    const requirements = await request(
      `/projects/${projectId}/requirements`,
      'GET',
      accounts.outsider.token,
    );
    const tasks = await request(`/projects/${projectId}/tasks`, 'GET', accounts.outsider.token);

    expect(requirements.status).toBe(404);
    expect(tasks.status).toBe(404);
  });
});
