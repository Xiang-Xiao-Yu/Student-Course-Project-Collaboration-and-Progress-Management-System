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

interface RegisterEnvelope {
  data: { id: string };
}

interface LoginEnvelope {
  data: { accessToken: string };
}

interface ProjectEnvelope {
  data: { id: string };
}

interface MeetingEnvelope {
  data: {
    actionCount: number;
    actions: Array<{
      convertedTaskId: string | null;
      id: string;
      status: string;
      title: string;
    }>;
    agenda: string | null;
    decisions: string | null;
    createdBy: {
      id: string;
      nickname: string;
      userId: string;
      username: string;
    };
    id: string;
    minutes: string | null;
    participantCount: number;
    participants: Array<{ id: string; nickname: string; userId: string; username: string }>;
    scheduledAt: string;
    title: string;
  };
}

interface MeetingListEnvelope {
  data: MeetingEnvelope['data'][];
}

interface MeetingActionEnvelope {
  data: {
    assigneeId: string | null;
    convertedTaskId: string | null;
    dueDate: string | null;
    id: string;
    status: string;
    title: string;
  };
}

interface ConversionEnvelope {
  data: {
    action: MeetingActionEnvelope['data'];
    convertedTaskId: string | null;
    id: string;
    task: {
      assigneeId: string | null;
      dueDate: string | null;
      id: string;
      priority: string;
      projectId: string;
      requirementId: string | null;
      status: string;
      title: string;
    };
    title: string;
  };
}

interface AcceptanceEnvelope {
  data: {
    acceptanceDate: string | null;
    failureReason: string | null;
    goal: string | null;
    id: string;
    participants: Array<{ id: string; nickname: string; userId: string; username: string }>;
    remediationTaskCount: number;
    remediationTasks: Array<{ id: string; status: string; title: string }>;
    result: string;
    stageName: string;
    standards: string;
  };
}

interface AcceptanceListEnvelope {
  data: AcceptanceEnvelope['data'][];
}

interface TaskEnvelope {
  data: {
    acceptanceId: string | null;
    id: string;
    title: string;
  };
}

describe('P5 meetings and acceptances with SQLite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let testDirectory: string;
  const password = 'p5-test-password';
  const accounts: Record<
    'owner' | 'member' | 'outsider' | 'observer',
    { id: string; token: string; username: string }
  > = {} as never;

  beforeAll(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'scpc-p5-integration-'));
    const databasePath = join(testDirectory, 'p5.db');
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

  async function createProject(): Promise<string> {
    const created = await request('/projects', 'POST', accounts.owner.token, {
      endDate: '2026-12-31T00:00:00.000Z',
      name: 'P5 project ' + Date.now(),
      startDate: '2026-11-01T00:00:00.000Z',
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

  it('manages meetings and actions, converts once, and blocks paused-project creation', async () => {
    const projectId = await createProject();
    const meetingsPath = '/projects/' + projectId + '/meetings';

    const emptyTitle = await request(meetingsPath, 'POST', accounts.owner.token, {
      scheduledAt: '2026-11-10T02:00:00.000Z',
      title: '   ',
    });
    expect(emptyTitle.status).toBe(400);

    const observerCreate = await request(meetingsPath, 'POST', accounts.observer.token, {
      scheduledAt: '2026-11-10T02:00:00.000Z',
      title: '观察者不能创建',
    });
    expect(observerCreate.status).toBe(403);

    const created = await request(meetingsPath, 'POST', accounts.member.token, {
      agenda: '确认阶段目标和风险',
      decisions: '先完成核心流程',
      minutes: '成员负责实现，负责人验收',
      participantIds: [accounts.owner.id, accounts.member.id],
      scheduledAt: '2026-11-10T02:00:00.000Z',
      title: 'P5 阶段会议',
    });
    expect(created.status).toBe(201);
    const meeting = (await created.json()) as MeetingEnvelope;
    expect(meeting.data).toMatchObject({
      actionCount: 0,
      agenda: '确认阶段目标和风险',
      createdBy: {
        id: accounts.member.id,
        nickname: 'member',
        userId: accounts.member.id,
        username: accounts.member.username,
      },
      decisions: '先完成核心流程',
      minutes: '成员负责实现，负责人验收',
      participantCount: 2,
      title: 'P5 阶段会议',
    });
    expect(meeting.data.participants.map((participant) => participant.id).sort()).toEqual(
      [accounts.owner.id, accounts.member.id].sort(),
    );
    expect(meeting.data.participants.map((participant) => participant.userId).sort()).toEqual(
      [accounts.owner.id, accounts.member.id].sort(),
    );

    const meetingEdit = await request(
      meetingsPath + '/' + meeting.data.id,
      'PATCH',
      accounts.member.token,
      {
        participantIds: meeting.data.participants.map((participant) => participant.userId),
      },
    );
    expect(meetingEdit.status).toBe(200);
    expect(
      ((await meetingEdit.json()) as MeetingEnvelope).data.participants
        .map((participant) => participant.userId)
        .sort(),
    ).toEqual([accounts.owner.id, accounts.member.id].sort());

    const observerDetail = await request(
      meetingsPath + '/' + meeting.data.id,
      'GET',
      accounts.observer.token,
    );
    expect(observerDetail.status).toBe(200);
    const outsiderDetail = await request(
      meetingsPath + '/' + meeting.data.id,
      'GET',
      accounts.outsider.token,
    );
    expect(outsiderDetail.status).toBe(404);

    const actionsPath = meetingsPath + '/' + meeting.data.id + '/actions';
    const invalidAssignee = await request(actionsPath, 'POST', accounts.member.token, {
      assigneeId: accounts.outsider.id,
      title: '非法行动项',
    });
    expect(invalidAssignee.status).toBe(422);
    expect(((await invalidAssignee.json()) as ErrorEnvelope).error?.code).toBe(
      'MEETING_ACTION_ASSIGNEE_INVALID',
    );

    const earlyDueDate = await request(actionsPath, 'POST', accounts.member.token, {
      assigneeId: accounts.member.id,
      dueDate: '2026-10-31T00:00:00.000Z',
      title: '截止日期过早',
    });
    expect(earlyDueDate.status).toBe(422);
    expect(((await earlyDueDate.json()) as ErrorEnvelope).error?.code).toBe(
      'MEETING_ACTION_DUE_DATE_INVALID',
    );

    const actionResponse = await request(actionsPath, 'POST', accounts.member.token, {
      assigneeId: accounts.member.id,
      dueDate: '2026-11-20T00:00:00.000Z',
      title: '补齐阶段验收',
    });
    expect(actionResponse.status).toBe(201);
    const action = (await actionResponse.json()) as MeetingActionEnvelope;
    expect(action.data).toMatchObject({
      assigneeId: accounts.member.id,
      convertedTaskId: null,
      status: 'PENDING',
      title: '补齐阶段验收',
    });

    const actionPath = actionsPath + '/' + action.data.id;
    const completed = await request(actionPath, 'PATCH', accounts.member.token, {
      status: 'COMPLETED',
    });
    expect(completed.status).toBe(200);
    expect(((await completed.json()) as MeetingActionEnvelope).data.status).toBe('COMPLETED');

    const conversion = await request(actionPath + '/convert', 'POST', accounts.member.token, {
      description: '由会议行动项生成',
      priority: 'HIGH',
    });
    expect(conversion.status).toBe(200);
    const converted = (await conversion.json()) as ConversionEnvelope;
    expect(converted.data.action.convertedTaskId).toBe(converted.data.task.id);
    expect(converted.data).toMatchObject({
      convertedTaskId: converted.data.task.id,
      id: converted.data.action.id,
      title: '补齐阶段验收',
    });
    expect(converted.data.task).toMatchObject({
      assigneeId: accounts.member.id,
      dueDate: '2026-11-20T00:00:00.000Z',
      priority: 'HIGH',
      projectId,
      title: '补齐阶段验收',
    });
    expect(
      await prisma.task.findUnique({
        select: { description: true, dueDate: true },
        where: { id: converted.data.task.id },
      }),
    ).toMatchObject({
      description: '由会议行动项生成',
      dueDate: new Date('2026-11-20T00:00:00.000Z'),
    });

    const duplicateConversion = await request(
      actionPath + '/convert',
      'POST',
      accounts.member.token,
      { priority: 'LOW' },
    );
    expect(duplicateConversion.status).toBe(409);
    expect(((await duplicateConversion.json()) as ErrorEnvelope).error?.code).toBe(
      'MEETING_ACTION_ALREADY_CONVERTED',
    );

    const meetingAfterConversion = await request(
      meetingsPath + '/' + meeting.data.id,
      'GET',
      accounts.owner.token,
    );
    const detail = ((await meetingAfterConversion.json()) as MeetingEnvelope).data;
    expect(detail.actionCount).toBe(1);
    expect(detail.actions[0]).toMatchObject({
      convertedTaskId: converted.data.task.id,
      status: 'COMPLETED',
    });
    const list = await request(meetingsPath, 'GET', accounts.observer.token);
    expect(list.status).toBe(200);
    const meetingList = ((await list.json()) as MeetingListEnvelope).data;
    expect(meetingList).toHaveLength(1);
    expect(meetingList[0]?.createdBy).toMatchObject({
      id: accounts.member.id,
      userId: accounts.member.id,
    });

    expect(await prisma.activityLog.count({ where: { projectId, targetType: 'MEETING' } })).toBe(2);
    expect(
      await prisma.activityLog.count({ where: { projectId, targetType: 'MEETING_ACTION' } }),
    ).toBe(3);

    const active = await request(
      '/projects/' + projectId + '/status',
      'PATCH',
      accounts.owner.token,
      {
        status: 'ACTIVE',
      },
    );
    const paused = await request(
      '/projects/' + projectId + '/status',
      'PATCH',
      accounts.owner.token,
      {
        status: 'PAUSED',
      },
    );
    expect(active.status).toBe(200);
    expect(paused.status).toBe(200);

    const pausedMeeting = await request(meetingsPath, 'POST', accounts.owner.token, {
      scheduledAt: '2026-11-12T02:00:00.000Z',
      title: '暂停后不能创建会议',
    });
    expect(pausedMeeting.status).toBe(409);
    expect(((await pausedMeeting.json()) as ErrorEnvelope).error?.code).toBe('PROJECT_PAUSED');

    const pausedAcceptance = await request(
      '/projects/' + projectId + '/acceptances',
      'POST',
      accounts.owner.token,
      {
        result: 'NOT_STARTED',
        stageName: '暂停阶段',
        standards: '不应创建',
      },
    );
    expect(pausedAcceptance.status).toBe(409);
    expect(((await pausedAcceptance.json()) as ErrorEnvelope).error?.code).toBe('PROJECT_PAUSED');
  });

  it('records failed acceptance, remediation tasks, and a later result', async () => {
    const projectId = await createProject();
    const acceptancesPath = '/projects/' + projectId + '/acceptances';

    const emptyTitle = await request(acceptancesPath, 'POST', accounts.owner.token, {
      result: 'NOT_STARTED',
      stageName: '   ',
      standards: '阶段标准',
    });
    expect(emptyTitle.status).toBe(400);

    const memberCreate = await request(acceptancesPath, 'POST', accounts.member.token, {
      result: 'NOT_STARTED',
      stageName: '成员不能管理',
      standards: '阶段标准',
    });
    expect(memberCreate.status).toBe(403);

    const missingReason = await request(acceptancesPath, 'POST', accounts.owner.token, {
      acceptanceDate: '2026-11-15T02:00:00.000Z',
      participantIds: [accounts.member.id],
      result: 'FAILED',
      stageName: '第一阶段验收',
      standards: '核心流程可运行',
    });
    expect(missingReason.status).toBe(422);
    expect(((await missingReason.json()) as ErrorEnvelope).error?.code).toBe(
      'ACCEPTANCE_FAILURE_REASON_REQUIRED',
    );

    const invalidParticipant = await request(acceptancesPath, 'POST', accounts.owner.token, {
      failureReason: '外部人员不能参与',
      participantIds: [accounts.outsider.id],
      result: 'FAILED',
      stageName: '非法参与人员',
      standards: '阶段标准',
    });
    expect(invalidParticipant.status).toBe(422);
    expect(((await invalidParticipant.json()) as ErrorEnvelope).error?.code).toBe(
      'ACCEPTANCE_PARTICIPANT_INVALID',
    );

    const created = await request(acceptancesPath, 'POST', accounts.owner.token, {
      acceptanceDate: '2026-11-15T02:00:00.000Z',
      failureReason: '整改任务尚未闭环',
      goal: '验证核心协作闭环',
      participantIds: [accounts.member.id],
      result: 'FAILED',
      stageName: '第一阶段验收',
      standards: '核心流程可运行',
    });
    expect(created.status).toBe(201);
    const acceptance = (await created.json()) as AcceptanceEnvelope;
    expect(acceptance.data).toMatchObject({
      acceptanceDate: '2026-11-15T02:00:00.000Z',
      failureReason: '整改任务尚未闭环',
      goal: '验证核心协作闭环',
      remediationTaskCount: 0,
      result: 'FAILED',
      stageName: '第一阶段验收',
      standards: '核心流程可运行',
    });
    expect(acceptance.data.participants).toEqual([
      expect.objectContaining({ id: accounts.member.id, userId: accounts.member.id }),
    ]);

    const memberDetail = await request(
      acceptancesPath + '/' + acceptance.data.id,
      'GET',
      accounts.member.token,
    );
    expect(memberDetail.status).toBe(200);
    const observerList = await request(acceptancesPath, 'GET', accounts.observer.token);
    expect(observerList.status).toBe(200);
    const acceptanceList = ((await observerList.json()) as AcceptanceListEnvelope).data;
    expect(acceptanceList).toHaveLength(1);
    expect(acceptanceList[0]?.participants).toEqual([
      expect.objectContaining({ id: accounts.member.id, userId: accounts.member.id }),
    ]);
    const outsiderDetail = await request(
      acceptancesPath + '/' + acceptance.data.id,
      'GET',
      accounts.outsider.token,
    );
    expect(outsiderDetail.status).toBe(404);

    const remediation = await request(
      '/projects/' + projectId + '/tasks',
      'POST',
      accounts.member.token,
      {
        acceptanceId: acceptance.data.id,
        assigneeId: accounts.member.id,
        dueDate: '2026-11-25T00:00:00.000Z',
        priority: 'HIGH',
        title: '完成整改任务',
      },
    );
    expect(remediation.status).toBe(201);
    const remediationTask = (await remediation.json()) as TaskEnvelope;
    expect(remediationTask.data).toMatchObject({
      acceptanceId: acceptance.data.id,
      title: '完成整改任务',
    });

    const failedDetail = await request(
      acceptancesPath + '/' + acceptance.data.id,
      'GET',
      accounts.owner.token,
    );
    const failedData = ((await failedDetail.json()) as AcceptanceEnvelope).data;
    expect(failedData.remediationTaskCount).toBe(1);
    expect(failedData.remediationTasks).toEqual([
      expect.objectContaining({
        id: remediationTask.data.id,
        status: 'BACKLOG',
        title: '完成整改任务',
      }),
    ]);

    const passed = await request(
      acceptancesPath + '/' + acceptance.data.id,
      'PATCH',
      accounts.owner.token,
      {
        participantIds: acceptance.data.participants.map((participant) => participant.userId),
        result: 'PASSED',
      },
    );
    expect(passed.status).toBe(200);
    const passedData = ((await passed.json()) as AcceptanceEnvelope).data;
    expect(passedData.result).toBe('PASSED');
    expect(passedData.failureReason).toBeNull();
    expect(passedData.remediationTaskCount).toBe(1);

    const invalidRemediation = await request(
      '/projects/' + projectId + '/tasks',
      'POST',
      accounts.member.token,
      {
        acceptanceId: acceptance.data.id,
        priority: 'LOW',
        title: '通过后不能新增整改任务',
      },
    );
    expect(invalidRemediation.status).toBe(422);
    expect(((await invalidRemediation.json()) as ErrorEnvelope).error?.code).toBe(
      'ACCEPTANCE_REMEDIATION_INVALID',
    );

    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'asc' },
      select: { action: true },
      where: { projectId, targetType: 'ACCEPTANCE' },
    });
    expect(logs.map((log) => log.action)).toEqual([
      'ACCEPTANCE_CREATED',
      'ACCEPTANCE_RESULT_RECORDED',
    ]);
  });

  it('revalidates action due dates against the current project start before conversion', async () => {
    const projectId = await createProject();
    const meetingsPath = '/projects/' + projectId + '/meetings';
    const createdMeeting = await request(meetingsPath, 'POST', accounts.owner.token, {
      participantIds: [accounts.member.id],
      scheduledAt: '2026-11-20T02:00:00.000Z',
      title: '截止日期规则回归会议',
    });
    expect(createdMeeting.status).toBe(201);
    const meeting = (await createdMeeting.json()) as MeetingEnvelope;
    const actionsPath = meetingsPath + '/' + meeting.data.id + '/actions';
    const createdAction = await request(actionsPath, 'POST', accounts.owner.token, {
      assigneeId: accounts.member.id,
      dueDate: '2026-11-10T00:00:00.000Z',
      title: '项目开始日期后移后转换',
    });
    expect(createdAction.status).toBe(201);
    const action = (await createdAction.json()) as MeetingActionEnvelope;

    const movedProject = await request('/projects/' + projectId, 'PATCH', accounts.owner.token, {
      startDate: '2026-11-15T00:00:00.000Z',
    });
    expect(movedProject.status).toBe(200);

    const regularTask = await request(
      '/projects/' + projectId + '/tasks',
      'POST',
      accounts.member.token,
      {
        dueDate: '2026-11-10T00:00:00.000Z',
        priority: 'MEDIUM',
        title: '普通任务同样拒绝过早日期',
      },
    );
    expect(regularTask.status).toBe(422);
    expect(((await regularTask.json()) as ErrorEnvelope).error?.code).toBe('TASK_DUE_DATE_INVALID');

    const conversion = await request(
      actionsPath + '/' + action.data.id + '/convert',
      'POST',
      accounts.owner.token,
      { priority: 'MEDIUM' },
    );
    expect(conversion.status).toBe(422);
    expect(((await conversion.json()) as ErrorEnvelope).error?.code).toBe(
      'MEETING_ACTION_DUE_DATE_INVALID',
    );
    expect(
      await prisma.task.count({
        where: { projectId, title: '项目开始日期后移后转换' },
      }),
    ).toBe(0);
    expect(
      await prisma.meetingAction.findUnique({
        select: { convertedTaskId: true },
        where: { id: action.data.id },
      }),
    ).toEqual({ convertedTaskId: null });
  });
});
