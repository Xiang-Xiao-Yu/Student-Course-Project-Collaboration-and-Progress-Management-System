import { describe, expect, it } from 'vitest';

import {
  getRequirementPriorityLabel,
  getRequirementStatusLabel,
  getRequirementStatusOptions,
  getRequirementStatusTransitions,
  getRequirementTaskProgress,
} from './requirement-presentation';

describe('P3 requirement presentation', () => {
  it('正常场景显示中文优先级、状态和任务进度', () => {
    expect(getRequirementPriorityLabel('HIGH')).toBe('高');
    expect(getRequirementStatusLabel('PENDING_ACCEPTANCE')).toBe('待验收');
    expect(getRequirementTaskProgress([{ status: 'COMPLETED' }, { status: 'IN_PROGRESS' }])).toBe(
      '1/2 个任务已完成',
    );
  });

  it('边界场景只提供合法需求状态转换', () => {
    expect(getRequirementStatusTransitions('DRAFT')).toEqual(['CONFIRMED']);
    expect(getRequirementStatusOptions('DRAFT')).toEqual(['DRAFT', 'CONFIRMED']);
    expect(getRequirementStatusTransitions('COMPLETED')).toEqual([]);
  });

  it('失败场景对无关联任务显示明确占位文案', () => {
    expect(getRequirementTaskProgress([])).toBe('暂未关联任务');
  });
});
