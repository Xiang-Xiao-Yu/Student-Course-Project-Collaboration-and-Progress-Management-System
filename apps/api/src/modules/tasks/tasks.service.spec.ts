import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectAccessService } from '../projects/project-access.service';
import type { TasksRepository } from './repositories/tasks.repository';
import { TasksService } from './tasks.service';

const task = {
  assigneeId: 'member-1',
  completedAt: null,
  completionNote: '已完成实现',
  createdAt: new Date('2026-10-26T10:00:00.000Z'),
  createdById: 'owner-1',
  description: null,
  dueDate: new Date('2026-10-30T00:00:00.000Z'),
  estimatedHours: 4,
  id: 'task-1',
  priority: 'HIGH',
  projectId: 'project-1',
  requirementId: 'requirement-1',
  status: 'PENDING_REVIEW',
  tags: [{ tag: { name: 'backend' } }],
  title: '实现任务',
  updatedAt: new Date('2026-10-26T10:00:00.000Z'),
};

function createService(): {
  access: { requirePermission: ReturnType<typeof vi.fn> };
  repository: {
    createTask: ReturnType<typeof vi.fn>;
    deleteTask: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    listByProject: ReturnType<typeof vi.fn>;
    statusTransitionInvalid: ReturnType<typeof vi.fn>;
    updateTask: ReturnType<typeof vi.fn>;
    updateTaskStatus: ReturnType<typeof vi.fn>;
  };
  service: TasksService;
} {
  const access = { requirePermission: vi.fn() };
  const repository = {
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn(),
    statusTransitionInvalid: vi.fn().mockReturnValue({
      getStatus: () => HttpStatus.UNPROCESSABLE_ENTITY,
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
    updateTask: vi.fn(),
    updateTaskStatus: vi.fn(),
  };
  const service = new TasksService(
    access as unknown as ProjectAccessService,
    repository as unknown as TasksRepository,
  );

  return { access, repository, service };
}

function projectAccess(
  role = 'OWNER',
  status = 'ACTIVE',
): {
  isPlatformAdmin: boolean;
  project: { startDate: Date | null; status: string };
  role: string;
} {
  return {
    isPlatformAdmin: false,
    project: { startDate: new Date('2026-10-01T00:00:00.000Z'), status },
    role,
  };
}

describe('TasksService', () => {
  it('requires a completion note before review', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess('MEMBER'));
    repository.findById.mockResolvedValue({ ...task, completionNote: null, status: 'IN_PROGRESS' });

    await expect(
      service.updateTaskStatus('member-1', 'project-1', 'task-1', {
        status: 'PENDING_REVIEW',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(repository.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('allows only the owner to approve a pending task', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess('MEMBER'));
    repository.findById.mockResolvedValue(task);

    await expect(
      service.updateTaskStatus('member-1', 'project-1', 'task-1', {
        status: 'COMPLETED',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(repository.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('requires a reason to reopen a completed task', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess('OWNER'));
    repository.findById.mockResolvedValue({
      ...task,
      completedAt: new Date('2026-10-26T11:00:00.000Z'),
      status: 'COMPLETED',
    });

    await expect(
      service.updateTaskStatus('owner-1', 'project-1', 'task-1', {
        status: 'IN_PROGRESS',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });

  it('rejects a due date before the project start', async () => {
    const { access, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess('MEMBER'));

    await expect(
      service.createTask('member-1', 'project-1', {
        dueDate: '2026-09-30',
        priority: 'HIGH',
        title: '无效日期任务',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });

  it('blocks task creation in a paused project', async () => {
    const { access, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess('MEMBER', 'PAUSED'));

    await expect(
      service.createTask('member-1', 'project-1', {
        priority: 'HIGH',
        title: '暂停项目任务',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });
});
