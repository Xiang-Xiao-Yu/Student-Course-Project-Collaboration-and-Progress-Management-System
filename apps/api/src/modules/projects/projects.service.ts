import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { DeleteProjectDto } from './dto/delete-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';
import type { ProjectResponse } from './interfaces/project-response';
import { ProjectAccessService } from './project-access.service';
import { PROJECT_STATUS_TRANSITIONS, ProjectRole, ProjectStatus } from './project.constants';
import {
  ProjectsRepository,
  ProjectRecord,
  ProjectWithMembershipRecord,
} from './repositories/projects.repository';

function isDateRangeValid(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): boolean {
  return !startDate || !endDate || startDate.getTime() <= endDate.getTime();
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectAccessService: ProjectAccessService,
    private readonly projectsRepository: ProjectsRepository,
  ) {}

  async listProjects(userId: string): Promise<ProjectResponse[]> {
    const user = await this.projectsRepository.findUserAccess(userId);

    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    }

    const projects = await this.projectsRepository.listProjectsForUser(
      userId,
      user.isPlatformAdmin,
    );

    return projects.map((project) => this.toListResponse(project, user.isPlatformAdmin));
  }

  async createProject(userId: string, dto: CreateProjectDto): Promise<ProjectResponse> {
    const startDate = dto.startDate ? new Date(dto.startDate) : undefined;
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;

    if (!isDateRangeValid(startDate, endDate)) {
      throw this.invalidDateRange();
    }

    const project = await this.projectsRepository.createProject(userId, {
      description: dto.description,
      endDate,
      name: dto.name,
      startDate,
    });

    return this.toResponse(project, 'OWNER');
  }

  async getProject(userId: string, projectId: string): Promise<ProjectResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'PROJECT_VIEW',
    );

    return this.toResponse(
      access.project,
      access.isPlatformAdmin ? 'ADMIN' : (access.role ?? 'OBSERVER'),
    );
  }

  async updateProject(
    userId: string,
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'PROJECT_UPDATE',
    );

    if (access.project.status === 'ARCHIVED') {
      throw this.projectArchived();
    }

    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.startDate === undefined &&
      dto.endDate === undefined
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        '请至少提供一个需要更新的字段',
      );
    }

    const startDate =
      dto.startDate !== undefined ? new Date(dto.startDate) : access.project.startDate;
    const endDate = dto.endDate !== undefined ? new Date(dto.endDate) : access.project.endDate;

    if (!isDateRangeValid(startDate, endDate)) {
      throw this.invalidDateRange();
    }

    const afterValue = {
      description: dto.description ?? access.project.description,
      endDate: endDate?.toISOString() ?? null,
      name: dto.name ?? access.project.name,
      startDate: startDate?.toISOString() ?? null,
    };
    const project = await this.projectsRepository.updateProject(
      projectId,
      userId,
      {
        description: dto.description,
        endDate: dto.endDate !== undefined ? endDate : undefined,
        name: dto.name,
        startDate: dto.startDate !== undefined ? startDate : undefined,
      },
      this.toActivityValue(access.project),
      afterValue,
    );

    return this.toResponse(project, access.isPlatformAdmin ? 'ADMIN' : (access.role ?? 'OBSERVER'));
  }

  async updateStatus(
    userId: string,
    projectId: string,
    dto: UpdateProjectStatusDto,
  ): Promise<ProjectResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'PROJECT_STATUS_UPDATE',
    );
    const currentStatus = access.project.status as ProjectStatus;

    if (
      currentStatus === 'ARCHIVED' ||
      !PROJECT_STATUS_TRANSITIONS[currentStatus].includes(dto.status)
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PROJECT_STATUS_TRANSITION_INVALID',
        '当前项目状态不能转换为目标状态',
      );
    }

    const project = await this.projectsRepository.updateProjectStatus(
      projectId,
      userId,
      dto.status,
      currentStatus,
    );

    return this.toResponse(project, access.isPlatformAdmin ? 'ADMIN' : (access.role ?? 'OBSERVER'));
  }

  async archiveProject(userId: string, projectId: string): Promise<ProjectResponse> {
    return this.updateStatus(userId, projectId, { status: 'ARCHIVED' });
  }

  async deleteProject(
    userId: string,
    projectId: string,
    dto: DeleteProjectDto,
  ): Promise<{ deleted: true }> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'PROJECT_DELETE',
    );

    if (dto.confirmName !== access.project.name) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PROJECT_DELETE_CONFIRMATION_MISMATCH',
        '项目名称确认不匹配',
      );
    }

    await this.projectsRepository.deleteProject(projectId);

    return { deleted: true };
  }

  private toListResponse(
    project: ProjectWithMembershipRecord,
    isPlatformAdmin: boolean,
  ): ProjectResponse {
    const role = (project.members[0]?.role as ProjectRole | undefined) ?? null;

    return this.toResponse(project, isPlatformAdmin ? 'ADMIN' : (role ?? 'OBSERVER'));
  }

  private toResponse(project: ProjectRecord, accessRole: ProjectRole | 'ADMIN'): ProjectResponse {
    return {
      accessRole,
      createdAt: project.createdAt.toISOString(),
      description: project.description,
      endDate: project.endDate?.toISOString() ?? null,
      id: project.id,
      name: project.name,
      ownerId: project.ownerId,
      startDate: project.startDate?.toISOString() ?? null,
      status: project.status as ProjectStatus,
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  private toActivityValue(project: ProjectRecord): unknown {
    return {
      description: project.description,
      endDate: project.endDate?.toISOString() ?? null,
      name: project.name,
      startDate: project.startDate?.toISOString() ?? null,
    };
  }

  private invalidDateRange(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'PROJECT_DATE_RANGE_INVALID',
      '项目结束日期不能早于开始日期',
    );
  }

  private projectArchived(): AppException {
    return new AppException(HttpStatus.CONFLICT, 'PROJECT_ARCHIVED', '已归档项目只读，不能修改');
  }
}
