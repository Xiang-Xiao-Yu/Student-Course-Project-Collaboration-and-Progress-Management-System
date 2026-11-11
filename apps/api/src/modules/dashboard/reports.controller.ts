import { Controller, Get, HttpStatus, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { AppException } from '../../common/errors/app.exception';
import { setCsvDownloadHeaders } from '../../common/export/csv';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { RawResponse } from '../../common/http/raw-response.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { ReportsService } from './reports.service';

@Controller('projects/:projectId/reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('progress')
  @RawResponse()
  async exportProgressReport(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const result = await this.reportsService.exportProgressReport(
      this.requireUserId(request),
      projectId,
    );
    setCsvDownloadHeaders(response, result.filename);

    return result.content;
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
