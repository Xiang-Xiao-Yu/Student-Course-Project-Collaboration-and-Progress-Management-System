import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { DashboardService } from './dashboard.service';
import type { DashboardResponse } from './interfaces/dashboard-response';
import { HttpStatus } from '@nestjs/common';

@Controller('projects/:projectId')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  getDashboard(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<DashboardResponse> {
    return this.dashboardService.getDashboard(this.requireUserId(request), projectId);
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const userId = request.authUser?.id;

    if (!userId) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    }

    return userId;
  }
}
