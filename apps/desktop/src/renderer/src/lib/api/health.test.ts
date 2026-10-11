import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './errors';
import { checkApiHealth } from './health';

describe('checkApiHealth', () => {
  it('正常场景返回成功状态并调用冻结的 health 路径', async () => {
    const get = vi.fn(async () => ({ status: 'ok' }));

    await expect(checkApiHealth({ get })).resolves.toEqual({ status: 'ok' });
    expect(get).toHaveBeenCalledWith('/health');
  });

  it('边界场景将 HTTP 错误转换成安全提示', async () => {
    const get = vi.fn(async () => {
      throw new ApiError({
        code: 'NOT_FOUND',
        message: '请求的数据不存在。',
        status: 404,
      });
    });

    await expect(checkApiHealth({ get })).resolves.toEqual({
      message: '请求的数据不存在。',
      status: 'error',
    });
  });

  it('失败场景不泄露未知异常中的内部路径', async () => {
    const get = vi.fn(async () => {
      throw new TypeError('ENOENT C:\\internal\\secret\\database.db');
    });

    const result = await checkApiHealth({ get });

    expect(result).toEqual({
      message: '操作未完成，请稍后重试。',
      status: 'error',
    });
    expect(result).not.toHaveProperty('stack');
  });
});
