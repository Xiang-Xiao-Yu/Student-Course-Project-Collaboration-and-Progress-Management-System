import { describe, expect, it } from 'vitest';

import type { AcceptanceDto } from './acceptance-api';
import {
  acceptanceToForm,
  formToCreateAcceptanceInput,
  getAcceptanceDateClearError,
  hasUnsavedAcceptanceChanges,
  validateAcceptanceForm,
} from './acceptance-validation';

const form = {
  acceptanceDate: '2026-11-20',
  failureReason: '',
  goal: '完成 P5',
  participantIds: ['user-1'],
  result: 'IN_PROGRESS' as const,
  stageName: 'P5 阶段验收',
  standards: '会议、行动项和阶段验收可完成。',
};

describe('P5 acceptance validation', () => {
  it('正常场景接受完整验收表单', () => {
    expect(validateAcceptanceForm(form)).toEqual({});
    expect(formToCreateAcceptanceInput(form)).toMatchObject({
      participantIds: ['user-1'],
      result: 'IN_PROGRESS',
      stageName: 'P5 阶段验收',
    });
  });

  it('边界场景验收未通过必须填写原因', () => {
    expect(validateAcceptanceForm({ ...form, result: 'FAILED' }).failureReason).toBe(
      '验收未通过时必须填写原因。',
    );
    expect(
      validateAcceptanceForm({ ...form, result: 'FAILED', failureReason: '缺少边界测试' }),
    ).toEqual({});
  });

  it('失败场景拒绝空名称、标准无效日期并识别未保存修改', () => {
    const errors = validateAcceptanceForm({
      ...form,
      acceptanceDate: '2026-02-30',
      stageName: ' ',
      standards: ' ',
    });

    expect(errors.stageName).toBe('请输入验收阶段名称。');
    expect(errors.standards).toBe('请输入验收标准。');
    expect(errors.acceptanceDate).toBe('请输入有效的验收日期。');
    expect(hasUnsavedAcceptanceChanges(form, { ...form, goal: '新目标' })).toBe(true);
  });

  it('边界场景将验收详情转换回表单', () => {
    const acceptance = {
      acceptanceDate: '2026-11-20T00:00:00.000Z',
      createdAt: '2026-11-09T00:00:00.000Z',
      createdById: 'user-1',
      failureReason: null,
      goal: '完成 P5',
      id: 'acceptance-1',
      participants: [
        {
          avatarUrl: null,
          id: 'user-1',
          nickname: '负责人',
          userId: 'user-1',
          username: 'owner',
        },
      ],
      projectId: 'project-1',
      remediationTaskCount: 0,
      remediationTasks: [],
      result: 'IN_PROGRESS',
      stageName: 'P5 阶段验收',
      standards: '标准',
      updatedAt: '2026-11-09T00:00:00.000Z',
    } satisfies AcceptanceDto;

    expect(acceptanceToForm(acceptance)).toMatchObject({
      acceptanceDate: '2026-11-20',
      participantIds: ['user-1'],
    });
  });

  it('边界场景阻止前端把无法清除的日期误报为保存成功', () => {
    expect(getAcceptanceDateClearError('2026-11-20', '')).toContain('暂不支持清除验收日期');
    expect(getAcceptanceDateClearError('2026-11-20', '2026-11-21')).toBeUndefined();
    expect(getAcceptanceDateClearError('', '')).toBeUndefined();
  });
});
