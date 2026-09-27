export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta: ApiMeta;
  success: true;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    details: unknown;
    message: string;
  };
  meta: ApiMeta;
  success: false;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
