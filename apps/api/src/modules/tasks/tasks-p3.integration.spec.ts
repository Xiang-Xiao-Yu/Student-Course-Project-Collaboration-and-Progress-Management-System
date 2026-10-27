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
import { ProjectAccessService } from '../projects/project-access.service';
import { RequirementsRepository } from '../requirements/repositories/requirements.repository';
import { TasksRepository } from './repositories/tasks.repository';

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

  it('allocates requirement numbers beyond three digits', async () => {
    const projectId = await createProjectWithMember();
    for (const number of ['REQ-999', 'REQ-1000']) {
      await prisma.requirement.create({
        data: {
          projectId,
          number,
          title: number,
          acceptanceCriteria: '可验收',
          creatorId: accounts.owner.id,
        },
      });
    }
    const response = await request(
      `/projects/${projectId}/requirements`,
      'POST',
      accounts.owner.token,
      { title: '下一需求', acceptanceCriteria: '可验收', priority: 'MEDIUM' },
    );
    expect(response.status).toBe(201);
    expect(((await response.json()) as RequirementEnvelope).data.number).toBe('REQ-1001');
  });

  it('audits tag-only changes and mixed requirement field/status changes', async () => {
    const projectId = await createProjectWithMember();
    const task = await prisma.task.create({
      data: { projectId, createdById: accounts.owner.id, title: '标签任务' },
    });
    const response = await request(
      `/projects/${projectId}/tasks/${task.id}`,
      'PATCH',
      accounts.owner.token,
      { tagNames: ['backend'] },
    );
    expect(response.status).toBe(200);
    const taskLog = await prisma.activityLog.findFirstOrThrow({
      where: { targetId: task.id, action: 'TASK_UPDATED' },
    });
    expect(JSON.parse(taskLog.beforeValue ?? '{}').tagNames).toEqual([]);
    expect(JSON.parse(taskLog.afterValue ?? '{}').tagNames).toEqual(['backend']);
    const requirement = await prisma.requirement.create({
      data: {
        projectId,
        creatorId: accounts.owner.id,
        title: '旧标题',
        number: 'REQ-001',
        acceptanceCriteria: '可验收',
      },
    });
    const updated = await request(
      `/projects/${projectId}/requirements/${requirement.id}`,
      'PATCH',
      accounts.owner.token,
      { title: '新标题', status: 'CONFIRMED' },
    );
    expect(updated.status).toBe(200);
    const requirementLog = await prisma.activityLog.findFirstOrThrow({
      where: { targetId: requirement.id, action: 'REQUIREMENT_STATUS_CHANGED' },
    });
    expect(JSON.parse(requirementLog.beforeValue ?? '{}')).toMatchObject({
      title: '旧标题',
      status: 'DRAFT',
    });
    expect(JSON.parse(requirementLog.afterValue ?? '{}')).toMatchObject({
      title: '新标题',
      status: 'CONFIRMED',
    });
  });

  it('rejects a stale requirement status without overwriting the current terminal state', async () => {
    const projectId = await createProjectWithMember();
    const requirement = await prisma.requirement.create({
      data: {
        projectId,
        creatorId: accounts.owner.id,
        number: 'REQ-001',
        title: '并发需求',
        acceptanceCriteria: '可验收',
        status: 'CONFIRMED',
      },
    });
    const repository = app.get(RequirementsRepository);
    const original = repository.updateRequirement.bind(repository);
    const spy = vi
      .spyOn(repository, 'updateRequirement')
      .mockImplementationOnce(async (...args) => {
        await prisma.requirement.update({
          where: { id: requirement.id },
          data: { status: 'REJECTED' },
        });
        return original(...args);
      });
    try {
      const response = await request(
        `/projects/${projectId}/requirements/${requirement.id}`,
        'PATCH',
        accounts.owner.token,
        { status: 'IN_PROGRESS' },
      );
      expect(response.status).toBe(422);
      expect(
        (await prisma.requirement.findUniqueOrThrow({ where: { id: requirement.id } })).status,
      ).toBe('REJECTED');
      expect(await prisma.activityLog.count({ where: { targetId: requirement.id } })).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps completedAt and status history stable on a repeated completion request', async () => {
    const projectId = await createProjectWithMember();
    const completedAt = new Date('2026-10-01T00:00:00.000Z');
    const task = await prisma.task.create({
      data: {
        projectId,
        createdById: accounts.owner.id,
        title: '已完成任务',
        status: 'COMPLETED',
        completionNote: '完成说明',
        completedAt,
      },
    });
    const response = await request(
      `/projects/${projectId}/tasks/${task.id}/status`,
      'PATCH',
      accounts.owner.token,
      { status: 'COMPLETED' },
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as TaskEnvelope).data.completedAt).toBe(
      '2026-10-01T00:00:00.000Z',
    );
    expect(
      await prisma.activityLog.count({
        where: { targetId: task.id, action: 'TASK_STATUS_CHANGED' },
      }),
    ).toBe(0);
  });

  it('audits the current completion note when a resubmission precedes approval', async () => {
    const projectId = await createProjectWithMember();
    const task = await prisma.task.create({
      data: {
        projectId,
        createdById: accounts.member.id,
        title: '并发提交说明',
        status: 'PENDING_REVIEW',
        completionNote: '旧完成说明',
      },
    });
    const repository = app.get(TasksRepository);
    const original = repository.updateTaskStatus.bind(repository);
    const spy = vi.spyOn(repository, 'updateTaskStatus').mockImplementationOnce(async (...args) => {
      await prisma.task.update({ where: { id: task.id }, data: { completionNote: '新完成说明' } });
      return original(...args);
    });
    try {
      const response = await request(
        `/projects/${projectId}/tasks/${task.id}/status`,
        'PATCH',
        accounts.owner.token,
        { status: 'COMPLETED' },
      );
      expect(response.status).toBe(200);
      expect(((await response.json()) as TaskEnvelope).data.completionNote).toBe('新完成说明');
      const log = await prisma.activityLog.findFirstOrThrow({
        where: { targetId: task.id, action: 'TASK_STATUS_CHANGED' },
      });
      expect(JSON.parse(log.beforeValue ?? '{}')).toMatchObject({
        status: 'PENDING_REVIEW',
        completionNote: '新完成说明',
      });
      expect(JSON.parse(log.afterValue ?? '{}')).toMatchObject({
        status: 'COMPLETED',
        completionNote: '新完成说明',
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('lets only the owner reject review, preserves the submission and returns the rejection reason', async () => {
    const projectId = await createProjectWithMember();
    const task = await prisma.task.create({
      data: {
        projectId,
        createdById: accounts.member.id,
        title: '审核任务',
        status: 'PENDING_REVIEW',
        completionNote: '成员完成说明',
      },
    });
    const endpoint = `/projects/${projectId}/tasks/${task.id}/status`;
    const rejection = { status: 'PENDING_REVIEW', rejectionReason: '缺少边界测试' };
    expect((await request(endpoint, 'PATCH', accounts.member.token, rejection)).status).toBe(403);
    expect(
      (
        await request(endpoint, 'PATCH', accounts.owner.token, {
          ...rejection,
          rejectionReason: '   ',
        })
      ).status,
    ).toBe(422);
    const rejected = await request(endpoint, 'PATCH', accounts.owner.token, rejection);
    expect(rejected.status).toBe(200);
    expect(((await rejected.json()) as { data: Record<string, unknown> }).data).toMatchObject({
      status: 'PENDING_REVIEW',
      completionNote: '成员完成说明',
      rejectionReason: '缺少边界测试',
    });
    const detail = await request(
      `/projects/${projectId}/tasks/${task.id}`,
      'GET',
      accounts.member.token,
    );
    expect(((await detail.json()) as { data: Record<string, unknown> }).data.rejectionReason).toBe(
      '缺少边界测试',
    );
    const list = await request(`/projects/${projectId}/tasks`, 'GET', accounts.member.token);
    expect(
      ((await list.json()) as { data: Array<Record<string, unknown>> }).data[0]?.rejectionReason,
    ).toBe('缺少边界测试');
    const approved = await request(endpoint, 'PATCH', accounts.owner.token, {
      status: 'COMPLETED',
    });
    expect(approved.status).toBe(200);
    expect(
      ((await approved.json()) as { data: Record<string, unknown> }).data.rejectionReason,
    ).toBeNull();
    expect(
      await prisma.activityLog.count({
        where: { targetId: task.id, action: 'TASK_REVIEW_REJECTED' },
      }),
    ).toBe(1);
  });

  it.each(['requirements', 'tasks'])('rechecks pause before creating %s', async (target) => {
    const projectId = await createProjectWithMember();
    const access = app.get(ProjectAccessService);
    const original = access.requirePermission.bind(access);
    const spy = vi.spyOn(access, 'requirePermission').mockImplementationOnce(async (...args) => {
      const snapshot = await original(...args);
      await prisma.project.update({ where: { id: projectId }, data: { status: 'PAUSED' } });
      return snapshot;
    });
    try {
      const response = await request(
        `/projects/${projectId}/${target}`,
        'POST',
        accounts.owner.token,
        {
          title: '暂停任务',
          priority: 'MEDIUM',
          ...(target === 'requirements' ? { acceptanceCriteria: '可验收' } : {}),
        },
      );
      expect(response.status).toBe(409);
      expect(await prisma.task.count({ where: { projectId } })).toBe(0);
      expect(await prisma.requirement.count({ where: { projectId } })).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('allows a member to revise a rejected submission without changing status or losing its history', async () => {
    const projectId = await createProjectWithMember();
    const task = await prisma.task.create({
      data: {
        projectId,
        createdById: accounts.member.id,
        title: '重新提交',
        assigneeId: accounts.member.id,
        status: 'PENDING_REVIEW',
        completionNote: '旧说明',
      },
    });
    const endpoint = `/projects/${projectId}/tasks/${task.id}/status`;
    expect(
      (
        await request(endpoint, 'PATCH', accounts.owner.token, {
          status: 'PENDING_REVIEW',
          rejectionReason: '补充说明',
        })
      ).status,
    ).toBe(200);
    const response = await request(endpoint, 'PATCH', accounts.member.token, {
      status: 'PENDING_REVIEW',
      completionNote: '已补充说明',
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: Record<string, unknown> }).data).toMatchObject({
      status: 'PENDING_REVIEW',
      completionNote: '已补充说明',
      rejectionReason: null,
    });
    const detail = await request(
      `/projects/${projectId}/tasks/${task.id}`,
      'GET',
      accounts.owner.token,
    );
    expect(
      ((await detail.json()) as { data: Record<string, unknown> }).data.rejectionReason,
    ).toBeNull();
    expect(
      await prisma.activityLog.count({
        where: { targetId: task.id, action: 'TASK_REVIEW_REJECTED' },
      }),
    ).toBe(1);
    expect(
      await prisma.activityLog.count({
        where: { targetId: task.id, action: 'TASK_STATUS_CHANGED' },
      }),
    ).toBe(0);
  });

  it.each(['COMPLETED', 'PENDING_REVIEW'])(
    'rejects stale owner approval/rejection (%s)',
    async (status) => {
      const projectId = await createProjectWithMember();
      const task = await prisma.task.create({
        data: {
          projectId,
          createdById: accounts.owner.id,
          title: '负责人移交',
          status: 'PENDING_REVIEW',
          completionNote: '完成说明',
        },
      });
      const access = app.get(ProjectAccessService);
      const original = access.requirePermission.bind(access);
      const spy = vi.spyOn(access, 'requirePermission').mockImplementationOnce(async (...args) => {
        const snapshot = await original(...args);
        await prisma.$transaction([
          prisma.project.update({
            where: { id: projectId },
            data: { ownerId: accounts.member.id },
          }),
          prisma.projectMember.update({
            where: { projectId_userId: { projectId, userId: accounts.owner.id } },
            data: { role: 'MEMBER' },
          }),
          prisma.projectMember.update({
            where: { projectId_userId: { projectId, userId: accounts.member.id } },
            data: { role: 'OWNER' },
          }),
        ]);
        return snapshot;
      });
      try {
        const response = await request(
          `/projects/${projectId}/tasks/${task.id}/status`,
          'PATCH',
          accounts.owner.token,
          { status, ...(status === 'PENDING_REVIEW' ? { rejectionReason: '需要修改' } : {}) },
        );
        expect(response.status).toBe(403);
        expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
          'PENDING_REVIEW',
        );
        expect(await prisma.activityLog.count({ where: { targetId: task.id } })).toBe(0);
      } finally {
        spy.mockRestore();
      }
    },
  );

  it('rolls back task fields and tags if audit insertion fails', async () => {
    const projectId = await createProjectWithMember();
    const task = await prisma.task.create({
      data: { projectId, createdById: accounts.owner.id, title: '原任务' },
    });
    const tag = await prisma.tag.create({ data: { projectId, name: '原标签', color: '#64748B' } });
    await prisma.taskTag.create({ data: { taskId: task.id, tagId: tag.id } });
    await prisma.$executeRawUnsafe(`CREATE TRIGGER review_audit_failure BEFORE INSERT ON ActivityLog
      WHEN NEW.action = 'TASK_UPDATED' BEGIN SELECT RAISE(ABORT, 'review audit failure'); END`);
    try {
      const response = await request(
        `/projects/${projectId}/tasks/${task.id}`,
        'PATCH',
        accounts.owner.token,
        { title: '不能保存', tagNames: ['不能保存标签'] },
      );
      expect(response.status).toBe(500);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe(
        '原任务',
      );
      const links = await prisma.taskTag.findMany({
        where: { taskId: task.id },
        include: { tag: true },
      });
      expect(links.map((link) => link.tag.name)).toEqual(['原标签']);
      expect(await prisma.tag.count({ where: { projectId, name: '不能保存标签' } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER review_audit_failure');
    }
  });

  it('rejects invalid task payloads without persisting business data', async () => {
    const projectId = await createProjectWithMember();
    for (const invalid of [
      { tagNames: null },
      { assigneeId: '' },
      { requirementId: '' },
      { dueDate: '2026-02-31' },
    ]) {
      const response = await request(`/projects/${projectId}/tasks`, 'POST', accounts.owner.token, {
        title: '非法输入',
        priority: 'MEDIUM',
        ...invalid,
      });
      expect(response.status).toBe(400);
    }
    expect(await prisma.task.count({ where: { projectId } })).toBe(0);
  });

  it('rejects ISO date variants that cannot be converted to a JavaScript date', async () => {
    const projectId = await createProjectWithMember();
    const task = await prisma.task.create({
      data: { projectId, createdById: accounts.owner.id, title: '原任务' },
    });
    for (const dueDate of ['2026-W44', '2026-300', '20261027']) {
      const created = await request(`/projects/${projectId}/tasks`, 'POST', accounts.owner.token, {
        title: '无效日期',
        priority: 'MEDIUM',
        dueDate,
      });
      expect(created.status).toBe(422);
      const updated = await request(
        `/projects/${projectId}/tasks/${task.id}`,
        'PATCH',
        accounts.owner.token,
        { dueDate },
      );
      expect(updated.status).toBe(422);
    }
    expect(await prisma.task.count({ where: { projectId } })).toBe(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).dueDate).toBeNull();
  });

  it('limits members to editing their assigned tasks while allowing standalone reassignment and status updates', async () => {
    const projectId = await createProjectWithMember();
    const task = await prisma.task.create({
      data: {
        projectId,
        createdById: accounts.owner.id,
        assigneeId: accounts.owner.id,
        title: '其他人的任务',
        status: 'TODO',
      },
    });
    const endpoint = `/projects/${projectId}/tasks/${task.id}`;
    expect(
      (await request(endpoint, 'PATCH', accounts.member.token, { title: '越权修改' })).status,
    ).toBe(403);
    expect(
      (
        await request(endpoint, 'PATCH', accounts.member.token, {
          assigneeId: accounts.member.id,
          title: '混合越权',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`${endpoint}/status`, 'PATCH', accounts.member.token, {
          status: 'IN_PROGRESS',
        })
      ).status,
    ).toBe(200);
    expect(
      (await request(endpoint, 'PATCH', accounts.owner.token, { title: '负责人修改' })).status,
    ).toBe(200);
    expect(
      (await request(endpoint, 'PATCH', accounts.member.token, { assigneeId: accounts.member.id }))
        .status,
    ).toBe(200);
    expect(
      (await request(endpoint, 'PATCH', accounts.member.token, { title: '本人修改' })).status,
    ).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe(
      '本人修改',
    );
  });

  it('rechecks the task assignee in the write transaction', async () => {
    const projectId = await createProjectWithMember();
    const task = await prisma.task.create({
      data: {
        projectId,
        createdById: accounts.member.id,
        assigneeId: accounts.member.id,
        title: '原任务',
      },
    });
    const access = app.get(ProjectAccessService);
    const original = access.requirePermission.bind(access);
    const spy = vi.spyOn(access, 'requirePermission').mockImplementationOnce(async (...args) => {
      const snapshot = await original(...args);
      await prisma.task.update({ where: { id: task.id }, data: { assigneeId: accounts.owner.id } });
      return snapshot;
    });
    try {
      const response = await request(
        `/projects/${projectId}/tasks/${task.id}`,
        'PATCH',
        accounts.member.token,
        { title: '不应写入' },
      );
      expect(response.status).toBe(403);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe(
        '原任务',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    ['TODO', 'TODO'],
    ['TODO', 'IN_PROGRESS'],
    ['PENDING_REVIEW', 'PENDING_REVIEW'],
  ])(
    'does not allow status requests to edit another assignee completion note (%s -> %s)',
    async (initialStatus, status) => {
      const projectId = await createProjectWithMember();
      const task = await prisma.task.create({
        data: {
          projectId,
          createdById: accounts.owner.id,
          assigneeId: accounts.owner.id,
          title: '他人说明',
          status: initialStatus,
          completionNote: '原说明',
        },
      });
      const response = await request(
        `/projects/${projectId}/tasks/${task.id}/status`,
        'PATCH',
        accounts.member.token,
        { status, completionNote: '不应保存的说明' },
      );
      expect(response.status).toBe(403);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).completionNote).toBe(
        '原说明',
      );
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        initialStatus,
      );
    },
  );

  const writes = [
    'requirement-create',
    'requirement-update',
    'requirement-delete',
    'task-create',
    'task-update',
    'task-delete',
    'task-status',
  ] as const;
  for (const mutation of ['archive', 'observer', 'remove', 'disable'] as const) {
    it.each(writes)(`rechecks ${mutation} before committing %s`, async (operation) => {
      const projectId = await createProjectWithMember();
      const requirement = await prisma.requirement.create({
        data: {
          projectId,
          creatorId: accounts.owner.id,
          number: 'REQ-001',
          title: '需求',
          acceptanceCriteria: '可验收',
        },
      });
      const task = await prisma.task.create({
        data: {
          projectId,
          createdById: accounts.owner.id,
          title: '任务',
          status: 'PENDING_REVIEW',
          completionNote: '完成说明',
        },
      });
      const access = app.get(ProjectAccessService);
      const original = access.requirePermission.bind(access);
      const spy = vi.spyOn(access, 'requirePermission').mockImplementationOnce(async (...args) => {
        const snapshot = await original(...args);
        if (mutation === 'archive')
          await prisma.project.update({ where: { id: projectId }, data: { status: 'ARCHIVED' } });
        if (mutation === 'observer')
          await prisma.projectMember.update({
            where: { projectId_userId: { projectId, userId: accounts.owner.id } },
            data: { role: 'OBSERVER' },
          });
        if (mutation === 'remove')
          await prisma.projectMember.delete({
            where: { projectId_userId: { projectId, userId: accounts.owner.id } },
          });
        if (mutation === 'disable')
          await prisma.user.update({
            where: { id: accounts.owner.id },
            data: { status: 'DISABLED' },
          });
        return snapshot;
      });
      try {
        const target = operation.startsWith('requirement') ? 'requirements' : 'tasks';
        const id = target === 'requirements' ? requirement.id : task.id;
        const method = operation.endsWith('create')
          ? 'POST'
          : operation.endsWith('delete')
            ? 'DELETE'
            : 'PATCH';
        const suffix =
          method === 'POST' ? '' : `/${id}${operation === 'task-status' ? '/status' : ''}`;
        const payload =
          operation === 'task-status'
            ? { status: 'COMPLETED' }
            : {
                title: '新标题',
                priority: 'MEDIUM',
                ...(target === 'requirements' ? { acceptanceCriteria: '可验收' } : {}),
              };
        const response = await request(
          `/projects/${projectId}/${target}${suffix}`,
          method,
          accounts.owner.token,
          method === 'DELETE' ? undefined : payload,
        );
        expect(response.status).toBe(
          mutation === 'archive'
            ? 409
            : mutation === 'disable'
              ? 401
              : mutation === 'remove'
                ? 404
                : 403,
        );
        expect(await prisma.task.count({ where: { projectId } })).toBe(1);
        expect(await prisma.requirement.count({ where: { projectId } })).toBe(1);
        expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
          'PENDING_REVIEW',
        );
        expect(
          (await prisma.requirement.findUniqueOrThrow({ where: { id: requirement.id } })).title,
        ).toBe('需求');
        expect(
          await prisma.activityLog.count({
            where: { targetId: { in: [task.id, requirement.id] } },
          }),
        ).toBe(0);
      } finally {
        spy.mockRestore();
        if (mutation === 'disable')
          await prisma.user.update({
            where: { id: accounts.owner.id },
            data: { status: 'ACTIVE' },
          });
      }
    });
  }
});
