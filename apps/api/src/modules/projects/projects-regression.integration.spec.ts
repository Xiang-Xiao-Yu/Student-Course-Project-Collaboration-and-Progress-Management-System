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

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AvatarStorageService } from '../users/avatar-storage.service';
import { ProjectsRepository } from './repositories/projects.repository';

interface RegisterEnvelope {
  data: { id: string };
}

interface LoginEnvelope {
  data: { accessToken: string };
}

interface ProjectEnvelope {
  data: { id: string; name: string };
}

interface MemberEnvelope {
  data: Array<{
    avatarUrl: string | null;
    userId: string;
  }>;
}

describe('P2 project regressions with SQLite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repository: ProjectsRepository;
  let storage: AvatarStorageService;
  let baseUrl: string;
  let testDirectory: string;
  let databasePath: string;
  const password = 'project-test-password';
  const accounts: Record<
    'admin' | 'owner' | 'memberB' | 'memberC' | 'observer' | 'outsider',
    { id: string; token: string; username: string }
  > = {} as never;

  beforeAll(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'scpc-project-regression-'));
    databasePath = join(testDirectory, 'projects.db');
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
    repository = new ProjectsRepository(prisma);
    storage = app.get(AvatarStorageService);

    for (const name of ['admin', 'owner', 'memberB', 'memberC', 'observer', 'outsider'] as const) {
      accounts[name] = await createAccount(name);
    }
    await prisma.user.update({
      data: { isPlatformAdmin: true },
      where: { id: accounts.admin.id },
    });
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
    name: 'admin' | 'owner' | 'memberB' | 'memberC' | 'observer' | 'outsider',
  ): Promise<{ id: string; token: string; username: string }> {
    const username = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registration = await request('/auth/register', 'POST', undefined, {
      nickname: name,
      password,
      username,
    });
    expect(registration.status).toBe(201);
    const registered = (await registration.json()) as RegisterEnvelope;
    const login = await request('/auth/login', 'POST', undefined, {
      password,
      username,
    });
    expect(login.status).toBe(200);
    const session = (await login.json()) as LoginEnvelope;

    return {
      id: registered.data.id,
      token: session.data.accessToken,
      username,
    };
  }

  async function createProjectWithMembers(name: string): Promise<string> {
    const response = await request('/projects', 'POST', accounts.owner.token, {
      endDate: '2026-12-31',
      name,
      startDate: '2026-10-21',
    });
    expect(response.status).toBe(201);
    const project = (await response.json()) as ProjectEnvelope;

    for (const [account, role] of [
      [accounts.memberB, 'MEMBER'],
      [accounts.memberC, 'MEMBER'],
      [accounts.observer, 'OBSERVER'],
    ] as const) {
      const invitation = await request(
        `/projects/${project.data.id}/members`,
        'POST',
        accounts.owner.token,
        { role, username: account.username },
      );
      expect(invitation.status).toBe(201);
    }

    return project.data.id;
  }

  it('serializes stale owner transfers and preserves exactly one OWNER', async () => {
    const projectId = await createProjectWithMembers('并发负责人转移');

    await repository.transferOwnership(
      projectId,
      accounts.admin.id,
      accounts.owner.id,
      accounts.memberB.id,
    );

    await expect(
      repository.transferOwnership(
        projectId,
        accounts.admin.id,
        accounts.owner.id,
        accounts.memberC.id,
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });

    await expect(
      repository.transferOwnership(
        projectId,
        accounts.owner.id,
        accounts.owner.id,
        accounts.memberC.id,
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const owners = await prisma.projectMember.findMany({
      where: { projectId, role: 'OWNER' },
    });

    expect(owners).toHaveLength(1);
    expect(owners[0]?.userId).toBe(project.ownerId);
    expect(project.ownerId).toBe(accounts.memberB.id);
  });

  it('rejects null project fields and keeps audit values aligned with storage', async () => {
    const projectId = await createProjectWithMembers('空值校验');

    for (const field of ['name', 'description', 'startDate', 'endDate'] as const) {
      const response = await request(`/projects/${projectId}`, 'PATCH', accounts.owner.token, {
        [field]: null,
      });
      expect(response.status).toBe(400);
    }

    const update = await request(`/projects/${projectId}`, 'PATCH', accounts.owner.token, {
      description: '',
    });
    expect(update.status).toBe(200);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const activity = await prisma.activityLog.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { action: 'PROJECT_UPDATED', projectId },
    });

    expect(project.description).toBe('');
    expect(JSON.parse(activity.afterValue ?? '{}')).toMatchObject({ description: '' });
  });

  it('returns safe member avatars for none, HTTP and uploaded references', async () => {
    const projectId = await createProjectWithMembers('成员头像');
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('test-avatar'),
    ]);
    const uploadedReference = await storage.store(accounts.observer.id, {
      buffer: png,
      mimetype: 'image/png',
      size: png.length,
    });

    await prisma.user.update({
      data: { avatarUrl: 'https://example.com/avatar.png' },
      where: { id: accounts.memberB.id },
    });
    await prisma.user.update({
      data: { avatarUrl: uploadedReference },
      where: { id: accounts.observer.id },
    });

    const membersResponse = await request(
      `/projects/${projectId}/members`,
      'GET',
      accounts.owner.token,
    );
    expect(membersResponse.status).toBe(200);
    const members = (await membersResponse.json()) as MemberEnvelope;

    expect(members.data.find((member) => member.userId === accounts.memberB.id)?.avatarUrl).toBe(
      'https://example.com/avatar.png',
    );
    expect(members.data.find((member) => member.userId === accounts.memberC.id)?.avatarUrl).toBe(
      null,
    );
    expect(
      members.data.find((member) => member.userId === accounts.observer.id)?.avatarUrl,
    ).toMatch(/^data:image\/png;base64,/);

    const outsiderResponse = await request(
      `/projects/${projectId}/members`,
      'GET',
      accounts.outsider.token,
    );
    expect(outsiderResponse.status).toBe(404);

    await storage.remove(accounts.observer.id, uploadedReference);
  });
});
