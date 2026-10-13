import { describe, expect, it } from 'vitest';

import { hasFormErrors, validateLoginForm, validateRegisterForm } from './auth-validation';

describe('auth form validation', () => {
  it('正常场景接受有效登录和注册输入', () => {
    expect(hasFormErrors(validateLoginForm({ password: 'password1', username: 'tester' }))).toBe(
      false,
    );
    expect(
      hasFormErrors(
        validateRegisterForm({
          confirmPassword: 'password1',
          nickname: '测试用户',
          password: 'password1',
          username: 'tester',
        }),
      ),
    ).toBe(false);
  });

  it('边界场景拒绝超长用户名、昵称和密码', () => {
    const errors = validateRegisterForm({
      confirmPassword: 'password1',
      nickname: 'n'.repeat(51),
      password: 'p'.repeat(129),
      username: 'u'.repeat(65),
    });

    expect(errors.username).toBeDefined();
    expect(errors.nickname).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it('失败场景提示密码过短和两次密码不一致', () => {
    const errors = validateRegisterForm({
      confirmPassword: 'different',
      nickname: '测试用户',
      password: 'short',
      username: 'tester',
    });

    expect(errors.password).toBe('密码至少需要 8 个字符。');
    expect(errors.confirmPassword).toBe('两次输入的密码不一致。');
  });
});
