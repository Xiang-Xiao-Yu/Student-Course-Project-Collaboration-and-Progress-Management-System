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
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import type { AvatarUploadFile } from '../users/avatar-storage.service';
import { AvatarStorageService } from '../users/avatar-storage.service';
import { PrismaService } from '../../prisma/prisma.service';

interface Account {
  readonly token: string;
  readonly userId: string;
  readonly username: string;
}

interface ProjectResponse {
  readonly endDate: string | null;
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly startDate: string | null;
  readonly status: string;
}

interface MemberResponse {
  readonly avatarUrl: string | null;
  readonly nickname: string;
  readonly role: string;
  readonly userId: string;
  readonly username: string;
}

interface SuccessBody<T> {
  readonly data: T;
}

interface FailureBody {
  readonly error: { readonly code: string };
}

class IsolatedAvatarStorageService extends AvatarStorageService {
  constructor(private readonly storageRoot: string) {
    super();
  }

  override store(userId: string, file: AvatarUploadFile): Promise<string> {
    return super.store(userId, file, this.storageRoot);
  }

  override toDataUrl(userId: string, avatarUrl: string | null): Promise<string | null> {
    return super.toDataUrl(userId, avatarUrl, this.storageRoot);
  }

  override remove(userId: string, avatarUrl: string | null): Promise<void> {
    return super.remove(userId, avatarUrl, this.storageRoot);
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('P2 project and member API with isolated SQLite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let avatarStorage: IsolatedAvatarStorageService;
  let baseUrl: string;
  let testDirectory: string;
  let databasePath: string;
  const storedAvatars: Array<{ readonly reference: string; readonly userId: string }> = [];

  beforeAll(async () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'scpc-p2-http-'));
    databasePath = join(testDirectory, 'p2-http.db');
    prisma = new PrismaService({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, '/')}` } },
    });

    const migrationsPath = resolve(__dirname, '../../../../../prisma/migrations');
    for (const entry of readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const sql = readFileSync(resolve(migrationsPath, entry.name, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter((statement) => statement.trim())) {
        await prisma.$executeRawUnsafe(statement);
      }
    }

    avatarStorage = new IsolatedAvatarStorageService(join(testDirectory, 'avatars'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AvatarStorageService)
      .useValue(avatarStorage)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const avatar of storedAvatars) {
      await avatarStorage?.remove(avatar.userId, avatar.reference);
    }
    await app?.close();
    await prisma?.$disconnect();
    if (testDirectory && existsSync(testDirectory)) {
      rmSync(testDirectory, { force: true, recursive: true });
    }
  });

  async function request(
    path: string,
    method: string,
    token?: string,
    body?: unknown,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function createAccount(label: string): Promise<Account> {
    const username = `p2-${label}-${randomUUID()}`;
    const password = 'p2-test-password-123';
    const registration = await request('/auth/register', 'POST', undefined, {
      nickname: label,
      password,
      username,
    });
    expect(registration.status).toBe(201);

    const login = await request('/auth/login', 'POST', undefined, { password, username });
    expect(login.status).toBe(200);
    const { data } = (await login.json()) as SuccessBody<{ accessToken: string }>;
    const user = await prisma.user.findUniqueOrThrow({
      select: { id: true },
      where: { username },
    });

    return { token: data.accessToken, userId: user.id, username };
  }

  async function createProject(
    owner: Account,
    name: string,
    dates?: { readonly endDate: string; readonly startDate: string },
  ): Promise<ProjectResponse> {
    const response = await request('/projects', 'POST', owner.token, {
      name,
      ...dates,
    });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as SuccessBody<ProjectResponse>;
    return data;
  }

  async function invite(
    owner: Account,
    projectId: string,
    member: Account,
    role: 'MEMBER' | 'OBSERVER',
  ): Promise<void> {
    const response = await request(`/projects/${projectId}/members`, 'POST', owner.token, {
      role,
      username: member.username,
    });
    expect(response.status).toBe(201);
  }

  it('creates a dated project, invites two roles, resolves member avatars, and hides non-member projects', async () => {
    const owner = await createAccount('负责人');
    const member = await createAccount('成员');
    const observer = await createAccount('观察者');
    const outsider = await createAccount('旁观者');
    const project = await createProject(owner, 'P2 HTTP 项目', {
      endDate: '2026-10-25',
      startDate: '2026-10-25',
    });

    await invite(owner, project.id, member, 'MEMBER');
    await invite(owner, project.id, observer, 'OBSERVER');

    const uploadedReference = await avatarStorage.store(member.userId, {
      buffer: PNG_SIGNATURE,
      mimetype: 'image/png',
      size: PNG_SIGNATURE.length,
    });
    storedAvatars.push({ reference: uploadedReference, userId: member.userId });
    await prisma.user.update({
      data: { avatarUrl: uploadedReference },
      where: { id: member.userId },
    });
    await prisma.user.update({
      data: { avatarUrl: 'https://example.test/avatar.png' },
      where: { id: observer.userId },
    });

    const memberProjectsResponse = await request('/projects', 'GET', member.token);
    const memberProjects = (await memberProjectsResponse.json()) as SuccessBody<ProjectResponse[]>;
    expect(memberProjectsResponse.status).toBe(200);
    expect(memberProjects.data.map(({ id }) => id)).toEqual([project.id]);

    const observerProjectResponse = await request(`/projects/${project.id}`, 'GET', observer.token);
    const observerProject = (await observerProjectResponse.json()) as SuccessBody<ProjectResponse>;
    expect(observerProjectResponse.status).toBe(200);
    expect(observerProject.data.id).toBe(project.id);

    const membersResponse = await request(`/projects/${project.id}/members`, 'GET', owner.token);
    const members = (await membersResponse.json()) as SuccessBody<MemberResponse[]>;
    const uploadedMember = members.data.find(({ userId }) => userId === member.userId);
    const remoteAvatarMember = members.data.find(({ userId }) => userId === observer.userId);
    const ownerMember = members.data.find(({ userId }) => userId === owner.userId);

    expect(membersResponse.status).toBe(200);
    expect(uploadedMember?.avatarUrl).toMatch(/^data:image\/png;base64,/);
    expect(remoteAvatarMember?.avatarUrl).toBe('https://example.test/avatar.png');
    expect(ownerMember?.avatarUrl).toBeNull();

    const outsiderProjectsResponse = await request('/projects', 'GET', outsider.token);
    const outsiderProjects = (await outsiderProjectsResponse.json()) as SuccessBody<
      ProjectResponse[]
    >;
    const outsiderProjectResponse = await request(`/projects/${project.id}`, 'GET', outsider.token);

    expect(outsiderProjectsResponse.status).toBe(200);
    expect(outsiderProjects.data).toEqual([]);
    expect(outsiderProjectResponse.status).toBe(404);
  });

  it('rejects null dates and exercises project date and pause/resume boundaries', async () => {
    const owner = await createAccount('日期边界');
    const project = await createProject(owner, '相同日期项目', {
      endDate: '2026-10-25',
      startDate: '2026-10-25',
    });

    const nullDate = await request(`/projects/${project.id}`, 'PATCH', owner.token, {
      startDate: null,
    });
    const nullDateBody = (await nullDate.json()) as FailureBody;
    const storedProject = await prisma.project.findUniqueOrThrow({
      select: { startDate: true },
      where: { id: project.id },
    });
    expect(nullDate.status).toBe(400);
    expect(nullDateBody.error.code).toBe('VALIDATION_FAILED');
    expect(storedProject.startDate?.toISOString()).toBe('2026-10-25T00:00:00.000Z');

    const invalidRange = await request('/projects', 'POST', owner.token, {
      endDate: '2026-10-24',
      name: '倒序日期项目',
      startDate: '2026-10-25',
    });
    expect(invalidRange.status).toBe(422);
    expect(((await invalidRange.json()) as FailureBody).error.code).toBe(
      'PROJECT_DATE_RANGE_INVALID',
    );

    const invalidTransition = await request(
      `/projects/${project.id}/status`,
      'PATCH',
      owner.token,
      {
        status: 'PAUSED',
      },
    );
    expect(invalidTransition.status).toBe(422);
    expect(((await invalidTransition.json()) as FailureBody).error.code).toBe(
      'PROJECT_STATUS_TRANSITION_INVALID',
    );

    for (const status of ['ACTIVE', 'PAUSED', 'ACTIVE']) {
      const response = await request(`/projects/${project.id}/status`, 'PATCH', owner.token, {
        status,
      });
      expect(response.status).toBe(200);
    }
  });

  it('enforces member and observer permissions and keeps a removal activity record', async () => {
    const owner = await createAccount('权限负责人');
    const member = await createAccount('权限成员');
    const observer = await createAccount('权限观察者');
    const project = await createProject(owner, '权限隔离项目');
    await invite(owner, project.id, member, 'MEMBER');
    await invite(owner, project.id, observer, 'OBSERVER');

    const memberDelete = await request(`/projects/${project.id}`, 'DELETE', member.token, {
      confirmName: project.name,
    });
    const observerUpdate = await request(`/projects/${project.id}`, 'PATCH', observer.token, {
      name: '观察者修改',
    });
    const observerRoleUpdate = await request(
      `/projects/${project.id}/members/${member.userId}`,
      'PATCH',
      observer.token,
      { role: 'OBSERVER' },
    );
    const selfRemoval = await request(
      `/projects/${project.id}/members/${owner.userId}`,
      'DELETE',
      owner.token,
    );

    expect(memberDelete.status).toBe(403);
    expect(observerUpdate.status).toBe(403);
    expect(observerRoleUpdate.status).toBe(403);
    expect(selfRemoval.status).toBe(409);

    const removal = await request(
      `/projects/${project.id}/members/${member.userId}`,
      'DELETE',
      owner.token,
    );
    expect(removal.status).toBe(200);
    expect(
      await prisma.activityLog.count({
        where: { action: 'PROJECT_MEMBER_REMOVED', projectId: project.id, targetId: member.userId },
      }),
    ).toBe(1);
    expect(
      await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: member.userId } },
      }),
    ).toBeNull();
    expect((await request(`/projects/${project.id}`, 'GET', member.token)).status).toBe(404);
  });

  it('records deletion snapshots only after confirmed, authorized deletion', async () => {
    const owner = await createAccount('审计负责人');
    const member = await createAccount('审计成员');
    const project = await createProject(owner, '删除审计 HTTP 项目');
    await invite(owner, project.id, member, 'MEMBER');

    const wrongConfirmation = await request(`/projects/${project.id}`, 'DELETE', owner.token, {
      confirmName: '错误名称',
    });
    const forbiddenDeletion = await request(`/projects/${project.id}`, 'DELETE', member.token, {
      confirmName: project.name,
    });
    expect(wrongConfirmation.status).toBe(422);
    expect(forbiddenDeletion.status).toBe(403);
    expect(await prisma.projectDeletionAudit.count({ where: { projectId: project.id } })).toBe(0);

    const deletion = await request(`/projects/${project.id}`, 'DELETE', owner.token, {
      confirmName: project.name,
    });
    expect(deletion.status).toBe(200);
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    const audit = await prisma.projectDeletionAudit.findFirstOrThrow({
      where: { projectId: project.id },
    });
    expect(audit).toMatchObject({
      actorId: owner.userId,
      actorUsername: owner.username,
      projectId: project.id,
      projectName: project.name,
      projectStatus: 'PLANNING',
    });
    expect(Number.isNaN(audit.deletedAt.getTime())).toBe(false);
  });
});
