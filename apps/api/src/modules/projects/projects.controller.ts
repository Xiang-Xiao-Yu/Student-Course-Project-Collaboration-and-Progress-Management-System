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
import { CreateProjectDto } from './dto/create-project.dto';
import { DeleteProjectDto } from './dto/delete-project.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectResponse } from './interfaces/project-response';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  listProjects(@Req() request: AuthenticatedRequest): Promise<ProjectResponse[]> {
    return this.projectsService.listProjects(this.requireUserId(request));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createProject(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projectsService.createProject(this.requireUserId(request), dto);
  }

  @Get(':projectId')
  getProject(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<ProjectResponse> {
    return this.projectsService.getProject(this.requireUserId(request), projectId);
  }

  @Patch(':projectId')
  updateProject(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projectsService.updateProject(this.requireUserId(request), projectId, dto);
  }

  @Patch(':projectId/status')
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectStatusDto,
  ): Promise<ProjectResponse> {
    return this.projectsService.updateStatus(this.requireUserId(request), projectId, dto);
  }

  @Post(':projectId/archive')
  @HttpCode(HttpStatus.OK)
  archiveProject(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<ProjectResponse> {
    return this.projectsService.archiveProject(this.requireUserId(request), projectId);
  }

  @Delete(':projectId')
  deleteProject(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: DeleteProjectDto,
  ): Promise<{ deleted: true }> {
    return this.projectsService.deleteProject(this.requireUserId(request), projectId, dto);
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
