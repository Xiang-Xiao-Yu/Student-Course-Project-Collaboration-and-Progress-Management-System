import 'reflect-metadata';
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['APP_HOST'] = '127.0.0.1';
  process.env['APP_PORT'] = '3000';
  process.env['DATABASE_URL'] = 'file::memory:';
  process.env['JWT_SECRET'] = globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID();
  process.env['JWT_EXPIRES_IN'] = '15m';
  process.env['CORS_ORIGINS'] = 'http://localhost:5173';
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordHasherService } from '../auth/services/password-hasher.service';

describe('FR-01 administrator disable action with real HTTP and SQLite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const password = randomBytes(24).toString('base64url');

  beforeAll(async () => {
    const directory = mkdtempSync(join(tmpdir(), 'scpc-disable-user-'));
    prisma = new PrismaService({
      datasources: { db: { url: `file:${join(directory, 'test.sqlite').replaceAll('\\', '/')}` } },
    });
    const migrations = resolve(__dirname, '../../../../../prisma/migrations');
    for (const entry of readdirSync(migrations, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      for (const sql of readFileSync(join(migrations, entry.name, 'migration.sql'), 'utf8')
        .split(';')
        .filter((sql) => sql.trim()))
        await prisma.$executeRawUnsafe(sql);
    }
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function request(path: string, method: string, token?: string, body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      payload: (await response.json()) as {
        data: Record<string, unknown>;
        error?: { code: string };
      },
    };
  }
  async function account(admin = false) {
    const username = `disable-${randomBytes(8).toString('hex')}`;
    const registered = await request('/auth/register', 'POST', undefined, {
      username,
      password,
      nickname: '禁用回归账号',
    });
    expect(registered.status).toBe(201);
    const id = registered.payload.data['id'] as string;
    if (admin) await prisma.user.update({ where: { id }, data: { isPlatformAdmin: true } });
    const login = await request('/auth/login', 'POST', undefined, { username, password });
    expect(login.status).toBe(200);
    return { id, username, token: login.payload.data['accessToken'] as string };
  }

  it('lists safe user fields and atomically disables a user with one audit and revoked sessions', async () => {
    const admin = await account(true),
      target = await account();
    const list = await request('/users/admin', 'GET', admin.token);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.payload.data)).not.toMatch(/passwordHash|tokenVersion|accessToken/);
    const profile = await request('/users/me', 'GET', admin.token);
    expect(profile.payload.data['isPlatformAdmin']).toBe(true);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    const result = await request(`/users/${target.id}/disable`, 'POST', admin.token, {
      confirmUsername: target.username,
    });
    expect(result.status).toBe(200);
    expect(result.payload.data).toMatchObject({ id: target.id, status: 'DISABLED' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).tokenVersion).toBe(
      before.tokenVersion + 1,
    );
    expect((await request('/users/me', 'GET', target.token)).status).toBe(401);
    expect(
      (await request('/auth/login', 'POST', undefined, { username: target.username, password }))
        .status,
    ).toBe(403);
    const audits = await prisma.userDisableAudit.findMany({ where: { targetUserId: target.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: admin.id,
      beforeStatus: 'ACTIVE',
      afterStatus: 'DISABLED',
    });
  });
  it('rejects unauthenticated and ordinary callers and protects every administrator', async () => {
    const admin = await account(true),
      ordinary = await account(),
      otherAdmin = await account(true);
    expect((await request('/users/admin', 'GET')).status).toBe(401);
    expect((await request('/users/admin', 'GET', ordinary.token)).status).toBe(403);
    expect(
      (
        await request(`/users/${ordinary.id}/disable`, 'POST', ordinary.token, {
          confirmUsername: ordinary.username,
        })
      ).status,
    ).toBe(403);
    for (const target of [admin, otherAdmin]) {
      expect(
        (
          await request(`/users/${target.id}/disable`, 'POST', admin.token, {
            confirmUsername: target.username,
          })
        ).status,
      ).toBe(409);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
        'ACTIVE',
      );
    }
  });
  it('validates confirmation and missing objects without mutating the target', async () => {
    const admin = await account(true),
      target = await account();
    expect((await request(`/users/${target.id}/disable`, 'POST', admin.token, {})).status).toBe(
      400,
    );
    expect(
      (
        await request(`/users/${target.id}/disable`, 'POST', admin.token, {
          confirmUsername: 'wrong',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request('/users/not-found/disable', 'POST', admin.token, {
          confirmUsername: 'not-found',
        })
      ).status,
    ).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
      'ACTIVE',
    );
  });
  it('keeps concurrent and repeated disable actions idempotent and preserves project history', async () => {
    const admin = await account(true),
      target = await account();
    const project = await prisma.project.create({
      data: {
        name: '历史保留',
        ownerId: target.id,
        members: { create: { userId: target.id, role: 'OWNER' } },
      },
    });
    const action = () =>
      request(`/users/${target.id}/disable`, 'POST', admin.token, {
        confirmUsername: target.username,
      });
    const responses = await Promise.all([action(), action()]);
    expect(responses.map((item) => item.status)).toEqual([200, 200]);
    expect((await action()).status).toBe(200);
    expect(await prisma.userDisableAudit.count({ where: { targetUserId: target.id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).tokenVersion).toBe(
      1,
    );
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    expect(
      await prisma.projectMember.count({ where: { userId: target.id, projectId: project.id } }),
    ).toBe(1);
  });
  it('rejects a password change that overlaps disabling without restoring the session', async () => {
    const admin = await account(true),
      target = await account();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    const hasher = app.get(PasswordHasherService);
    const originalHash = hasher.hash.bind(hasher);
    let entered!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    let release!: () => void;
    const held = new Promise<void>((done) => {
      release = done;
    });
    const spy = vi.spyOn(hasher, 'hash').mockImplementation(async (value) => {
      entered();
      await held;
      return originalHash(value);
    });
    const changing = request('/users/me/password', 'PATCH', target.token, {
      currentPassword: password,
      newPassword: randomBytes(24).toString('base64url'),
    });
    try {
      await started;
      expect(
        (
          await request(`/users/${target.id}/disable`, 'POST', admin.token, {
            confirmUsername: target.username,
          })
        ).status,
      ).toBe(200);
    } finally {
      release();
      spy.mockRestore();
    }
    expect((await changing).status).toBe(401);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
      status: 'DISABLED',
      passwordHash: before.passwordHash,
      tokenVersion: 1,
    });
  });

  it('does not issue a usable session when an in-flight login overlaps disabling', async () => {
    const admin = await account(true),
      target = await account();
    const hasher = app.get(PasswordHasherService);
    const originalVerify = hasher.verify.bind(hasher);
    let entered!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    let release!: () => void;
    const held = new Promise<void>((done) => {
      release = done;
    });
    const spy = vi.spyOn(hasher, 'verify').mockImplementation(async (value, hash) => {
      const valid = await originalVerify(value, hash);
      entered();
      await held;
      return valid;
    });
    const loggingIn = request('/auth/login', 'POST', undefined, {
      username: target.username,
      password,
    });
    try {
      await started;
      expect(
        (
          await request(`/users/${target.id}/disable`, 'POST', admin.token, {
            confirmUsername: target.username,
          })
        ).status,
      ).toBe(200);
    } finally {
      release();
      spy.mockRestore();
    }
    const response = await loggingIn;
    expect(response.status).toBe(200);
    expect(
      (await request('/users/me', 'GET', response.payload.data['accessToken'] as string)).status,
    ).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
      'DISABLED',
    );
  });

  it('rolls back status and session changes when audit storage fails and hides internals', async () => {
    const admin = await account(true),
      target = await account();
    await prisma.$executeRawUnsafe(
      "CREATE TRIGGER fail_disable_audit BEFORE INSERT ON UserDisableAudit BEGIN SELECT RAISE(ABORT, 'private-audit-database-error'); END",
    );
    try {
      const result = await request(`/users/${target.id}/disable`, 'POST', admin.token, {
        confirmUsername: target.username,
      });
      expect(result.status).toBe(500);
      expect(JSON.stringify(result.payload)).not.toMatch(
        /private-audit|Prisma|stack|passwordHash|tokenVersion/,
      );
      expect(await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
        status: 'ACTIVE',
        tokenVersion: 0,
      });
      expect(await prisma.userDisableAudit.count({ where: { targetUserId: target.id } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_disable_audit');
    }
  });
});
