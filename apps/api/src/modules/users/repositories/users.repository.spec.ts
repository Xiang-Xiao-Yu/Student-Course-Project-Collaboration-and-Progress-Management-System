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

describe('UsersRepository.findAssignedTasks', () => {
  it('limits personal tasks to projects where the user is still a member', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      task: {
        findMany,
      },
    };
    const repository = new UsersRepository(prisma as unknown as PrismaService);

    await expect(repository.findAssignedTasks('user-1')).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assigneeId: 'user-1',
          project: {
            members: {
              some: { userId: 'user-1' },
            },
          },
        },
      }),
    );
  });
});

describe('UsersRepository.updateAvatar', () => {
  it('uses the expected prior value so concurrent uploads cannot overwrite each other', async () => {
    const updatedProfile = {
      avatarUrl: 'uploaded:550e8400-e29b-41d4-a716-446655440000.png',
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      id: 'user-1',
      nickname: '示例用户',
      status: 'ACTIVE',
      updatedAt: new Date('2026-10-20T10:00:00.000Z'),
      username: 'student01',
    };
    const transaction = {
      user: {
        findUnique: vi.fn().mockResolvedValue(updatedProfile),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const repository = new UsersRepository(prisma as unknown as PrismaService);

    await expect(
      repository.updateAvatar('user-1', null, updatedProfile.avatarUrl),
    ).resolves.toEqual(updatedProfile);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      data: { avatarUrl: updatedProfile.avatarUrl },
      where: { avatarUrl: null, id: 'user-1' },
    });
  });

  it('returns null when another upload changed the current avatar first', async () => {
    const transaction = {
      user: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const repository = new UsersRepository(prisma as unknown as PrismaService);

    await expect(
      repository.updateAvatar('user-1', null, 'uploaded:550e8400-e29b-41d4-a716-446655440000.png'),
    ).resolves.toBeNull();
    expect(transaction.user.updateMany).toHaveBeenCalledOnce();
  });
});
