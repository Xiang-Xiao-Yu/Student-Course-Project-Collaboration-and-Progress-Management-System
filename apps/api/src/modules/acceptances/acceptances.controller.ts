import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { CreateAcceptanceDto } from './dto/create-acceptance.dto';
import { UpdateAcceptanceDto } from './dto/update-acceptance.dto';
import type {
  AcceptanceDetailResponse,
  AcceptanceSummaryResponse,
} from './interfaces/acceptance-response';
import { AcceptancesService } from './acceptances.service';

@Controller('projects/:projectId/acceptances')
@UseGuards(AuthGuard)
export class AcceptancesController {
  constructor(private readonly acceptancesService: AcceptancesService) {}

  @Get()
  listAcceptances(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<AcceptanceSummaryResponse[]> {
    return this.acceptancesService.listAcceptances(this.requireUserId(request), projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createAcceptance(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateAcceptanceDto,
  ): Promise<AcceptanceDetailResponse> {
    return this.acceptancesService.createAcceptance(this.requireUserId(request), projectId, dto);
  }

  @Get(':acceptanceId')
  getAcceptance(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('acceptanceId') acceptanceId: string,
  ): Promise<AcceptanceDetailResponse> {
    return this.acceptancesService.getAcceptance(
      this.requireUserId(request),
      projectId,
      acceptanceId,
    );
  }

  @Patch(':acceptanceId')
  updateAcceptance(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('acceptanceId') acceptanceId: string,
    @Body() dto: UpdateAcceptanceDto,
  ): Promise<AcceptanceDetailResponse> {
    return this.acceptancesService.updateAcceptance(
      this.requireUserId(request),
      projectId,
      acceptanceId,
      dto,
    );
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
