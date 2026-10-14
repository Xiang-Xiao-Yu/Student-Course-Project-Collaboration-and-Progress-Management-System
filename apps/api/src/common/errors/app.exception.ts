import { HttpException, HttpStatus } from '@nestjs/common';

export interface AppExceptionPayload {
  code: string;
  details: unknown;
  message: string;
}

export class AppException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details: unknown = null) {
    super({ code, details, message } satisfies AppExceptionPayload, status);
  }
}
