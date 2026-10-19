import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../prisma/prisma.service';
import { AuthRepository } from './auth.repository';

describe('AuthRepository.createUser', () => {
  it('maps a unique constraint race to AUTH_USERNAME_TAKEN', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      clientVersion: '6.19.3',
      code: 'P2002',
    });
    const prisma = {
      user: {
        create: vi.fn().mockRejectedValue(uniqueError),
      },
    };
    const repository = new AuthRepository(prisma as unknown as PrismaService);

    await expect(
      repository.createUser({
        nickname: '示例用户',
        passwordHash: 'scrypt$salt$hash',
        username: 'student01',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });
});

describe('AuthRepository.updatePasswordAndIncrementTokenVersion', () => {
  it('maps a missing user to AUTH_SESSION_EXPIRED', async () => {
    const missingUserError = new Prisma.PrismaClientKnownRequestError('Record not found', {
      clientVersion: '6.19.3',
      code: 'P2025',
    });
    const prisma = {
      user: {
        update: vi.fn().mockRejectedValue(missingUserError),
      },
    };
    const repository = new AuthRepository(prisma as unknown as PrismaService);

    await expect(
      repository.updatePasswordAndIncrementTokenVersion('missing-user', 'scrypt$salt$hash'),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });
});
