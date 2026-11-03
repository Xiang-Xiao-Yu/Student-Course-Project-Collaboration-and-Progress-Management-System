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
          afterValue: { reopenReason: null, status: 'IN_PROGRESS' },
          beforeValue: { status: 'TODO' },
        }),
      ),
    ).toBe('状态：待开始 → 进行中');
    expect(
      getTaskActivityDetail(
        activity({
          action: 'TASK_REVIEW_REJECTED',
          afterValue: { rejectionReason: '缺少边界测试' },
        }),
      ),
    ).toBe('审核不通过原因：缺少边界测试');
  });

  it('正常场景展示任务更新和重新提交的修改前后内容', () => {
    expect(
      getTaskActivityDetail(
        activity({
          action: 'TASK_UPDATED',
          beforeValue: { tagNames: ['api,v2'], title: '旧标题' },
          afterValue: { tagNames: ['api,v2'], title: '新标题' },
        }),
      ),
    ).toBe('标题：旧标题 → 新标题');
    expect(
      getTaskActivityDetail(
        activity({
          action: 'TASK_REVIEW_RESUBMITTED',
          beforeValue: { completionNote: '旧说明', status: 'PENDING_REVIEW' },
          afterValue: { completionNote: '新说明', status: 'PENDING_REVIEW' },
        }),
      ),
    ).toBe('完成说明：旧说明 → 新说明');
  });

  it('边界场景对无状态值的时间线返回详情空值', () => {
    expect(getTaskActivityDetail(activity({ action: 'TASK_STATUS_CHANGED' }))).toBeNull();
  });

  it('失败场景对未知动作使用安全中文标签', () => {
    expect(getTaskActivityLabel('UNKNOWN_ACTION')).toBe('更新任务');
  });
});
