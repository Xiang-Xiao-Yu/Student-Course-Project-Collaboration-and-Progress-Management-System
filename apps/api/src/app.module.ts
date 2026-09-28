import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { resolve } from 'node:path';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { validateEnvironment } from './config/validate-environment';
import { HealthModule } from './health/health.module';
import { AcceptancesModule } from './modules/acceptances/acceptances.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommentsModule } from './modules/comments/comments.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { IterationsModule } from './modules/iterations/iterations.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RequirementsModule } from './modules/requirements/requirements.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [resolve(process.cwd(), '.env'), resolve(__dirname, '../../../.env')],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    HealthModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    RequirementsModule,
    TasksModule,
    IterationsModule,
    CommentsModule,
    MeetingsModule,
    AcceptancesModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  }
}
