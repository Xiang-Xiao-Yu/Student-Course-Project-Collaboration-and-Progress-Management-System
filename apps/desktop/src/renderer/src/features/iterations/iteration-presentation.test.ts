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
});
