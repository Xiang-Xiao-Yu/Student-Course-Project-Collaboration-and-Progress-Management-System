import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';

function createService(): {
  repository: {
    findAssignedTasks: ReturnType<typeof vi.fn>;
    findProfileById: ReturnType<typeof vi.fn>;
  };
  service: UsersService;
} {
  const repository = {
    findAssignedTasks: vi.fn(),
    findProfileById: vi.fn(),
  };
  const service = new UsersService(repository as unknown as UsersRepository);

  return { repository, service };
}

describe('UsersService', () => {
  it('returns the current user profile', async () => {
    const { repository, service } = createService();

    repository.findProfileById.mockResolvedValue({
      avatarUrl: null,
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      id: 'user-1',
      nickname: '示例用户',
      status: 'ACTIVE',
      updatedAt: new Date('2026-10-13T11:00:00.000Z'),
      username: 'student01',
    });

    await expect(service.getProfile('user-1')).resolves.toEqual({
      avatarUrl: null,
      createdAt: '2026-10-13T10:00:00.000Z',
      id: 'user-1',
      nickname: '示例用户',
      status: 'ACTIVE',
      updatedAt: '2026-10-13T11:00:00.000Z',
      username: 'student01',
    });
  });

  it('rejects a missing session user', async () => {
    const { repository, service } = createService();

    repository.findProfileById.mockResolvedValue(null);

    await expect(service.getProfile('missing-user')).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('maps assigned tasks and keeps an empty task list valid', async () => {
    const { repository, service } = createService();

    repository.findAssignedTasks.mockResolvedValue([
      {
        dueDate: new Date('2026-10-20T00:00:00.000Z'),
        id: 'task-1',
        priority: 'HIGH',
        project: { name: '课程项目' },
        projectId: 'project-1',
        status: 'IN_PROGRESS',
        title: '完成任务接口',
        updatedAt: new Date('2026-10-13T12:00:00.000Z'),
      },
    ]);

    await expect(service.getAssignedTasks('user-1')).resolves.toEqual([
      {
        dueDate: '2026-10-20T00:00:00.000Z',
        id: 'task-1',
        priority: 'HIGH',
        projectId: 'project-1',
        projectName: '课程项目',
        status: 'IN_PROGRESS',
        title: '完成任务接口',
        updatedAt: '2026-10-13T12:00:00.000Z',
      },
    ]);

    repository.findAssignedTasks.mockResolvedValue([]);
    await expect(service.getAssignedTasks('user-without-tasks')).resolves.toEqual([]);
  });
});
