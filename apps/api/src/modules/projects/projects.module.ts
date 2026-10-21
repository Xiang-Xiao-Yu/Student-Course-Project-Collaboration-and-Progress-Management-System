import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectAccessService } from './project-access.service';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './repositories/projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  exports: [ProjectAccessService],
  imports: [AuthModule],
  providers: [ProjectAccessService, ProjectsRepository, ProjectsService],
})
export class ProjectsModule {}
