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
import { AddIterationTaskDto } from './dto/add-iteration-task.dto';
import { CloseIterationDto } from './dto/close-iteration.dto';
import { CreateIterationDto } from './dto/create-iteration.dto';
import { UpdateIterationDto } from './dto/update-iteration.dto';
import type {
  IterationDetailResponse,
  IterationResponse,
  IterationStatsResponse,
} from './interfaces/iteration-response';
import { IterationsService } from './iterations.service';

@Controller('projects/:projectId/iterations')
@UseGuards(AuthGuard)
export class IterationsController {
  constructor(private readonly iterationsService: IterationsService) {}

  @Get()
  listIterations(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<IterationResponse[]> {
    return this.iterationsService.listIterations(this.requireUserId(request), projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createIteration(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateIterationDto,
  ): Promise<IterationDetailResponse> {
    return this.iterationsService.createIteration(this.requireUserId(request), projectId, dto);
  }

  @Get(':iterationId')
  getIteration(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
  ): Promise<IterationDetailResponse> {
    return this.iterationsService.getIteration(this.requireUserId(request), projectId, iterationId);
  }

  @Patch(':iterationId')
  updateIteration(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
    @Body() dto: UpdateIterationDto,
  ): Promise<IterationDetailResponse> {
    return this.iterationsService.updateIteration(
      this.requireUserId(request),
      projectId,
      iterationId,
      dto,
    );
  }

  @Delete(':iterationId')
  deleteIteration(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
  ): Promise<{ deleted: true }> {
    return this.iterationsService.deleteIteration(
      this.requireUserId(request),
      projectId,
      iterationId,
    );
  }

  @Post(':iterationId/tasks')
  @HttpCode(HttpStatus.OK)
  addTask(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
    @Body() dto: AddIterationTaskDto,
  ): Promise<IterationDetailResponse> {
    return this.iterationsService.addTask(this.requireUserId(request), projectId, iterationId, dto);
  }

  @Delete(':iterationId/tasks/:taskId')
  removeTask(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
    @Param('taskId') taskId: string,
  ): Promise<IterationDetailResponse> {
    return this.iterationsService.removeTask(
      this.requireUserId(request),
      projectId,
      iterationId,
      taskId,
    );
  }

  @Post(':iterationId/close')
  @HttpCode(HttpStatus.OK)
  closeIteration(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
    @Body() dto: CloseIterationDto,
  ): Promise<IterationDetailResponse> {
    return this.iterationsService.closeIteration(
      this.requireUserId(request),
      projectId,
      iterationId,
      dto,
    );
  }

  @Get(':iterationId/stats')
  getStats(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
  ): Promise<IterationStatsResponse> {
    return this.iterationsService.getStats(this.requireUserId(request), projectId, iterationId);
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
