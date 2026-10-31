import { Controller, Get, HttpStatus, Param, Query, Req, UseGuards } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';
import type { ActivityResponse } from './interfaces/activity-response';
import { ProjectActivityService } from './project-activity.service';

@Controller('projects/:projectId/activity')
@UseGuards(AuthGuard)
export class ProjectActivityController {
  constructor(private readonly projectActivityService: ProjectActivityService) {}

  @Get()
  listActivity(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query() query: ListActivityQueryDto,
  ): Promise<ActivityResponse[]> {
    return this.projectActivityService.listActivity(this.requireUserId(request), projectId, query);
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
