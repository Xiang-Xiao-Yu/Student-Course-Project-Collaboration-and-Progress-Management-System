import { describe, expect, it } from 'vitest';

import { ApiError, getUserFacingError } from './errors';

describe('getUserFacingError', () => {
  it('正常场景返回服务端提供的用户消息', () => {
    const error = new ApiError({
      code: 'PROJECT_NOT_FOUND',
      message: '项目不存在。',
      status: 404,
    });

    expect(getUserFacingError(error)).toBe('项目不存在。');
  });

  it('边界场景按 HTTP 状态提供默认提示', () => {
    const error = new ApiError({
      code: 'UNKNOWN',
      message: '',
      status: 403,
    });

    expect(getUserFacingError(error)).toBe('当前账号没有执行此操作的权限。');
  });

  it('失败场景不泄露未知异常内容', () => {
    expect(getUserFacingError(new Error('SQLITE_BUSY at internal/path'))).toBe(
      '操作未完成，请稍后重试。',
    );
  });
});
