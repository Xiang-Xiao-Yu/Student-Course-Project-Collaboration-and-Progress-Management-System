import { describe, expect, it } from 'vitest';

import {
  hasMemberInviteFormErrors,
  hasProjectFormErrors,
  hasUnsavedProjectChanges,
  validateDeleteConfirmation,
  validateMemberInviteForm,
  validateProjectForm,
} from './project-validation';

describe('P2 project validation', () => {
  it('正常场景接受有效项目和成员邀请信息', () => {
    expect(
      validateProjectForm({
        description: '课程项目简介',
        endDate: '2026-12-31',
        name: '项目协作系统',
        startDate: '2026-10-22',
      }),
    ).toEqual({});
    expect(validateMemberInviteForm({ role: 'MEMBER', username: 'student1' })).toEqual({});
    expect(validateDeleteConfirmation('课程项目', ' 课程项目 ')).toBeNull();
  });

  it('边界场景拒绝空名称、超长字段和无效日期', () => {
    const errors = validateProjectForm({
      description: 'x'.repeat(1001),
      endDate: '2026-02-30',
      name: ' ',
      startDate: '2026-10-22',
    });

    expect(errors.name).toBe('请输入项目名称。');
    expect(errors.description).toBe('项目简介不能超过 1000 个字符。');
    expect(errors.endDate).toBe('请输入有效的结束日期。');
    expect(hasProjectFormErrors(errors)).toBe(true);
  });

  it('失败场景识别倒序日期、错误确认名和未保存修改', () => {
    expect(
      validateProjectForm({
        description: '',
        endDate: '2026-10-21',
        name: '课程项目',
        startDate: '2026-10-22',
      }).endDate,
    ).toBe('结束日期不能早于开始日期。');
    expect(validateDeleteConfirmation('课程项目', '另一个项目')).toBe(
      '输入的项目名称与当前项目不一致。',
    );
    expect(
      hasMemberInviteFormErrors(
        validateMemberInviteForm({ role: 'MEMBER', username: 'x'.repeat(65) }),
      ),
    ).toBe(true);
    expect(
      hasUnsavedProjectChanges(
        { description: '', endDate: '', name: '课程项目', startDate: '' },
        { description: '', endDate: '', name: '新名称', startDate: '' },
      ),
    ).toBe(true);
  });
});
