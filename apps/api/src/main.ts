import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const GLOBAL_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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

  Logger.log(`API listening on http://${host}:${port}/${GLOBAL_PREFIX}`, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  console.error(`API startup failed: ${message}`);
  process.exitCode = 1;
});
