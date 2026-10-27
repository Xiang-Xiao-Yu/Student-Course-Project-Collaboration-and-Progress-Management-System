import { describe, expect, it, vi } from 'vitest';

import type { ProjectAccessService } from './project-access.service';
import { ProjectActivityService } from './project-activity.service';
import type { ProjectsRepository } from './repositories/projects.repository';

function createService(): {
  access: { requirePermission: ReturnType<typeof vi.fn> };
  repository: { listActivity: ReturnType<typeof vi.fn> };
  service: ProjectActivityService;
} {
  const access = { requirePermission: vi.fn() };
  const repository = { listActivity: vi.fn() };
  const service = new ProjectActivityService(
    access as unknown as ProjectAccessService,
    repository as unknown as ProjectsRepository,
  );

  return { access, repository, service };
}

describe('ProjectActivityService', () => {
  it('filters by task and safely parses activity values', async () => {
    const { access, repository, service } = createService();
    const query = { limit: 50, targetId: 'task-1', targetType: 'TASK' };

    access.requirePermission.mockResolvedValue(undefined);
    repository.listActivity.mockResolvedValue([
      {
        action: 'TASK_STATUS_CHANGED',
        actor: {
          id: 'user-1',
          nickname: '示例成员',
          username: 'member',
        },
        afterValue: '{"status":"IN_PROGRESS"}',
        beforeValue: '{"status":"TODO"}',
        createdAt: new Date('2026-10-27T10:00:00.000Z'),
        id: 'activity-1',
        targetId: 'task-1',
        targetType: 'TASK',
      },
      {
        action: 'TASK_UPDATED',
        actor: null,
        afterValue: 'legacy-value',
        beforeValue: null,
        createdAt: new Date('2026-10-27T09:00:00.000Z'),
        id: 'activity-2',
        targetId: 'task-1',
        targetType: 'TASK',
      },
    ]);

    await expect(service.listActivity('user-1', 'project-1', query)).resolves.toEqual([
      {
        action: 'TASK_STATUS_CHANGED',
        actor: {
          id: 'user-1',
          nickname: '示例成员',
          username: 'member',
        },
        afterValue: { status: 'IN_PROGRESS' },
        beforeValue: { status: 'TODO' },
        createdAt: '2026-10-27T10:00:00.000Z',
        id: 'activity-1',
        targetId: 'task-1',
        targetType: 'TASK',
      },
      {
        action: 'TASK_UPDATED',
        actor: null,
        afterValue: 'legacy-value',
        beforeValue: null,
        createdAt: '2026-10-27T09:00:00.000Z',
        id: 'activity-2',
        targetId: 'task-1',
        targetType: 'TASK',
      },
    ]);
    expect(access.requirePermission).toHaveBeenCalledWith('project-1', 'user-1', 'PROJECT_VIEW');
    expect(repository.listActivity).toHaveBeenCalledWith('project-1', query);
  });
});
