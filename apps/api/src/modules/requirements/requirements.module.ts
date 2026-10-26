import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsRepository } from './repositories/requirements.repository';
import { RequirementsService } from './requirements.service';

@Module({
  controllers: [RequirementsController],
  imports: [AuthModule, ProjectsModule],
  providers: [RequirementsRepository, RequirementsService],
})
export class RequirementsModule {}
