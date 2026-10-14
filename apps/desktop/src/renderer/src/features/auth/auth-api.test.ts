import { describe, expect, it, vi } from 'vitest';

import { parseSessionDuration, signInWithPassword } from './auth-api';

describe('auth API', () => {
  it('正常场景按登录契约映射会话', async () => {
    const api = {
      post: vi.fn(async () => ({
        accessToken: 'access-token',
        expiresIn: '2h',
        tokenType: 'Bearer' as const,
        user: {
          id: 'user-1',
          nickname: '测试用户',
          username: 'tester',
        },
      })),
    };
    const session = await signInWithPassword(api as never, {
      password: 'password1',
      username: 'tester',
    });

    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      password: 'password1',
      username: 'tester',
    });
    expect(session.user).toEqual({
      displayName: '测试用户',
      id: 'user-1',
      username: 'tester',
    });
  });

  it('边界场景支持秒、分、时、天过期时间', () => {
    expect(parseSessionDuration('10s', 1_000)).toBe(11_000);
    expect(parseSessionDuration('2m', 1_000)).toBe(121_000);
    expect(parseSessionDuration('1h', 1_000)).toBe(3_601_000);
    expect(parseSessionDuration('1d', 1_000)).toBe(86_401_000);
  });

  it('失败场景对非法过期时间使用安全默认值', () => {
    expect(parseSessionDuration('invalid', 1_000)).toBe(1_000 + 2 * 60 * 60 * 1000);
  });
});
