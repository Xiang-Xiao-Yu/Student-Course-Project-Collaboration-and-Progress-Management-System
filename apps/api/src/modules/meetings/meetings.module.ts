import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingsRepository } from './repositories/meetings.repository';

@Module({
  controllers: [MeetingsController],
  imports: [AuthModule, ProjectsModule, UsersModule],
  providers: [MeetingsRepository, MeetingsService],
})
export class MeetingsModule {}
