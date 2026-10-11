import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const GLOBAL_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  // Buffer Nest logs until startup succeeds so config errors cannot flush stack traces.
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    autoFlushLogs: false,
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const host = configService.getOrThrow<string>('APP_HOST');
  const port = configService.getOrThrow<number>('APP_PORT');
  const corsOrigins = configService.getOrThrow<string[]>('CORS_ORIGINS');

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableCors({
    origin: corsOrigins,
  });
  app.enableShutdownHooks();

  await app.listen(port, host);
  app.flushLogs();

  Logger.log(`API listening on http://${host}:${port}/${GLOBAL_PREFIX}`, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  console.error('API startup failed: ' + getSafeStartupErrorMessage(error));
  process.exitCode = 1;
});

const SAFE_STARTUP_ERROR_PATTERNS = [
  /^[A-Z][A-Z0-9_]* is required$/,
  /^APP_PORT must be an integer between 1 and 65535$/,
  /^NODE_ENV must be one of: [a-z, ]+$/,
  /^LOG_LEVEL must be one of: [a-z, ]+$/,
  /^CORS_ORIGINS must contain at least one origin$/,
  /^CORS_ORIGINS cannot contain \* in production$/,
  /^JWT_SECRET must not use the placeholder value in production$/,
];

function getSafeStartupErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';

  if (SAFE_STARTUP_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return message;
  }
  return 'configuration validation or service initialization failed';
}
