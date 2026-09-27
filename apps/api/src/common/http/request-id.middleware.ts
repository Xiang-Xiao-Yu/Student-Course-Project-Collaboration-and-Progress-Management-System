import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import { resolveRequestId, REQUEST_ID_HEADER } from './request-id';
import type { RequestWithId } from './request.types';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
