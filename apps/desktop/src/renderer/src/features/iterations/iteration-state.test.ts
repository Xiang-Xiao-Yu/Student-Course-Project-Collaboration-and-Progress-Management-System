import { describe, expect, it } from 'vitest';

import type { IterationStatsDto } from './iteration-api';
import {
  isIterationResponseCurrent,
  requiresIterationSwitchConfirmation,
  resolveIterationStatsRefresh,
} from './iteration-state';

const form = {
  endDate: '2026-11-20',
  goal: '完成 P4',
  name: 'P4',
  startDate: '2026-11-05',
};

const stats: IterationStatsDto = {
  blocked: 1,
  completed: 1,
  completionRate: 0.25,
  inProgress: 0,
  overdue: 1,
  total: 4,
};

describe('P4 iteration response state', () => {
  it('保存 A 的迟到响应不会覆盖当前选中的 B', () => {
    expect(isIterationResponseCurrent('iteration-a', 'iteration-b')).toBe(false);
    expect(isIterationResponseCurrent('iteration-b', 'iteration-b')).toBe(true);
  });

  it('编辑有未保存内容时切换迭代需要确认', () => {
    expect(requiresIterationSwitchConfirmation(true, form, { ...form, goal: '新目标' })).toBe(true);
    expect(requiresIterationSwitchConfirmation(false, form, { ...form, goal: '新目标' })).toBe(
      false,
    );
    expect(requiresIterationSwitchConfirmation(true, form, form)).toBe(false);
  });

  it('统计刷新失败保留原值但返回明确错误，由页面隐藏旧数字并允许重试', () => {
    expect(resolveIterationStatsRefresh(stats, { message: 'network', status: 'rejected' })).toEqual(
      {
        error: 'network',
        stats,
      },
    );
    expect(
      resolveIterationStatsRefresh(stats, {
        status: 'fulfilled',
        value: { ...stats, total: 5 },
      }),
    ).toEqual({
      error: null,
      stats: { ...stats, total: 5 },
    });
  });
});
