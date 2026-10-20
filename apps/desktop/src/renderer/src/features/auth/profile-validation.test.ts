import { describe, expect, it } from 'vitest';

import { hasFormErrors, validatePasswordForm, validateProfileForm } from './auth-validation';

describe('profile form validation', () => {
  it('正常场景接受有效的昵称、头像和改密输入', () => {
    expect(
      hasFormErrors(
        validateProfileForm({
          avatarUrl: 'https://example.com/avatar.png',
          nickname: '新昵称',
        }),
      ),
    ).toBe(false);
    expect(
      hasFormErrors(
        validatePasswordForm({
          confirmPassword: 'new-password',
          currentPassword: 'old-password',
          newPassword: 'new-password',
        }),
      ),
    ).toBe(false);
  });

  it('边界场景拒绝空昵称和过长头像地址', () => {
    const errors = validateProfileForm({
      avatarUrl: 'a'.repeat(2049),
      nickname: '   ',
    });

    expect(errors.nickname).toBeDefined();
    expect(errors.avatarUrl).toBeDefined();
  });

  it('失败场景提示改密不一致和当前密码缺失', () => {
    const errors = validatePasswordForm({
      confirmPassword: 'different',
      currentPassword: '',
      newPassword: 'short',
    });

    expect(errors.currentPassword).toBe('请输入当前密码。');
    expect(errors.newPassword).toBe('新密码至少需要 8 个字符。');
    expect(errors.confirmPassword).toBe('两次输入的新密码不一致。');
  });
});
