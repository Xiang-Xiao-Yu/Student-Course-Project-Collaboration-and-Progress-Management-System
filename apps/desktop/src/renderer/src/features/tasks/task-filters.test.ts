import { describe, expect, it } from 'vitest';

import {
  EMPTY_TASK_FILTER_VALUES,
  countActiveTaskFilters,
  getTaskFilterKey,
  hasActiveTaskFilters,
  isTaskFilterResponseCurrent,
  toTaskListFilters,
  validateTaskFilterValues,
} from './task-filters';

describe('P6 task filters', () => {
  it('正常场景归一化组合筛选并统计启用数量', () => {
    const filters = toTaskListFilters({
      ...EMPTY_TASK_FILTER_VALUES,
      assigneeId: 'user-1',
      dueDateFrom: '2026-11-01',
      priority: 'HIGH',
      search: '  验收  ',
      tag: ' backend ',
    });

    expect(filters).toEqual({
      assigneeId: 'user-1',
      dueDateFrom: '2026-11-01',
      priority: 'HIGH',
      search: '验收',
      tag: 'backend',
    });
    expect(countActiveTaskFilters(filters)).toBe(5);
    expect(hasActiveTaskFilters(filters)).toBe(true);
  });

  it('边界场景允许同一天的截止日期筛选', () => {
    expect(
      validateTaskFilterValues({
        ...EMPTY_TASK_FILTER_VALUES,
        dueDateFrom: '2026-11-11',
        dueDateTo: '2026-11-11',
      }),
    ).toBeNull();
  });

  it('失败场景拒绝结束日期早于开始日期', () => {
    expect(
      validateTaskFilterValues({
        ...EMPTY_TASK_FILTER_VALUES,
        dueDateFrom: '2026-11-12',
        dueDateTo: '2026-11-11',
      }),
    ).toBe('截止日期筛选的结束日期不能早于开始日期。');
  });

  it('失败场景拒绝不存在的日历日期和非 YYYY-MM-DD 格式', () => {
    expect(
      validateTaskFilterValues({
        ...EMPTY_TASK_FILTER_VALUES,
        dueDateFrom: '2026-02-30',
      }),
    ).toBe('截止日期筛选的开始日期无效，请使用 YYYY-MM-DD 格式。');
    expect(
      validateTaskFilterValues({
        ...EMPTY_TASK_FILTER_VALUES,
        dueDateTo: '2026-11-1',
      }),
    ).toBe('截止日期筛选的结束日期无效，请使用 YYYY-MM-DD 格式。');
  });

  it('旧筛选响应不能覆盖当前筛选结果', () => {
    const alpha = toTaskListFilters({ ...EMPTY_TASK_FILTER_VALUES, search: 'alpha' });
    const beta = toTaskListFilters({ ...EMPTY_TASK_FILTER_VALUES, search: 'beta' });

    expect(getTaskFilterKey(alpha)).not.toBe(getTaskFilterKey(beta));
    expect(isTaskFilterResponseCurrent(1, 2, alpha, beta)).toBe(false);
    expect(isTaskFilterResponseCurrent(2, 2, beta, beta)).toBe(true);
  });
});
