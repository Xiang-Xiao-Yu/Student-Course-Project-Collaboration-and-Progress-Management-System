import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectAccessService } from '../projects/project-access.service';
import { IterationsService } from './iterations.service';
import type { IterationsRepository } from './repositories/iterations.repository';

const iteration = {
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  endDate: new Date('2026-11-30T00:00:00.000Z'),
  goal: 'P4 迭代',
  id: 'iteration-1',
  name: '迭代一',
  projectId: 'project-1',
  startDate: new Date('2026-11-01T00:00:00.000Z'),
  status: 'IN_PROGRESS',
  taskCount: 1,
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
};

function createService(): {
  access: { requirePermission: ReturnType<typeof vi.fn> };
  repository: {
    addTask: ReturnType<typeof vi.fn>;
    closeIteration: ReturnType<typeof vi.fn>;
    createIteration: ReturnType<typeof vi.fn>;
    deleteIteration: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
    listByProject: ReturnType<typeof vi.fn>;
    removeTask: ReturnType<typeof vi.fn>;
    updateIteration: ReturnType<typeof vi.fn>;
  };
  service: IterationsService;
} {
  const access = { requirePermission: vi.fn() };
  const repository = {
    addTask: vi.fn(),
    closeIteration: vi.fn(),
    createIteration: vi.fn(),
    deleteIteration: vi.fn(),
    getById: vi.fn(),
    getStats: vi.fn(),
    listByProject: vi.fn(),
    removeTask: vi.fn(),
    updateIteration: vi.fn(),
  };
  const service = new IterationsService(
    access as unknown as ProjectAccessService,
    repository as unknown as IterationsRepository,
  );

  return { access, repository, service };
}

describe('IterationsService', () => {
  it('rejects an iteration whose end date is before its start date', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);

    await expect(
      service.createIteration('user-1', 'project-1', {
        endDate: '2026-10-01T00:00:00.000Z',
        name: '非法迭代',
        startDate: '2026-11-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      response: { code: 'ITERATION_DATE_RANGE_INVALID' },
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(repository.createIteration).not.toHaveBeenCalled();
  });

  it('maps iteration records and task summaries to API responses', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.getById.mockResolvedValue({
      ...iteration,
      tasks: [
        {
          completedAt: new Date('2026-11-10T00:00:00.000Z'),
          dueDate: new Date('2026-11-15T00:00:00.000Z'),
          id: 'task-1',
          status: 'COMPLETED',
          title: '任务一',
        },
      ],
    });

    await expect(service.getIteration('user-1', 'project-1', 'iteration-1')).resolves.toEqual({
      createdAt: '2026-11-01T00:00:00.000Z',
      endDate: '2026-11-30T00:00:00.000Z',
      goal: 'P4 迭代',
      id: 'iteration-1',
      name: '迭代一',
      projectId: 'project-1',
      startDate: '2026-11-01T00:00:00.000Z',
      status: 'IN_PROGRESS',
      taskCount: 1,
      tasks: [
        {
          completedAt: '2026-11-10T00:00:00.000Z',
          dueDate: '2026-11-15T00:00:00.000Z',
          id: 'task-1',
          status: 'COMPLETED',
          title: '任务一',
        },
      ],
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('computes iteration statistics including overdue and completion rate', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.getStats.mockResolvedValue([
      { completedAt: null, dueDate: null, id: 'task-1', status: 'COMPLETED', title: '完成' },
      {
        completedAt: null,
        dueDate: null,
        id: 'task-2',
        status: 'IN_PROGRESS',
        title: '进行中',
      },
      {
        completedAt: null,
        dueDate: null,
        id: 'task-3',
        status: 'BLOCKED',
        title: '阻塞',
      },
      {
        completedAt: null,
        dueDate: new Date('2020-01-01T00:00:00.000Z'),
        id: 'task-4',
        status: 'TODO',
        title: '逾期',
      },
    ]);

    await expect(service.getStats('user-1', 'project-1', 'iteration-1')).resolves.toEqual({
      blocked: 1,
      completed: 1,
      completionRate: 0.25,
      inProgress: 1,
      overdue: 1,
      total: 4,
    });
  });

  it('treats a task due today as on-time and due yesterday as overdue', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.getStats.mockResolvedValue([
      {
        completedAt: null,
        dueDate: new Date('2026-11-05T00:00:00.000Z'),
        id: 'task-1',
        status: 'TODO',
        title: '今天截止',
      },
    ]);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-05T15:59:59.000Z'));
      await expect(service.getStats('user-1', 'project-1', 'iteration-1')).resolves.toMatchObject({
        overdue: 0,
      });

      vi.setSystemTime(new Date('2026-11-05T16:00:00.000Z'));
      await expect(service.getStats('user-1', 'project-1', 'iteration-1')).resolves.toMatchObject({
        overdue: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it('returns a stable not-found error when the iteration does not exist', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.getById.mockResolvedValue(null);

    await expect(service.getIteration('user-1', 'project-1', 'missing')).rejects.toMatchObject({
      response: { code: 'ITERATION_NOT_FOUND' },
      status: HttpStatus.NOT_FOUND,
    });
  });
});
