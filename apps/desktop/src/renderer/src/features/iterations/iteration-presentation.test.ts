import { describe, expect, it } from 'vitest';

import {
  formatCompletionRate,
  getIterationStatusActionLabel,
  getIterationStatusLabel,
  getIterationStatusTransitions,
  isIterationTaskOverdue,
} from './iteration-presentation';

describe('P4 iteration presentation', () => {
  it('正常场景展示状态和完成率', () => {
    expect(getIterationStatusLabel('IN_PROGRESS')).toBe('进行中');
    expect(formatCompletionRate(0.625)).toBe('62.5%');
    expect(formatCompletionRate(1)).toBe('100%');
  });

  it('边界场景只允许合法状态转换动作', () => {
    expect(getIterationStatusTransitions('NOT_STARTED')).toEqual(['IN_PROGRESS', 'CANCELED']);
    expect(getIterationStatusActionLabel('COMPLETED')).toBe('关闭迭代');
    expect(getIterationStatusTransitions('COMPLETED')).toEqual([]);
  });

  it('失败场景不把已完成或无截止日期的任务标记为逾期', () => {
    const now = new Date('2026-11-10T00:00:00.000Z');

    expect(
      isIterationTaskOverdue({ dueDate: '2026-11-01T00:00:00.000Z', status: 'COMPLETED' }, now),
    ).toBe(false);
    expect(isIterationTaskOverdue({ dueDate: null, status: 'IN_PROGRESS' }, now)).toBe(false);
    expect(
      isIterationTaskOverdue({ dueDate: '2026-11-01T00:00:00.000Z', status: 'IN_PROGRESS' }, now),
    ).toBe(true);
  });

  it('边界场景按北京日历日计算，截止当天结束前不计逾期', () => {
    const task = {
      dueDate: '2026-11-05T00:00:00.000Z',
      status: 'IN_PROGRESS' as const,
    };

    expect(isIterationTaskOverdue(task, new Date('2026-11-05T00:00:00.000Z'))).toBe(false);
    expect(isIterationTaskOverdue(task, new Date('2026-11-05T15:59:59.999Z'))).toBe(false);
    expect(isIterationTaskOverdue(task, new Date('2026-11-05T16:00:00.000Z'))).toBe(true);
  });

  it('截止时间跨越 UTC 日期时仍按上海日历日判断', () => {
    const task = {
      dueDate: '2026-11-06T20:00:00.000Z',
      status: 'IN_PROGRESS' as const,
    };

    expect(isIterationTaskOverdue(task, new Date('2026-11-06T18:00:00.000Z'))).toBe(false);
    expect(isIterationTaskOverdue(task, new Date('2026-11-07T16:00:00.000Z'))).toBe(true);
  });
});
