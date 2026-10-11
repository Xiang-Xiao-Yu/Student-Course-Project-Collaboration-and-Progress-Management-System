import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successEnvelope<T>(data: T): object {
  return {
    success: true,
    data,
    meta: {
      requestId: 'request-1',
      timestamp: '2026-09-22T00:00:00.000Z',
    },
  };
}

describe('ApiClient', () => {
  it('正常场景解析成功响应并附加 Bearer Token', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(successEnvelope({ id: 'project-1' })),
    );
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3000/api/v1/',
      getAccessToken: () => 'mock-access-token',
      onUnauthorized: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const data = await client.get<{ id: string }>('/projects');
    const requestHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;

    expect(data.id).toBe('project-1');
    expect(requestHeaders.get('Authorization')).toBe('Bearer mock-access-token');
  });

  it('边界场景没有 Token 时不附加认证头', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(successEnvelope([])),
    );
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3000/api/v1',
      getAccessToken: () => null,
      onUnauthorized: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.get<unknown[]>('/projects');
    const requestHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;

    expect(requestHeaders.has('Authorization')).toBe(false);
  });

  it('失败场景在 401 时清理会话并抛出稳定错误码', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(
        {
          success: false,
          error: {
            code: 'AUTH_SESSION_EXPIRED',
            message: '登录状态已失效，请重新登录。',
            details: null,
          },
          meta: {
            requestId: 'request-2',
            timestamp: '2026-09-22T00:00:00.000Z',
          },
        },
        401,
      ),
    );
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3000/api/v1',
      getAccessToken: () => 'expired-token',
      onUnauthorized,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.get('/projects')).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('失败场景将网络异常转换为 NETWORK_ERROR', async () => {
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3000/api/v1',
      getAccessToken: () => null,
      onUnauthorized: vi.fn(),
      fetchImpl: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
        throw new TypeError('network unavailable');
      }) as unknown as typeof fetch,
    });

    await expect(client.get('/health')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
