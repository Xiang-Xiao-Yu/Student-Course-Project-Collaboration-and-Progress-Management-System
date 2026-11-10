import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api/errors';
import { ensureIterationTaskAssigned } from './iteration-recovery';

function iterationWithTask(taskId: string | null) {
  return {
    tasks: taskId ? [{ id: taskId, status: 'BACKLOG', title: '整改任务' }] : [],
  } as never;
}

describe('P5 iteration task recovery', () => {
  it('任务已在目标迭代时不重复提交', async () => {
    const api = {
      get: vi.fn(async () => iterationWithTask('task-1')),
      post: vi.fn(),
    };

    await expect(
      ensureIterationTaskAssigned(api as never, 'project-1', 'iteration-1', 'task-1'),
    ).resolves.toBe('already-assigned');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('任务尚未加入时提交一次并返回成功', async () => {
    const api = {
      get: vi.fn(async () => iterationWithTask(null)),
      post: vi.fn(async () => iterationWithTask('task-1')),
    };

    await expect(
      ensureIterationTaskAssigned(api as never, 'project-1', 'iteration-1', 'task-1'),
    ).resolves.toBe('assigned');
    expect(api.post).toHaveBeenCalledWith('/projects/project-1/iterations/iteration-1/tasks', {
      expectedIterationId: null,
      taskId: 'task-1',
    });
  });

  it('提交收到 409 后重新读取，确认已在目标迭代则恢复成功', async () => {
    const moved = new ApiError({
      code: 'ITERATION_TASK_MOVED',
      message: '任务归属已变化，请刷新后重试',
      status: 409,
    });
    const api = {
      get: vi
        .fn()
        .mockResolvedValueOnce(iterationWithTask(null))
        .mockResolvedValueOnce(iterationWithTask('task-1')),
      post: vi.fn(async () => {
        throw moved;
      }),
    };

    await expect(
      ensureIterationTaskAssigned(api as never, 'project-1', 'iteration-1', 'task-1'),
    ).resolves.toBe('already-assigned');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('提交收到 409 且目标迭代仍不含任务时保留冲突错误', async () => {
    const moved = new ApiError({
      code: 'ITERATION_TASK_MOVED',
      message: '任务归属已变化，请刷新后重试',
      status: 409,
    });
    const api = {
      get: vi.fn(async () => iterationWithTask(null)),
      post: vi.fn(async () => {
        throw moved;
      }),
    };

    await expect(
      ensureIterationTaskAssigned(api as never, 'project-1', 'iteration-1', 'task-1'),
    ).rejects.toBe(moved);
  });
});
