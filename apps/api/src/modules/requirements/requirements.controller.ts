import {
  Body,
  Controller,
  Delete,
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
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';
import type { RequirementResponse } from './interfaces/requirement-response';
import { RequirementsService } from './requirements.service';

@Controller('projects/:projectId/requirements')
@UseGuards(AuthGuard)
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Get()
  listRequirements(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<RequirementResponse[]> {
    return this.requirementsService.listRequirements(this.requireUserId(request), projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createRequirement(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateRequirementDto,
  ): Promise<RequirementResponse> {
    return this.requirementsService.createRequirement(this.requireUserId(request), projectId, dto);
  }

  @Get(':requirementId')
  getRequirement(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('requirementId') requirementId: string,
  ): Promise<RequirementResponse> {
    return this.requirementsService.getRequirement(
      this.requireUserId(request),
      projectId,
      requirementId,
    );
  }

  @Patch(':requirementId')
  updateRequirement(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('requirementId') requirementId: string,
    @Body() dto: UpdateRequirementDto,
  ): Promise<RequirementResponse> {
    return this.requirementsService.updateRequirement(
      this.requireUserId(request),
      projectId,
      requirementId,
      dto,
    );
  }

  @Delete(':requirementId')
  deleteRequirement(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('requirementId') requirementId: string,
  ): Promise<{ deleted: true }> {
    return this.requirementsService.deleteRequirement(
      this.requireUserId(request),
      projectId,
      requirementId,
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
