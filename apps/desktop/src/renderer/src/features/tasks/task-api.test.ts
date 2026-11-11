import { describe, expect, it, vi } from 'vitest';

import {
  createTask,
  deleteTask,
  exportTasksCsv,
  getTask,
  listTasks,
  updateTask,
  updateTaskStatus,
} from './task-api';

describe('P3 task API', () => {
  it('正常场景映射任务生命周期和状态请求', async () => {
    const api = {
      delete: vi.fn(async () => ({ deleted: true as const })),
      get: vi.fn(async () => ({ id: 'task-1' })),
      patch: vi.fn(async () => ({ id: 'task-1' })),
      post: vi.fn(async () => ({ id: 'task-1' })),
    };

    await listTasks(api as never, 'project-1');
    await createTask(api as never, 'project-1', {
      priority: 'HIGH',
      tagNames: ['backend'],
      title: '实现任务',
    });
    await getTask(api as never, 'project-1', 'task-1');
    await updateTask(api as never, 'project-1', 'task-1', { title: '新任务标题' });
    await updateTaskStatus(api as never, 'project-1', 'task-1', {
      completionNote: '已完成',
      status: 'PENDING_REVIEW',
    });
    await deleteTask(api as never, 'project-1', 'task-1');

    expect(api.get).toHaveBeenNthCalledWith(1, '/projects/project-1/tasks');
    expect(api.post).toHaveBeenCalledWith('/projects/project-1/tasks', {
      priority: 'HIGH',
      tagNames: ['backend'],
      title: '实现任务',
    });
    expect(api.patch).toHaveBeenNthCalledWith(1, '/projects/project-1/tasks/task-1', {
      title: '新任务标题',
    });
    expect(api.patch).toHaveBeenNthCalledWith(2, '/projects/project-1/tasks/task-1/status', {
      completionNote: '已完成',
      status: 'PENDING_REVIEW',
    });
    expect(api.delete).toHaveBeenCalledWith('/projects/project-1/tasks/task-1');
  });

  it('边界场景编码项目与任务路径参数', async () => {
    const api = { get: vi.fn(async () => []) };

    await listTasks(api as never, 'project/1');

    expect(api.get).toHaveBeenCalledWith('/projects/project%2F1/tasks');
  });

  it('失败场景保留 API 异常', async () => {
    const error = new Error('task not found');
    const api = {
      get: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(listTasks(api as never, 'project-1')).rejects.toBe(error);
  });

  it('正常场景组合任务筛选参数', async () => {
    const api = { get: vi.fn(async () => []) };

    await listTasks(api as never, 'project-1', {
      assigneeId: 'user-1',
      dueDateFrom: '2026-11-01',
      dueDateTo: '2026-11-30',
      iterationId: 'iteration-1',
      priority: 'HIGH',
      search: '验收',
      status: 'IN_PROGRESS',
      tag: 'backend',
    });

    expect(api.get).toHaveBeenCalledWith(
      '/projects/project-1/tasks?search=%E9%AA%8C%E6%94%B6&assigneeId=user-1&status=IN_PROGRESS&priority=HIGH&tag=backend&iterationId=iteration-1&dueDateFrom=2026-11-01&dueDateTo=2026-11-30',
    );
  });

  it('边界场景只传递非空筛选条件', async () => {
    const api = { get: vi.fn(async () => []) };

    await listTasks(api as never, 'project-1', {
      assigneeId: '   ',
      search: '',
      status: undefined,
    });

    expect(api.get).toHaveBeenCalledWith('/projects/project-1/tasks');
  });

  it('导出任务时使用导出端点并保留当前筛选', async () => {
    const api = {
      download: vi.fn(async () => ({
        blob: new Blob(['csv']),
        filename: 'tasks-project-1.csv',
      })),
    };

    await exportTasksCsv(api, 'project-1', { status: 'BLOCKED', tag: 'urgent' });

    expect(api.download).toHaveBeenCalledWith(
      '/projects/project-1/tasks/export?status=BLOCKED&tag=urgent',
    );
  });
});
