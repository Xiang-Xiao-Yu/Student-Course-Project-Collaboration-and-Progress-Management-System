import { describe, expect, it } from 'vitest';

import {
  hasRequirementFormErrors,
  hasUnsavedRequirementChanges,
  validateRequirementForm,
} from './requirement-validation';

const validRequirement = {
  acceptanceCriteria: '需求详情可查看关联任务',
  description: '实现需求创建和编辑',
  priority: 'HIGH' as const,
  status: 'DRAFT' as const,
  title: '需求管理',
};

describe('P3 requirement validation', () => {
  it('正常场景接受完整需求数据', () => {
    expect(validateRequirementForm(validRequirement)).toEqual({});
  });

  it('边界场景拒绝空标题、空验收标准和超长字段', () => {
    const errors = validateRequirementForm({
      acceptanceCriteria: ' ',
      description: 'x'.repeat(5001),
      priority: 'HIGH',
      status: 'DRAFT',
      title: 'x'.repeat(101),
    });

    expect(errors.title).toBe('需求标题不能超过 100 个字符。');
    expect(errors.description).toBe('需求描述不能超过 5000 个字符。');
    expect(errors.acceptanceCriteria).toBe('请填写至少一条验收标准。');
    expect(hasRequirementFormErrors(errors)).toBe(true);
  });

  it('失败场景识别无效枚举和未保存内容', () => {
    const errors = validateRequirementForm({
      ...validRequirement,
      priority: 'URGENT' as never,
      status: 'UNKNOWN' as never,
    });

    expect(errors.priority).toBe('请选择有效的需求优先级。');
    expect(errors.status).toBe('请选择有效的需求状态。');
    expect(
      hasUnsavedRequirementChanges(validRequirement, {
        ...validRequirement,
        title: '新标题',
      }),
    ).toBe(true);
  });
});
