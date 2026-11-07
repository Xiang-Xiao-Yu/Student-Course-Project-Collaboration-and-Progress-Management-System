import { describe, expect, it, vi } from 'vitest';

import {
  addIterationTask,
  closeIteration,
  createIteration,
  getIterationStats,
  listIterations,
  removeIterationTask,
  updateIteration,
} from './iteration-api';

describe('P4 iteration API', () => {
  it('正常场景请求迭代列表、创建和统计', async () => {
    const api = {
      get: vi.fn(async () => []),
      post: vi.fn(async () => ({})),
    };

    await listIterations(api as never, 'project/1');
    await createIteration(api as never, 'project/1', {
      endDate: '2026-11-20',
      goal: '完成 P4',
      name: 'P4 迭代',
      startDate: '2026-11-05',
    });
    await getIterationStats(api as never, 'project/1', 'iteration/1');

    expect(api.get).toHaveBeenNthCalledWith(1, '/projects/project%2F1/iterations');
    expect(api.post).toHaveBeenCalledWith('/projects/project%2F1/iterations', {
      endDate: '2026-11-20',
      goal: '完成 P4',
      name: 'P4 迭代',
      startDate: '2026-11-05',
    });
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      '/projects/project%2F1/iterations/iteration%2F1/stats',
    );
  });

  it('边界场景请求任务加入、移除、状态修改和关闭', async () => {
    const api = {
      delete: vi.fn(async () => ({ tasks: [] })),
      patch: vi.fn(async () => ({ tasks: [] })),
      post: vi.fn(async () => ({ tasks: [] })),
    };

    await addIterationTask(api as never, 'project-1', 'iteration-1', 'task/1', 'iteration-2');
    await removeIterationTask(api as never, 'project-1', 'iteration-1', 'task/1');
    await updateIteration(api as never, 'project-1', 'iteration-1', {
      status: 'IN_PROGRESS',
    });
    await closeIteration(api as never, 'project-1', 'iteration-1', {
      nextIterationId: 'iteration-2',
    });

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/projects/project-1/iterations/iteration-1/tasks',
      { expectedIterationId: 'iteration-2', taskId: 'task/1' },
    );
    expect(api.delete).toHaveBeenCalledWith(
      '/projects/project-1/iterations/iteration-1/tasks/task%2F1',
    );
    expect(api.patch).toHaveBeenCalledWith('/projects/project-1/iterations/iteration-1', {
      status: 'IN_PROGRESS',
    });
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/projects/project-1/iterations/iteration-1/close',
      { nextIterationId: 'iteration-2' },
    );
  });

  it('失败场景保留 API 异常', async () => {
    const error = new Error('iteration unavailable');
    const api = {
      get: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(listIterations(api as never, 'project-1')).rejects.toBe(error);
  });
});
