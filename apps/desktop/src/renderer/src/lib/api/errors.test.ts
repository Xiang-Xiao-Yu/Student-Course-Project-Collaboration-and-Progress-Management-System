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

  it('项目权限与状态错误提供稳定中文提示', () => {
    expect(
      getUserFacingError(
        new ApiError({
          code: 'PROJECT_STATUS_TRANSITION_INVALID',
          message: '',
          status: 422,
        }),
      ),
    ).toBe('当前项目状态不能转换为目标状态。');
    expect(
      getUserFacingError(
        new ApiError({
          code: 'PROJECT_PERMISSION_DENIED',
          message: '',
          status: 403,
        }),
      ),
    ).toBe('当前账号没有执行此项目操作的权限。');
    expect(
      getUserFacingError(
        new ApiError({
          code: 'PROJECT_NOT_FOUND',
          message: '',
          status: 404,
        }),
      ),
    ).toBe('项目不存在或你无权访问该项目。');
  });

  it('负责人并发移交冲突提示用户刷新后重试', () => {
    expect(
      getUserFacingError(
        new ApiError({
          code: 'PROJECT_OWNER_TRANSFER_CONFLICT',
          message: '',
          status: 409,
        }),
      ),
    ).toBe('项目负责人或成员状态已变化，请刷新后重试。');
  });
});
