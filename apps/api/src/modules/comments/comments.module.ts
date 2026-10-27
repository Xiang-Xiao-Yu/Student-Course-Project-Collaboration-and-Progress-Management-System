import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentsRepository } from './repositories/comments.repository';

@Module({
  controllers: [CommentsController],
  imports: [AuthModule, ProjectsModule, UsersModule],
  providers: [CommentsRepository, CommentsService],
})
export class CommentsModule {}
