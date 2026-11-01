import { describe, expect, it, vi } from 'vitest';

import { listTaskActivity, listTaskComments } from './task-history-api';

describe('P3 task history API', () => {
  it('正常场景请求任务评论和操作记录', async () => {
    const api = { get: vi.fn(async () => []) };

    await listTaskComments(api as never, 'project-1', 'task-1');
    await listTaskActivity(api as never, 'project-1', 'task-1');

    expect(api.get).toHaveBeenNthCalledWith(
      1,
      '/projects/project-1/comments?targetId=task-1&targetType=TASK',
    );
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      '/projects/project-1/activity?targetId=task-1&targetType=TASK&limit=100',
    );
  });

  it('边界场景编码项目和任务参数', async () => {
    const api = { get: vi.fn(async () => []) };

    await listTaskComments(api as never, 'project/1', 'task/1');

    expect(api.get).toHaveBeenCalledWith(
      '/projects/project%2F1/comments?targetId=task%2F1&targetType=TASK',
    );
  });

  it('失败场景保留 API 异常', async () => {
    const error = new Error('comment target missing');
    const api = {
      get: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(listTaskComments(api as never, 'project-1', 'task-1')).rejects.toBe(error);
  });
});
