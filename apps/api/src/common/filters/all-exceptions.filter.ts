import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

import { createApiMeta, ApiErrorResponse } from '../http/api-response';
import type { RequestWithId } from '../http/request.types';

interface ResolvedException {
  code: string;
  details: unknown;
  message: string;
  status: number;
}

const ERROR_DEFINITIONS: Readonly<Record<number, Omit<ResolvedException, 'details' | 'status'>>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'BAD_REQUEST',
    message: '请求参数错误',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'UNAUTHORIZED',
    message: '未认证或登录已过期',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'FORBIDDEN',
    message: '没有权限执行此操作',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'NOT_FOUND',
    message: '请求的资源不存在',
  },
  [HttpStatus.CONFLICT]: {
    code: 'CONFLICT',
    message: '数据冲突',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'VALIDATION_FAILED',
    message: '业务校验失败',
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    code: 'INTERNAL_SERVER_ERROR',
    message: '服务器内部错误',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveException(exception: unknown): ResolvedException {
  if (!(exception instanceof HttpException)) {
    return {
      code: 'INTERNAL_SERVER_ERROR',
      details: null,
      message: '服务器内部错误',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  const status = exception.getStatus();
  const definition = ERROR_DEFINITIONS[status] ?? {
    code: 'HTTP_ERROR',
    message: '请求处理失败',
  };
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return {
      ...definition,
      details: null,
      status,
      message: response,
    };
  }

  if (isRecord(response)) {
    const responseMessage = response['message'];

    if (
      Array.isArray(responseMessage) &&
      responseMessage.every((message) => typeof message === 'string')
    ) {
      return {
        code: 'VALIDATION_FAILED',
        details: responseMessage,
        message: '请求参数校验失败',
        status,
      };
    }

    if (typeof responseMessage === 'string') {
      return {
        ...definition,
        details: null,
        status,
        message: responseMessage,
      };
    }
  }

  return {
    ...definition,
    details: null,
    status,
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const resolved = resolveException(exception);

    if (resolved.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error('Unhandled API exception');
    }

    const body: ApiErrorResponse = {
      error: {
        code: resolved.code,
        details: resolved.details,
        message: resolved.message,
      },
      meta: createApiMeta(request.requestId ?? randomUUID()),
      success: false,
    };

    response.status(resolved.status).json(body);
  }
}
