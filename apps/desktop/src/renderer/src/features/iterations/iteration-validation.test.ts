import { describe, expect, it } from 'vitest';

import type { IterationDetailDto } from './iteration-api';
import {
  formToCreateIterationInput,
  hasUnsavedIterationChanges,
  iterationToForm,
  validateIterationForm,
} from './iteration-validation';

const validForm = {
  endDate: '2026-11-20',
  goal: '完成 P4',
  name: 'P4 迭代',
  startDate: '2026-11-05',
};

describe('P4 iteration validation', () => {
  it('正常场景接受完整迭代数据并转换为创建请求', () => {
    expect(validateIterationForm(validForm)).toEqual({});
    expect(formToCreateIterationInput(validForm)).toEqual({
      endDate: '2026-11-20',
      goal: '完成 P4',
      name: 'P4 迭代',
      startDate: '2026-11-05',
    });
  });

  it('边界场景拒绝无效日期和反向日期范围', () => {
    expect(validateIterationForm({ ...validForm, startDate: '2026-02-30' }).startDate).toBe(
      '请输入有效的开始日期。',
    );
    expect(validateIterationForm({ ...validForm, endDate: '2026-11-01' }).endDate).toBe(
      '迭代结束日期不能早于开始日期。',
    );
  });

  it('失败场景拒绝空名称并识别未保存修改', () => {
    expect(validateIterationForm({ ...validForm, name: ' ' }).name).toBe('请输入迭代名称。');
    expect(hasUnsavedIterationChanges(validForm, { ...validForm, goal: '新目标' })).toBe(true);
  });

  it('边界场景保留详情日期和可空目标', () => {
    const iteration = {
      createdAt: '2026-11-05T00:00:00.000Z',
      endDate: '2026-11-20T00:00:00.000Z',
      goal: null,
      id: 'iteration-1',
      name: 'P4',
      projectId: 'project-1',
      startDate: '2026-11-05T00:00:00.000Z',
      status: 'NOT_STARTED',
      taskCount: 0,
      tasks: [],
      updatedAt: '2026-11-05T00:00:00.000Z',
    } satisfies IterationDetailDto;

    expect(iterationToForm(iteration)).toEqual({
      endDate: '2026-11-20',
      goal: '',
      name: 'P4',
      startDate: '2026-11-05',
    });
  });
});
