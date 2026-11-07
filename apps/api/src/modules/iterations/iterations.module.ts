import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { IterationsController } from './iterations.controller';
import { IterationsService } from './iterations.service';
import { IterationsRepository } from './repositories/iterations.repository';

@Module({
  controllers: [IterationsController],
  imports: [AuthModule, ProjectsModule],
  providers: [IterationsRepository, IterationsService],
})
export class IterationsModule {}
