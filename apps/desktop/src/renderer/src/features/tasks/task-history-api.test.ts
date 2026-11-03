import { describe, expect, it, vi } from 'vitest';

import {
  listTaskActivity,
  listTaskComments,
  mergeTaskActivities,
  resolveTaskActivityPage,
  TASK_ACTIVITY_PAGE_SIZE,
} from './task-history-api';

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
      `/projects/project-1/activity?targetId=task-1&targetType=TASK&limit=${TASK_ACTIVITY_PAGE_SIZE}`,
    );
  });

  it('边界场景传递活动分页游标并去重超过 100 条记录', async () => {
    const api = { get: vi.fn(async () => []) };

    await listTaskActivity(api as never, 'project-1', 'task-1', {
      cursor: 'activity-100',
      limit: 100,
    });

    expect(api.get).toHaveBeenCalledWith(
      '/projects/project-1/activity?targetId=task-1&targetType=TASK&limit=100&cursor=activity-100',
    );

    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      action: 'TASK_UPDATED',
      actor: null,
      afterValue: null,
      beforeValue: null,
      createdAt: '2026-11-03T00:00:00.000Z',
      id: `activity-${index + 1}`,
      targetId: 'task-1',
      targetType: 'TASK',
    }));
    const secondPage = [
      firstPage[99]!,
      {
        ...firstPage[0]!,
        id: 'activity-101',
      },
    ];

    expect(mergeTaskActivities(firstPage, secondPage)).toHaveLength(101);
  });

  it('边界场景忽略刷新前发出的旧分页响应并保留全部 102 条记录', () => {
    const oldActivities = Array.from({ length: 101 }, (_, index) => ({
      action: 'TASK_UPDATED',
      actor: null,
      afterValue: null,
      beforeValue: null,
      createdAt: new Date(Date.UTC(2026, 10, 3, 0, 0, 101 - index)).toISOString(),
      id: `activity-${index + 1}`,
      targetId: 'task-1',
      targetType: 'TASK',
    }));
    const current = mergeTaskActivities(oldActivities.slice(0, 100), oldActivities.slice(100));
    const stalePage = resolveTaskActivityPage(current, oldActivities.slice(100), 0, 1);

    expect(stalePage.applied).toBe(false);
    expect(stalePage.activities).toHaveLength(101);

    const freshPage = [
      {
        ...oldActivities[0]!,
        createdAt: '2026-11-03T00:02:00.000Z',
        id: 'activity-new',
      },
      ...oldActivities.slice(0, 99),
    ];
    const refreshed = resolveTaskActivityPage(stalePage.activities, freshPage, 1, 1);

    expect(refreshed.applied).toBe(true);
    if (!refreshed.applied) {
      throw new Error('当前版本的活动分页应被应用');
    }
    expect(refreshed.activities).toHaveLength(102);
    expect(refreshed.activities.map((item) => item.id)).toEqual(
      expect.arrayContaining(['activity-new', 'activity-100', 'activity-101']),
    );
    expect(refreshed.hasMore).toBe(true);
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
