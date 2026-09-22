import { ApiError } from './errors';

export interface ApiResponseMeta {
  readonly requestId: string;
  readonly timestamp: string;
}

interface ApiSuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
  readonly meta: ApiResponseMeta;
}

interface ApiErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly meta: ApiResponseMeta;
}

type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly getAccessToken: () => string | null | Promise<string | null>;
  readonly onUnauthorized: () => void;
  readonly fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  if (!isRecord(value) || typeof value['success'] !== 'boolean') {
    return false;
  }

  if (!isRecord(value['meta'])) {
    return false;
  }

  return value['success'] ? 'data' in value : isRecord(value['error']);
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null | Promise<string | null>;
  private readonly onUnauthorized: () => void;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.getAccessToken = options.getAccessToken;
    this.onUnauthorized = options.onUnauthorized;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');

    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const accessToken = await this.getAccessToken();

    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    let response: Response;

    try {
      response = await this.fetchImpl(joinUrl(this.baseUrl, path), {
        ...init,
        headers,
      });
    } catch {
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: '无法连接到服务，请检查网络后重试。',
      });
    }

    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      this.onUnauthorized();

      if (isApiEnvelope<never>(payload) && !payload.success) {
        throw new ApiError({
          code: payload.error.code,
          message: payload.error.message,
          status: response.status,
          details: payload.error.details,
        });
      }

      throw new ApiError({
        code: 'AUTH_SESSION_EXPIRED',
        message: '登录状态已失效，请重新登录。',
        status: response.status,
      });
    }

    if (!isApiEnvelope<T>(payload)) {
      throw new ApiError({
        code: 'API_INVALID_RESPONSE',
        message: '服务响应异常，请稍后重试。',
        status: response.status,
      });
    }

    if (payload.success) {
      return payload.data;
    }

    throw new ApiError({
      code: payload.error.code,
      message: payload.error.message,
      status: response.status,
      details: payload.error.details,
    });
  }

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...init, method: 'GET' });
  }

  post<TResponse, TBody = never>(path: string, body?: TBody): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}
