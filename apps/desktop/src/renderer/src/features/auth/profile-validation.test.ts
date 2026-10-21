import { describe, expect, it } from 'vitest';

import {
  hasFormErrors,
  MAX_AVATAR_FILE_BYTES,
  validateAvatarFile,
  validatePasswordForm,
  validateProfileForm,
} from './auth-validation';

describe('profile form validation', () => {
  it('accepts supported image types up to the avatar size limit', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: MAX_AVATAR_FILE_BYTES })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: 12 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/webp', size: 12 })).toBeNull();
  });

  it('rejects empty, oversized, and unsupported avatar files', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 0 })).toBe('所选图片为空文件。');
    expect(validateAvatarFile({ type: 'image/png', size: MAX_AVATAR_FILE_BYTES + 1 })).toBe(
      '头像图片不能超过 10 MiB。',
    );
    expect(validateAvatarFile({ type: 'image/svg+xml', size: 12 })).toBe(
      '请选择 JPEG、PNG 或 WebP 图片。',
    );
  });

  it('正常场景接受有效的昵称、头像和改密输入', () => {
    expect(
      hasFormErrors(
        validateProfileForm({
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

  it('边界场景拒绝空昵称', () => {
    const errors = validateProfileForm({
      nickname: '   ',
    });

    expect(errors.nickname).toBeDefined();
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
