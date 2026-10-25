import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ProjectAccessService } from './project-access.service';
import { ProjectMembersController } from './project-members.controller';
import { ProjectMembersService } from './project-members.service';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './repositories/projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectMembersController, ProjectsController],
  exports: [ProjectAccessService],
  imports: [AuthModule, UsersModule],
  providers: [ProjectAccessService, ProjectMembersService, ProjectsRepository, ProjectsService],
})
export class ProjectsModule {}
