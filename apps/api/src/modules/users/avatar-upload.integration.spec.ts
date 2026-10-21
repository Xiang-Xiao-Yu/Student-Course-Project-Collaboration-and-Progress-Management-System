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
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AvatarStorageService, MAX_AVATAR_UPLOAD_BYTES } from './avatar-storage.service';
import { UsersRepository } from './repositories/users.repository';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';

interface RegisterEnvelope {
  data: { id: string };
}

interface LoginEnvelope {
  data: { accessToken: string };
}

interface ProfileEnvelope {
  data: { avatarUrl: string | null };
  meta: { requestId: string; timestamp: string };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const content = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  content.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(content), 8 + data.length);
  return chunk;
}

function createTestPng(color = [0x24, 0x69, 0xb4, 0xff]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, ...color]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('FR-01 authenticated avatar upload with SQLite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: AvatarStorageService;
  let baseUrl: string;
  let testDirectory: string;
  let databasePath: string;
  const createdAvatars: Array<{ reference: string; userId: string }> = [];

  beforeAll(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'scpc-avatar-integration-'));
    databasePath = join(testDirectory, 'avatar.db');
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
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    storage = app.get(AvatarStorageService);
  });

  afterEach(async () => {
    for (const avatar of createdAvatars.splice(0)) {
      await storage.remove(avatar.userId, avatar.reference);
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await rm(databasePath, { force: true });
    await rm(testDirectory, { force: true, recursive: true });
  });

  async function createAccount() {
    const username = `avatar-${randomUUID()}`;
    const password = 'avatar-test-password';
    const registration = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, nickname: '测试头像', password }),
    });
    expect(registration.status).toBe(201);
    const registered = (await registration.json()) as RegisterEnvelope;
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(login.status).toBe(200);
    const session = (await login.json()) as LoginEnvelope;
    return { id: registered.data.id, token: session.data.accessToken, username };
  }

  async function upload(token: string | null, buffer: Buffer, mimeType: string, filename: string) {
    const formData = new FormData();
    formData.append('avatar', new Blob([buffer], { type: mimeType }), filename);
    return fetch(`${baseUrl}/users/me/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  }

  it('uploads valid image data, stores only a server key, and persists the profile data URL', async () => {
    const user = await createAccount();
    const legacyUrl = await fetch(baseUrl + '/users/me', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + user.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatarUrl: 'https://example.com/old-avatar.png' }),
    });
    expect(legacyUrl.status).toBe(200);
    expect(((await legacyUrl.json()) as ProfileEnvelope).data.avatarUrl).toBe(
      'https://example.com/old-avatar.png',
    );

    const png = createTestPng();
    const response = await upload(user.token, png, 'image/png', '../../avatar.jpg');
    expect(response.status).toBe(200);
    const profile = (await response.json()) as ProfileEnvelope;
    const expectedDataUrl = `data:image/png;base64,${png.toString('base64')}`;

    expect(profile.data.avatarUrl).toBe(expectedDataUrl);
    expect(profile.meta.requestId).toBeTruthy();
    expect(Number.isFinite(Date.parse(profile.meta.timestamp))).toBe(true);

    const userRecord = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userRecord.avatarUrl).toMatch(/^uploaded:[0-9a-f-]{36}\.png$/);
    expect(userRecord.avatarUrl).not.toContain('..');
    expect(userRecord.avatarUrl).not.toMatch(/^[A-Za-z]:/);
    expect(userRecord.avatarUrl).not.toContain('avatar.jpg');
    createdAvatars.push({ reference: userRecord.avatarUrl!, userId: user.id });

    const reloaded = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(reloaded.status).toBe(200);
    expect(((await reloaded.json()) as ProfileEnvelope).data.avatarUrl).toBe(expectedDataUrl);

    const otherUser = await createAccount();
    const otherProfile = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${otherUser.token}` },
    });
    expect(((await otherProfile.json()) as ProfileEnvelope).data.avatarUrl).toBeNull();
  });

  it('rolls back the avatar write when the following profile read fails', async () => {
    const user = await createAccount();
    const previous = 'https://example.com/current.png';
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: previous } });
    const failingClient = prisma.$extends({
      query: {
        user: {
          findUnique() {
            throw new Error('profile-read-failure');
          },
        },
      },
    });
    const repository = new UsersRepository(failingClient as unknown as PrismaService);
    await expect(
      repository.updateAvatar(user.id, previous, `uploaded:${randomUUID()}.png`),
    ).rejects.toThrow('profile-read-failure');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).avatarUrl).toBe(
      previous,
    );
  });

  it('rejects extra multipart fields without updating the avatar', async () => {
    const user = await createAccount();
    const form = new FormData();
    form.append('unexpected', 'not-a-supported-field');
    form.append('avatar', new Blob([createTestPng()], { type: 'image/png' }), 'avatar.png');
    const response = await fetch(baseUrl + '/users/me/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: form,
    });
    const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (record.avatarUrl?.startsWith('uploaded:')) {
      createdAvatars.push({ reference: record.avatarUrl, userId: user.id });
    }
    expect(response.status).toBe(400);
    expect(record.avatarUrl).toBeNull();
  });

  it('rejects unauthenticated and forged image content without changing the previous avatar', async () => {
    const user = await createAccount();
    const png = createTestPng();
    const initial = await upload(user.token, png, 'image/png', 'avatar.png');
    expect(initial.status).toBe(200);
    const initialProfile = (await initial.json()) as ProfileEnvelope;
    const userRecord = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    createdAvatars.push({ reference: userRecord.avatarUrl!, userId: user.id });

    const unauthenticated = await upload(null, png, 'image/png', 'avatar.png');
    expect(unauthenticated.status).toBe(401);

    const emptyForm = new FormData();
    const noFile = await fetch(baseUrl + '/users/me/avatar', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + user.token },
      body: emptyForm,
    });
    expect(noFile.status).toBe(400);
    expect(await noFile.json()).toMatchObject({ error: { code: 'AVATAR_FILE_REQUIRED' } });

    const forged = await upload(user.token, Buffer.from('not an image'), 'image/png', 'avatar.png');
    expect(forged.status).toBe(422);
    expect(await forged.json()).toMatchObject({ error: { code: 'AVATAR_INVALID_FILE' } });

    const reloaded = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(((await reloaded.json()) as ProfileEnvelope).data.avatarUrl).toBe(
      initialProfile.data.avatarUrl,
    );
  });

  it('rejects oversized upload with a safe localized response and preserves the previous avatar', async () => {
    const user = await createAccount();
    const png = createTestPng();
    const initial = await upload(user.token, png, 'image/png', 'avatar.png');
    expect(initial.status).toBe(200);
    const initialProfile = (await initial.json()) as ProfileEnvelope;
    const userRecord = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    createdAvatars.push({ reference: userRecord.avatarUrl!, userId: user.id });

    const oversized = Buffer.alloc(MAX_AVATAR_UPLOAD_BYTES + 1);
    png.copy(oversized);
    const response = await upload(user.token, oversized, 'image/png', 'large.png');
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: 'AVATAR_FILE_TOO_LARGE', message: '头像图片不能超过 10 MiB' },
    });

    const reloaded = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(((await reloaded.json()) as ProfileEnvelope).data.avatarUrl).toBe(
      initialProfile.data.avatarUrl,
    );
  });
});
