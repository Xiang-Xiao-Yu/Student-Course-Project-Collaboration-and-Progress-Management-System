import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../prisma/prisma.service';
import { UsersRepository } from './users.repository';

describe('UsersRepository.updateProfile', () => {
  it('returns null when the session user no longer exists', async () => {
    const missingUserError = new Prisma.PrismaClientKnownRequestError('Record not found', {
      clientVersion: '6.19.3',
      code: 'P2025',
    });
    const prisma = {
      user: {
        update: vi.fn().mockRejectedValue(missingUserError),
      },
    };
    const repository = new UsersRepository(prisma as unknown as PrismaService);

    await expect(
      repository.updateProfile('missing-user', { nickname: '新昵称' }),
    ).resolves.toBeNull();
  });
});
