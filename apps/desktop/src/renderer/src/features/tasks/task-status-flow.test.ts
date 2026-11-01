import { describe, expect, it } from 'vitest';

import {
  canRejectPendingTask,
  decideTaskStatusTransition,
  validateTaskTransitionValues,
} from './task-status-flow';

describe('P3 task status flow', () => {
  it('正常场景直接推进或要求完成说明和重新打开原因', () => {
    expect(decideTaskStatusTransition('TODO', 'IN_PROGRESS', null, false)).toEqual({
      type: 'direct',
    });
    expect(decideTaskStatusTransition('IN_PROGRESS', 'PENDING_REVIEW', '已有说明', false)).toEqual({
      initialValue: '已有说明',
      mode: 'completion',
      type: 'dialog',
    });
    expect(decideTaskStatusTransition('COMPLETED', 'IN_PROGRESS', '完成说明', true)).toEqual({
      initialValue: '',
      mode: 'reopen',
      type: 'dialog',
    });
    expect(
      decideTaskStatusTransition(
        'PENDING_REVIEW',
        'PENDING_REVIEW',
        '完成说明',
        true,
        '需补充测试',
      ),
    ).toEqual({
      initialValue: '完成说明',
      mode: 'completion',
      type: 'dialog',
    });
  });

  it('边界场景只有负责人或管理员可以审核完成', () => {
    expect(decideTaskStatusTransition('PENDING_REVIEW', 'COMPLETED', '说明', false)).toEqual({
      message: '只有项目负责人或平台管理员可以审核通过任务。',
      type: 'error',
    });
    expect(decideTaskStatusTransition('PENDING_REVIEW', 'COMPLETED', '说明', true)).toMatchObject({
      mode: 'completion',
      type: 'dialog',
    });
  });

  it('失败场景拒绝非法跳转和空说明', () => {
    expect(decideTaskStatusTransition('TODO', 'COMPLETED', null, true)).toMatchObject({
      type: 'error',
    });
    expect(
      validateTaskTransitionValues('completion', {
        completionNote: ' ',
        rejectionReason: '',
        reopenReason: '',
      }),
    ).toBe('请填写任务完成说明。');
    expect(
      validateTaskTransitionValues('reopen', {
        completionNote: '说明',
        rejectionReason: '',
        reopenReason: '',
      }),
    ).toBe('请填写重新打开任务的原因。');
    expect(
      validateTaskTransitionValues('rejection', {
        completionNote: '',
        rejectionReason: ' ',
        reopenReason: '',
      }),
    ).toBe('请填写审核不通过原因。');
    expect(canRejectPendingTask('PENDING_REVIEW', true)).toBe(true);
    expect(canRejectPendingTask('PENDING_REVIEW', false)).toBe(false);
  });
});
