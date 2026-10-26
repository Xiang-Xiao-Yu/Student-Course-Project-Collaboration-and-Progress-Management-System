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
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskResponse } from './interfaces/task-response';
import { TasksService } from './tasks.service';

@Controller('projects/:projectId/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  listTasks(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<TaskResponse[]> {
    return this.tasksService.listTasks(this.requireUserId(request), projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createTask(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasksService.createTask(this.requireUserId(request), projectId, dto);
  }

  @Get(':taskId')
  getTask(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskResponse> {
    return this.tasksService.getTask(this.requireUserId(request), projectId, taskId);
  }

  @Patch(':taskId')
  updateTask(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasksService.updateTask(this.requireUserId(request), projectId, taskId, dto);
  }

  @Patch(':taskId/status')
  updateTaskStatus(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ): Promise<TaskResponse> {
    return this.tasksService.updateTaskStatus(this.requireUserId(request), projectId, taskId, dto);
  }

  @Delete(':taskId')
  deleteTask(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<{ deleted: true }> {
    return this.tasksService.deleteTask(this.requireUserId(request), projectId, taskId);
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
