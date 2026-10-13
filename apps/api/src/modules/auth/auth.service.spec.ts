import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthRepository } from './repositories/auth.repository';
import { AuthService } from './auth.service';
import type { PasswordHasherService } from './services/password-hasher.service';

function createService(): {
  hasher: { hash: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  repository: {
    createUser: ReturnType<typeof vi.fn>;
    findUserIdByUsername: ReturnType<typeof vi.fn>;
  };
  service: AuthService;
} {
  const repository = {
    createUser: vi.fn(),
    findUserIdByUsername: vi.fn(),
  };
  const hasher = {
    hash: vi.fn(),
    verify: vi.fn(),
  };
  const service = new AuthService(
    repository as unknown as AuthRepository,
    hasher as unknown as PasswordHasherService,
  );

  return { hasher, repository, service };
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
