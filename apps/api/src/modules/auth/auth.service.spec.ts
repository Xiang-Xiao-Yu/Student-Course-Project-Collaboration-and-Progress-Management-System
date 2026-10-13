import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import type { AuthRepository } from './repositories/auth.repository';
import { AuthService } from './auth.service';
import type { PasswordHasherService } from './services/password-hasher.service';

function createService(): {
  config: { getOrThrow: ReturnType<typeof vi.fn> };
  hasher: { hash: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  jwt: { signAsync: ReturnType<typeof vi.fn> };
  repository: {
    createUser: ReturnType<typeof vi.fn>;
    findUserForLogin: ReturnType<typeof vi.fn>;
    findUserIdByUsername: ReturnType<typeof vi.fn>;
    incrementTokenVersion: ReturnType<typeof vi.fn>;
  };
  service: AuthService;
} {
  const repository = {
    createUser: vi.fn(),
    findUserForLogin: vi.fn(),
    findUserIdByUsername: vi.fn(),
    incrementTokenVersion: vi.fn(),
  };
  const hasher = {
    hash: vi.fn(),
    verify: vi.fn(),
  };
  const jwt = {
    signAsync: vi.fn(),
  };
  const config = {
    getOrThrow: vi.fn(),
  };
  const service = new AuthService(
    repository as unknown as AuthRepository,
    hasher as unknown as PasswordHasherService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );

  return { config, hasher, jwt, repository, service };
}

describe('AuthService.register', () => {
  it('creates a user with a password hash and returns a safe response', async () => {
    const { hasher, repository, service } = createService();
    const createdAt = new Date('2026-10-13T10:00:00.000Z');

    repository.findUserIdByUsername.mockResolvedValue(null);
    hasher.hash.mockResolvedValue('scrypt$salt$hash');
    repository.createUser.mockResolvedValue({
      createdAt,
      id: 'user-1',
      nickname: '示例用户',
      username: 'student01',
    });

    const result = await service.register({
      nickname: '示例用户',
      password: 'password123',
      username: 'student01',
    });

    expect(hasher.hash).toHaveBeenCalledWith('password123');
    expect(repository.createUser).toHaveBeenCalledWith({
      nickname: '示例用户',
      passwordHash: 'scrypt$salt$hash',
      username: 'student01',
    });
    expect(result).toEqual({
      createdAt: createdAt.toISOString(),
      id: 'user-1',
      nickname: '示例用户',
      username: 'student01',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects an existing username before creating a user', async () => {
    const { hasher, repository, service } = createService();

    repository.findUserIdByUsername.mockResolvedValue('existing-user');

    await expect(
      service.register({
        nickname: '示例用户',
        password: 'password123',
        username: 'student01',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(repository.createUser).not.toHaveBeenCalled();
  });
});

describe('AuthService.login', () => {
  it('authenticates an active user and returns a bearer token', async () => {
    const { config, hasher, jwt, repository, service } = createService();

    repository.findUserForLogin.mockResolvedValue({
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      id: 'user-1',
      nickname: '示例用户',
      passwordHash: 'scrypt$salt$hash',
      status: 'ACTIVE',
      tokenVersion: 2,
      username: 'student01',
    });
    hasher.verify.mockResolvedValue(true);
    jwt.signAsync.mockResolvedValue('signed-token');
    config.getOrThrow.mockReturnValue('2h');

    const result = await service.login({
      password: 'password123',
      username: 'student01',
    });

    expect(hasher.verify).toHaveBeenCalledWith('password123', 'scrypt$salt$hash');
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      tokenVersion: 2,
      username: 'student01',
    });
    expect(result).toEqual({
      accessToken: 'signed-token',
      expiresIn: '2h',
      tokenType: 'Bearer',
      user: {
        id: 'user-1',
        nickname: '示例用户',
        username: 'student01',
      },
    });
  });

  it('rejects invalid credentials without exposing which field failed', async () => {
    const { hasher, repository, service } = createService();

    repository.findUserForLogin.mockResolvedValue(null);

    await expect(
      service.login({
        password: 'wrong-password',
        username: 'missing-user',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('rejects a disabled user after password verification', async () => {
    const { hasher, repository, service } = createService();

    repository.findUserForLogin.mockResolvedValue({
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      id: 'user-1',
      nickname: '禁用用户',
      passwordHash: 'scrypt$salt$hash',
      status: 'DISABLED',
      tokenVersion: 0,
      username: 'disabled-user',
    });
    hasher.verify.mockResolvedValue(true);

    await expect(
      service.login({
        password: 'password123',
        username: 'disabled-user',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });
});

describe('AuthService.logout', () => {
  it('invalidates existing tokens by incrementing tokenVersion', async () => {
    const { repository, service } = createService();

    repository.incrementTokenVersion.mockResolvedValue(undefined);

    await expect(service.logout('user-1')).resolves.toEqual({ loggedOut: true });
    expect(repository.incrementTokenVersion).toHaveBeenCalledWith('user-1');
  });
});
