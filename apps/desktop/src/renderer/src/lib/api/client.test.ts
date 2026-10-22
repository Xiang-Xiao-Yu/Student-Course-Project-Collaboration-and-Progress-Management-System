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
  it('posts multipart form data without forcing a JSON content type', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(successEnvelope({ avatarUrl: 'data:image/png;base64,AA==' })),
    );
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3000/api/v1',
      getAccessToken: () => 'avatar-access-token',
      onUnauthorized: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const formData = new FormData();
    formData.append('avatar', new Blob(['image-bytes'], { type: 'image/png' }), 'avatar.png');

    await expect(client.postFormData('/users/me/avatar', formData)).resolves.toEqual({
      avatarUrl: 'data:image/png;base64,AA==',
    });
    const request = fetchImpl.mock.calls[0]?.[1];
    const requestHeaders = request?.headers as Headers;

    expect(request?.body).toBe(formData);
    expect(requestHeaders.get('Authorization')).toBe('Bearer avatar-access-token');
    expect(requestHeaders.has('Content-Type')).toBe(false);
  });

  it('正常场景为 DELETE 携带 JSON 确认信息', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(successEnvelope({ deleted: true })),
    );
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3000/api/v1',
      getAccessToken: () => 'delete-access-token',
      onUnauthorized: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.delete<{ deleted: true }, { confirmName: string }>('/projects/project-1', {
        confirmName: '课程项目',
      }),
    ).resolves.toEqual({ deleted: true });

    const request = fetchImpl.mock.calls[0]?.[1];
    const requestHeaders = request?.headers as Headers;

    expect(request?.method).toBe('DELETE');
    expect(request?.body).toBe(JSON.stringify({ confirmName: '课程项目' }));
    expect(requestHeaders.get('Content-Type')).toBe('application/json');
  });

  it('当前密码错误返回 422 时保留会话', async () => {
    const onUnauthorized = vi.fn();
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3000/api/v1',
      getAccessToken: () => 'mock-access-token',
      onUnauthorized,
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: { code: 'AUTH_CURRENT_PASSWORD_INVALID', message: '当前密码不正确' },
            meta: { requestId: 'password-error', timestamp: '2026-10-19T00:00:00.000Z' },
          },
          422,
        ),
    });

    await expect(client.request('/users/me/password', { method: 'PATCH' })).rejects.toMatchObject({
      code: 'AUTH_CURRENT_PASSWORD_INVALID',
      status: 422,
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

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

  it('binds the native fetch to globalThis in Chromium', async () => {
    const nativeFetch = vi.fn(function (
      this: unknown,
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }

      return Promise.resolve(jsonResponse(successEnvelope({ ok: true })));
    });
    vi.stubGlobal('fetch', nativeFetch);

    try {
      const client = new ApiClient({
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        getAccessToken: () => null,
        onUnauthorized: vi.fn(),
      });

      await expect(client.get<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
      expect(nativeFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
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
    expect(onUnauthorized).toHaveBeenCalledWith('expired-token');
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
