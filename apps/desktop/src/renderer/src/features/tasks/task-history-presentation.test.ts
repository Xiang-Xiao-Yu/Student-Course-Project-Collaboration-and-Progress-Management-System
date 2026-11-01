import { describe, expect, it } from 'vitest';

import type { TaskActivityDto } from './task-history-api';
import { getTaskActivityDetail, getTaskActivityLabel } from './task-history-presentation';

function activity(overrides: Partial<TaskActivityDto>): TaskActivityDto {
  return {
    action: 'TASK_UPDATED',
    actor: null,
    afterValue: null,
    beforeValue: null,
    createdAt: '2026-10-30T00:00:00.000Z',
    id: 'activity-1',
    targetId: 'task-1',
    targetType: 'TASK',
    ...overrides,
  };
}

describe('P3 task history presentation', () => {
  it('正常场景展示状态变化和审核不通过原因', () => {
    expect(
      getTaskActivityDetail(
        activity({
          action: 'TASK_STATUS_CHANGED',
          afterValue: { status: 'IN_PROGRESS' },
          beforeValue: { status: 'TODO' },
        }),
      ),
    ).toBe('待开始 → 进行中');
    expect(
      getTaskActivityDetail(
        activity({
          action: 'TASK_REVIEW_REJECTED',
          afterValue: { rejectionReason: '缺少边界测试' },
        }),
      ),
    ).toBe('原因：缺少边界测试');
  });

  it('边界场景对无状态值的时间线返回详情空值', () => {
    expect(getTaskActivityDetail(activity({ action: 'TASK_STATUS_CHANGED' }))).toBeNull();
  });

  it('失败场景对未知动作使用安全中文标签', () => {
    expect(getTaskActivityLabel('UNKNOWN_ACTION')).toBe('更新任务');
  });
});
