import 'reflect-metadata';

import { vi } from 'vitest';

vi.hoisted(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['APP_HOST'] = '127.0.0.1';
  process.env['APP_PORT'] = '3000';
  process.env['DATABASE_URL'] = 'file:../data/test.db';
  process.env['JWT_SECRET'] = 'test-only-secret';
  process.env['JWT_EXPIRES_IN'] = '15m';
  process.env['CORS_ORIGINS'] = 'http://localhost:5173';
  process.env['LOG_LEVEL'] = 'error';
});

import { BadRequestException, Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import type { ApiErrorResponse, ApiSuccessResponse } from './common/http/api-response';
import type { HealthStatus } from './health/health.service';
import { PrismaService } from './prisma/prisma.service';

@Controller('_test-errors')
class TestErrorsController {
  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException({ message: '参数错误' });
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('sensitive-value-must-not-leak');
  }
}

describe('API integration', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestErrorsController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo | string | null;

    if (!address || typeof address === 'string') {
      throw new Error('测试服务器未返回 TCP 地址');
    }

    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns a health status using the success envelope', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        'x-request-id': 'test-request-id',
      },
    });
    const body = (await response.json()) as ApiSuccessResponse<HealthStatus>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      service: 'scpc-api',
      status: 'ok',
    });
    expect(body.meta.requestId).toBe('test-request-id');
    expect(Number.isNaN(Date.parse(body.meta.timestamp))).toBe(false);
  });

  it('exposes the global Prisma service', () => {
    expect(app.get(PrismaService)).toBeDefined();
  });

  it('returns a business error using the failure envelope', async () => {
    const response = await fetch(`${baseUrl}/_test-errors/bad-request`);
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('参数错误');
  });

  it('returns a not-found error using the failure envelope', async () => {
    const response = await fetch(`${baseUrl}/missing-route`);
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('does not leak unexpected error details', async () => {
    const response = await fetch(`${baseUrl}/_test-errors/unexpected`);
    const body = (await response.json()) as ApiErrorResponse;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('服务器内部错误');
    expect(serialized).not.toContain('sensitive-value-must-not-leak');
  });
});
