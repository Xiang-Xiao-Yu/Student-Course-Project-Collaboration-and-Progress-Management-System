import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { AcceptancesController } from './acceptances.controller';
import { AcceptancesService } from './acceptances.service';
import { AcceptancesRepository } from './repositories/acceptances.repository';

@Module({
  controllers: [AcceptancesController],
  imports: [AuthModule, ProjectsModule, UsersModule],
  providers: [AcceptancesRepository, AcceptancesService],
})
export class AcceptancesModule {}
