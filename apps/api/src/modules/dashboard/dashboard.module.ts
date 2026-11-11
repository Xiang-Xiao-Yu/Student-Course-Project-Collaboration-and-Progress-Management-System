import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './repositories/dashboard.repository';

@Module({
  controllers: [DashboardController],
  imports: [AuthModule, ProjectsModule, UsersModule],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
