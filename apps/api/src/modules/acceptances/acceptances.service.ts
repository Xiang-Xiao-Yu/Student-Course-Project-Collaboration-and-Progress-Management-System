import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { ProjectAccessService } from '../projects/project-access.service';
import { AvatarStorageService } from '../users/avatar-storage.service';
import type { AcceptanceResult } from './acceptance.constants';
import { CreateAcceptanceDto } from './dto/create-acceptance.dto';
import { UpdateAcceptanceDto } from './dto/update-acceptance.dto';
import type {
  AcceptanceDetailResponse,
  AcceptanceSummaryResponse,
} from './interfaces/acceptance-response';
import {
  AcceptanceDetailRecord,
  AcceptanceSummaryRecord,
  AcceptancesRepository,
} from './repositories/acceptances.repository';

@Injectable()
export class AcceptancesService {
  constructor(
    private readonly acceptancesRepository: AcceptancesRepository,
    private readonly projectAccessService: ProjectAccessService,
    private readonly avatarStorage: AvatarStorageService,
  ) {}

  async listAcceptances(userId: string, projectId: string): Promise<AcceptanceSummaryResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'ACCEPTANCE_VIEW');
    const acceptances = await this.acceptancesRepository.listByProject(projectId);

    return acceptances.map((acceptance) => this.toSummary(acceptance));
  }

  async getAcceptance(
    userId: string,
    projectId: string,
    acceptanceId: string,
  ): Promise<AcceptanceDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'ACCEPTANCE_VIEW');
    const acceptance = await this.acceptancesRepository.findById(projectId, acceptanceId);

    if (!acceptance) {
      throw this.acceptanceNotFound();
    }

    return this.toDetail(acceptance);
  }

  async createAcceptance(
    userId: string,
    projectId: string,
    dto: CreateAcceptanceDto,
  ): Promise<AcceptanceDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'ACCEPTANCE_MANAGE');
    const acceptance = await this.acceptancesRepository.createAcceptance(projectId, userId, {
      acceptanceDate: this.parseDate(dto.acceptanceDate),
      failureReason: this.optionalText(dto.failureReason),
      goal: this.optionalText(dto.goal),
      participantIds: dto.participantIds,
      result: dto.result,
      stageName: dto.stageName,
      standards: dto.standards,
    });

    return this.toDetail(acceptance);
  }

  async updateAcceptance(
    userId: string,
    projectId: string,
    acceptanceId: string,
    dto: UpdateAcceptanceDto,
  ): Promise<AcceptanceDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'ACCEPTANCE_MANAGE');

    if (
      dto.acceptanceDate === undefined &&
      dto.failureReason === undefined &&
      dto.goal === undefined &&
      dto.participantIds === undefined &&
      dto.result === undefined &&
      dto.stageName === undefined &&
      dto.standards === undefined
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        '请至少提供一个需要更新的字段',
      );
    }

    const acceptance = await this.acceptancesRepository.updateAcceptance(
      projectId,
      userId,
      acceptanceId,
      {
        acceptanceDate: this.parseDate(dto.acceptanceDate),
        failureReason: this.optionalText(dto.failureReason),
        goal: this.optionalText(dto.goal),
        participantIds: dto.participantIds,
        result: dto.result,
        stageName: dto.stageName,
        standards: dto.standards,
      },
    );

    return this.toDetail(acceptance);
  }

  private parseDate(value: string | undefined): Date | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw this.invalidDate();
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw this.invalidDate();
    }

    return date;
  }

  private optionalText(value: string | undefined): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  private toSummary(acceptance: AcceptanceSummaryRecord): AcceptanceSummaryResponse {
    return {
      acceptanceDate: acceptance.acceptanceDate?.toISOString() ?? null,
      createdAt: acceptance.createdAt.toISOString(),
      createdById: acceptance.createdById,
      failureReason: acceptance.failureReason,
      goal: acceptance.goal,
      id: acceptance.id,
      projectId: acceptance.projectId,
      remediationTaskCount: acceptance.remediationTaskCount,
      result: acceptance.result as AcceptanceResult,
      stageName: acceptance.stageName,
      standards: acceptance.standards,
      updatedAt: acceptance.updatedAt.toISOString(),
    };
  }

  private async toDetail(acceptance: AcceptanceDetailRecord): Promise<AcceptanceDetailResponse> {
    return {
      ...this.toSummary(acceptance),
      participants: await Promise.all(
        acceptance.participants.map(async (participant) => ({
          ...participant.user,
          avatarUrl: await this.avatarStorage.toDataUrl(
            participant.user.id,
            participant.user.avatarUrl,
          ),
        })),
      ),
      remediationTasks: acceptance.remediationTasks.map((task) => ({
        assigneeId: task.assigneeId,
        id: task.id,
        status: task.status,
        title: task.title,
      })),
    };
  }

  private acceptanceNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'ACCEPTANCE_NOT_FOUND', '阶段验收不存在');
  }

  private invalidDate(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ACCEPTANCE_DATE_INVALID',
      '验收日期无效',
    );
  }
}
