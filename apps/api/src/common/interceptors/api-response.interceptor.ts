import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { map, Observable } from 'rxjs';

import { createApiMeta, ApiSuccessResponse } from '../http/api-response';
import type { RequestWithId } from '../http/request.types';

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const requestId = request.requestId ?? randomUUID();

    return next.handle().pipe(
      map((data) => ({
        data,
        meta: createApiMeta(requestId),
        success: true,
      })),
    );
  }
}
