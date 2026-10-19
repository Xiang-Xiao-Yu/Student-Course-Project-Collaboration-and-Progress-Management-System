import { describe, expect, it, vi } from 'vitest';

import {
  changeCurrentUserPassword,
  createSessionAfterPasswordChange,
  updateCurrentUserProfile,
} from './auth-api';
import type { AuthSession } from './session-storage';

const existingSession: AuthSession = {
  accessToken: 'old-token',
  expiresAt: 1_000,
  user: {
    displayName: '旧昵称',
    id: 'user-1',
    username: 'tester',
  },
};

describe('profile API', () => {
  it('正常场景更新昵称和头像并返回安全资料', async () => {
    const profile = {
      avatarUrl: 'https://example.com/avatar.png',
      createdAt: '2026-10-19T00:00:00.000Z',
      id: 'user-1',
      nickname: '新昵称',
      status: 'ACTIVE',
      updatedAt: '2026-10-19T00:00:00.000Z',
      username: 'tester',
    };
    const api = { patch: vi.fn(async () => profile) };

    await expect(
      updateCurrentUserProfile(api as never, {
        avatarUrl: 'https://example.com/avatar.png',
        nickname: '新昵称',
      }),
    ).resolves.toEqual(profile);
    expect(api.patch).toHaveBeenCalledWith('/users/me', {
      avatarUrl: 'https://example.com/avatar.png',
      nickname: '新昵称',
    });
  });

  it('边界场景允许清空头像地址', async () => {
    const api = { patch: vi.fn(async () => ({ avatarUrl: null })) };

    await updateCurrentUserProfile(api as never, { avatarUrl: null });

    expect(api.patch).toHaveBeenCalledWith('/users/me', { avatarUrl: null });
  });

  it('失败场景改密响应会替换当前会话 Token 和过期时间', async () => {
    const api = {
      patch: vi.fn(async () => ({
        accessToken: 'new-token',
        expiresIn: '2h',
        tokenType: 'Bearer' as const,
      })),
    };

    const response = await changeCurrentUserPassword(api as never, {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    });
    const nextSession = createSessionAfterPasswordChange(existingSession, response, 10_000);

    expect(api.patch).toHaveBeenCalledWith('/users/me/password', {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    });
    expect(nextSession.accessToken).toBe('new-token');
    expect(nextSession.expiresAt).toBe(10_000 + 2 * 60 * 60 * 1000);
    expect(nextSession.user).toEqual(existingSession.user);
  });
});
