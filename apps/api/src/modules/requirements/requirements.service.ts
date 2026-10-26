import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { ProjectAccessService } from '../projects/project-access.service';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';
import type { RequirementResponse } from './interfaces/requirement-response';
import { REQUIREMENT_STATUS_TRANSITIONS, RequirementStatus } from './requirement.constants';
import { RequirementRecord, RequirementsRepository } from './repositories/requirements.repository';

@Injectable()
export class RequirementsService {
  constructor(
    private readonly projectAccessService: ProjectAccessService,
    private readonly requirementsRepository: RequirementsRepository,
  ) {}

  async listRequirements(userId: string, projectId: string): Promise<RequirementResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'REQUIREMENT_VIEW');
    const requirements = await this.requirementsRepository.listByProject(projectId);

    return requirements.map((requirement) => this.toResponse(requirement));
  }

  async getRequirement(
    userId: string,
    projectId: string,
    requirementId: string,
  ): Promise<RequirementResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'REQUIREMENT_VIEW');
    const requirement = await this.requireRequirement(projectId, requirementId);

    return this.toResponse(requirement);
  }

  async createRequirement(
    userId: string,
    projectId: string,
    dto: CreateRequirementDto,
  ): Promise<RequirementResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'REQUIREMENT_CREATE',
    );

    this.assertCanCreate(access.project.status);

    const requirement = await this.requirementsRepository.createRequirement(projectId, userId, {
      acceptanceCriteria: dto.acceptanceCriteria,
      description: dto.description,
      priority: dto.priority,
      title: dto.title,
    });

    return this.toResponse(requirement);
  }

  async updateRequirement(
    userId: string,
    projectId: string,
    requirementId: string,
    dto: UpdateRequirementDto,
  ): Promise<RequirementResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'REQUIREMENT_UPDATE',
    );

    this.assertNotArchived(access.project.status);
    const requirement = await this.requireRequirement(projectId, requirementId);

    if (
      dto.title === undefined &&
      dto.description === undefined &&
      dto.priority === undefined &&
      dto.acceptanceCriteria === undefined &&
      dto.status === undefined
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        '请至少提供一个需要更新的字段',
      );
    }

    if (dto.status !== undefined && dto.status !== requirement.status) {
      const currentStatus = requirement.status as RequirementStatus;

      if (!REQUIREMENT_STATUS_TRANSITIONS[currentStatus].includes(dto.status)) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'REQUIREMENT_STATUS_TRANSITION_INVALID',
          '当前需求状态不能转换为目标状态',
        );
      }
    }

    const updated = await this.requirementsRepository.updateRequirement(
      projectId,
      userId,
      requirement,
      {
        acceptanceCriteria: dto.acceptanceCriteria,
        description: dto.description,
        priority: dto.priority,
        status: dto.status,
        title: dto.title,
      },
    );

    return this.toResponse(updated);
  }

  async deleteRequirement(
    userId: string,
    projectId: string,
    requirementId: string,
  ): Promise<{ deleted: true }> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'REQUIREMENT_DELETE',
    );

    this.assertNotArchived(access.project.status);
    const requirement = await this.requireRequirement(projectId, requirementId);

    await this.requirementsRepository.deleteRequirement(projectId, userId, requirement);

    return { deleted: true };
  }

  private async requireRequirement(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementRecord> {
    const requirement = await this.requirementsRepository.findById(projectId, requirementId);

    if (!requirement) {
      throw new AppException(HttpStatus.NOT_FOUND, 'REQUIREMENT_NOT_FOUND', '需求不存在');
    }

    return requirement;
  }

  private assertCanCreate(projectStatus: string): void {
    if (projectStatus === 'ARCHIVED' || projectStatus === 'PAUSED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        projectStatus === 'ARCHIVED' ? 'PROJECT_ARCHIVED' : 'PROJECT_PAUSED',
        '当前项目状态不能新增业务数据',
      );
    }
  }

  private assertNotArchived(projectStatus: string): void {
    if (projectStatus === 'ARCHIVED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PROJECT_ARCHIVED',
        '已归档项目只读，不能修改需求',
      );
    }
  }

  private toResponse(requirement: RequirementRecord): RequirementResponse {
    return {
      acceptanceCriteria: requirement.acceptanceCriteria,
      createdAt: requirement.createdAt.toISOString(),
      creatorId: requirement.creatorId,
      description: requirement.description,
      id: requirement.id,
      number: requirement.number,
      priority: requirement.priority as RequirementResponse['priority'],
      projectId: requirement.projectId,
      status: requirement.status as RequirementStatus,
      title: requirement.title,
      updatedAt: requirement.updatedAt.toISOString(),
    };
  }
}
