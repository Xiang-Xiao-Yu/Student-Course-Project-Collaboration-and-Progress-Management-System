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
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { PasswordHasherService } from './modules/auth/services/password-hasher.service';
import { PrismaService } from './prisma/prisma.service';

interface TokenEnvelope {
  data: { accessToken: string };
}

describe('FR-01 authentication regressions with SQLite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let hasher: PasswordHasherService;
  let databasePath: string;
  let testDirectory: string;
  const originalPassword = 'review-test-original';

  beforeAll(async () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'scpc-auth-regression-'));
    databasePath = join(testDirectory, 'auth.db');
    prisma = new PrismaService({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, '/')}` } },
    });
    const migrationsPath = resolve(__dirname, '../../../prisma/migrations');

    for (const entry of readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const sql = readFileSync(resolve(migrationsPath, entry.name, 'migration.sql'), 'utf8');

      for (const statement of sql.split(';').filter((statement) => statement.trim())) {
        await prisma.$executeRawUnsafe(statement);
      }
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    hasher = app.get(PasswordHasherService);
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (databasePath && existsSync(databasePath)) unlinkSync(databasePath);
    if (testDirectory) rmdirSync(testDirectory);
  });

  function request(path: string, method: string, token?: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function account() {
    const username = `review-${randomUUID()}`;
    const registration = await request('/auth/register', 'POST', undefined, {
      username,
      nickname: '测试昵称',
      password: originalPassword,
    });
    expect(registration.status).toBe(201);
    const login = await request('/auth/login', 'POST', undefined, {
      username,
      password: originalPassword,
    });
    expect(login.status).toBe(200);
    const { data } = (await login.json()) as TokenEnvelope;
    return { username, token: data.accessToken };
  }

  it('rejects a null nickname without changing the stored profile', async () => {
    const { username, token } = await account();
    const invalid = await request('/users/me', 'PATCH', token, { nickname: null });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect((await prisma.user.findUniqueOrThrow({ where: { username } })).nickname).toBe(
      '测试昵称',
    );
    const valid = await request('/users/me', 'PATCH', token, { avatarUrl: null });
    expect(valid.status).toBe(200);
  });

  it('returns 422 for an incorrect current password and preserves the session', async () => {
    const { token } = await account();
    const response = await request('/users/me/password', 'PATCH', token, {
      currentPassword: 'incorrect-test-password',
      newPassword: 'review-test-new-password',
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'AUTH_CURRENT_PASSWORD_INVALID' },
    });
    expect((await request('/users/me', 'GET', token)).status).toBe(200);
  });

  it('allows only one overlapping password change and preserves its new token', async () => {
    const { username, token } = await account();
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hash = hasher.hash.bind(hasher);
    vi.spyOn(hasher, 'hash').mockImplementation(async (password) => {
      if (++arrivals === 2) release();
      await gate;
      return hash(password);
    });

    const passwords = ['review-test-password-a', 'review-test-password-b'];
    const responses = await Promise.all(
      passwords.map((newPassword) =>
        request('/users/me/password', 'PATCH', token, {
          currentPassword: originalPassword,
          newPassword,
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    const winner = responses.findIndex((response) => response.status === 200);
    const response = responses[winner]!;
    const { data } = (await response.json()) as TokenEnvelope;
    expect((await request('/users/me', 'GET', data.accessToken)).status).toBe(200);
    expect((await request('/users/me', 'GET', token)).status).toBe(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { username } });
    expect(user.tokenVersion).toBe(1);
    expect(await hasher.verify(passwords[winner]!, user.passwordHash)).toBe(true);
    expect(await hasher.verify(passwords[1 - winner]!, user.passwordHash)).toBe(false);
  });

  it('rejects a password write if logout invalidates the session during hashing', async () => {
    const { username, token } = await account();
    const before = await prisma.user.findUniqueOrThrow({ where: { username } });
    const hash = hasher.hash.bind(hasher);
    vi.spyOn(hasher, 'hash').mockImplementation(async (password) => {
      const logout = await request('/auth/logout', 'POST', token);
      expect(logout.status).toBe(200);
      return hash(password);
    });
    const response = await request('/users/me/password', 'PATCH', token, {
      currentPassword: originalPassword,
      newPassword: 'review-test-new-password',
    });
    expect(response.status).toBe(401);
    const after = await prisma.user.findUniqueOrThrow({ where: { username } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
  });
});
