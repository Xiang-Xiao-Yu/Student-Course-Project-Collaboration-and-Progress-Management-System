import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { withProjectWrite } from '../../projects/project-write-access';
import type { AcceptanceResult } from '../acceptance.constants';

const acceptanceSelect = {
  acceptanceDate: true,
  createdAt: true,
  createdById: true,
  failureReason: true,
  goal: true,
  id: true,
  projectId: true,
  result: true,
  standards: true,
  stageName: true,
  updatedAt: true,
} satisfies Prisma.AcceptanceSelect;

const acceptanceParticipantSelect = {
  user: {
    select: {
      avatarUrl: true,
      id: true,
      nickname: true,
      username: true,
    },
  },
} satisfies Prisma.AcceptanceParticipantSelect;

const acceptanceSummarySelect = {
  ...acceptanceSelect,
  _count: { select: { remediationTasks: true } },
  participants: { orderBy: { userId: 'asc' }, select: acceptanceParticipantSelect },
} satisfies Prisma.AcceptanceSelect;

const remediationTaskSelect = {
  assigneeId: true,
  id: true,
  status: true,
  title: true,
} satisfies Prisma.TaskSelect;

const acceptanceDetailSelect = {
  ...acceptanceSummarySelect,
  remediationTasks: { orderBy: { createdAt: 'asc' }, select: remediationTaskSelect },
} satisfies Prisma.AcceptanceSelect;

type AcceptanceSummaryRow = Prisma.AcceptanceGetPayload<{
  select: typeof acceptanceSummarySelect;
}>;
type AcceptanceDetailRow = Prisma.AcceptanceGetPayload<{ select: typeof acceptanceDetailSelect }>;

export interface AcceptanceParticipantUserRecord {
  avatarUrl: string | null;
  id: string;
  nickname: string;
  username: string;
}

export interface AcceptanceParticipantRecord {
  user: AcceptanceParticipantUserRecord;
}

export interface AcceptanceRemediationTaskRecord {
  assigneeId: string | null;
  id: string;
  status: string;
  title: string;
}

export interface AcceptanceRecord {
  acceptanceDate: Date | null;
  createdAt: Date;
  createdById: string;
  failureReason: string | null;
  goal: string | null;
  id: string;
  projectId: string;
  result: string;
  stageName: string;
  standards: string;
  updatedAt: Date;
}

export interface AcceptanceSummaryRecord extends AcceptanceRecord {
  participants: AcceptanceParticipantRecord[];
  remediationTaskCount: number;
}

export interface AcceptanceDetailRecord extends AcceptanceSummaryRecord {
  remediationTasks: AcceptanceRemediationTaskRecord[];
}

export interface AcceptanceWriteInput {
  acceptanceDate?: Date;
  failureReason?: string | null;
  goal?: string | null;
  participantIds?: string[];
  result?: AcceptanceResult;
  stageName?: string;
  standards?: string;
}

@Injectable()
export class AcceptancesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(projectId: string): Promise<AcceptanceSummaryRecord[]> {
    const acceptances = await this.prisma.acceptance.findMany({
      orderBy: [{ acceptanceDate: 'desc' }, { createdAt: 'desc' }],
      select: acceptanceSummarySelect,
      where: { projectId },
    });

    return acceptances.map((acceptance) => this.toSummary(acceptance));
  }

  async findById(projectId: string, acceptanceId: string): Promise<AcceptanceDetailRecord | null> {
    const acceptance = await this.prisma.acceptance.findFirst({
      select: acceptanceDetailSelect,
      where: { id: acceptanceId, projectId },
    });

    return acceptance ? this.toDetail(acceptance) : null;
  }

  async createAcceptance(
    projectId: string,
    actorId: string,
    input: Required<Pick<AcceptanceWriteInput, 'stageName' | 'standards'>> & AcceptanceWriteInput,
  ): Promise<AcceptanceDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'ACCEPTANCE_MANAGE',
      async (transaction) => {
        const participantIds =
          (await this.normalizeParticipantIds(transaction, projectId, input.participantIds)) ?? [];
        const result = input.result ?? 'NOT_STARTED';
        const failureReason = result === 'FAILED' ? (input.failureReason?.trim() ?? null) : null;
        this.assertResultValid(result, failureReason);
        const created = await transaction.acceptance.create({
          data: {
            acceptanceDate: input.acceptanceDate,
            createdById: actorId,
            failureReason,
            goal: input.goal ?? null,
            participants: { create: participantIds.map((userId) => ({ userId })) },
            projectId,
            result,
            stageName: input.stageName,
            standards: input.standards,
          },
          select: { id: true },
        });
        const detail = await this.requireDetail(transaction, projectId, created.id);

        await transaction.activityLog.create({
          data: {
            action: 'ACCEPTANCE_CREATED',
            actorId,
            afterValue: JSON.stringify(detail),
            projectId,
            targetId: created.id,
            targetType: 'ACCEPTANCE',
          },
        });

        return detail;
      },
      { creating: true },
    );
  }

  async updateAcceptance(
    projectId: string,
    actorId: string,
    acceptanceId: string,
    input: AcceptanceWriteInput,
  ): Promise<AcceptanceDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'ACCEPTANCE_MANAGE',
      async (transaction) => {
        const current = await this.requireAcceptance(transaction, projectId, acceptanceId);
        const participantIds = await this.normalizeParticipantIds(
          transaction,
          projectId,
          input.participantIds,
        );
        const result = input.result ?? (current.result as AcceptanceResult);
        const failureReason =
          input.failureReason !== undefined ? input.failureReason : current.failureReason;
        this.assertResultValid(result, failureReason);
        const normalizedFailureReason =
          result === 'FAILED' ? (failureReason?.trim() ?? null) : null;
        const shouldUpdateFailureReason =
          input.result !== undefined || input.failureReason !== undefined;

        await transaction.acceptance.update({
          data: {
            acceptanceDate: input.acceptanceDate,
            failureReason: shouldUpdateFailureReason ? normalizedFailureReason : undefined,
            goal: input.goal,
            result: input.result,
            stageName: input.stageName,
            standards: input.standards,
          },
          where: { id: acceptanceId },
        });

        if (participantIds !== undefined) {
          await transaction.acceptanceParticipant.deleteMany({ where: { acceptanceId } });
          if (participantIds.length > 0) {
            await transaction.acceptanceParticipant.createMany({
              data: participantIds.map((userId) => ({ acceptanceId, userId })),
            });
          }
        }

        const detail = await this.requireDetail(transaction, projectId, acceptanceId);
        const resultChanged = current.result !== detail.result;
        await transaction.activityLog.create({
          data: {
            action: resultChanged ? 'ACCEPTANCE_RESULT_RECORDED' : 'ACCEPTANCE_UPDATED',
            actorId,
            afterValue: JSON.stringify(detail),
            beforeValue: JSON.stringify(current),
            projectId,
            targetId: acceptanceId,
            targetType: 'ACCEPTANCE',
          },
        });

        return detail;
      },
    );
  }

  private async normalizeParticipantIds(
    transaction: Prisma.TransactionClient,
    projectId: string,
    participantIds: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (participantIds === undefined) {
      return undefined;
    }

    const uniqueIds = [...new Set(participantIds.map((userId) => userId.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const members = await transaction.projectMember.findMany({
      select: { userId: true },
      where: { projectId, userId: { in: uniqueIds } },
    });
    if (members.length !== uniqueIds.length) {
      throw this.participantInvalid();
    }

    return uniqueIds;
  }

  private assertResultValid(result: AcceptanceResult, failureReason: string | null): void {
    if (result === 'FAILED' && !failureReason?.trim()) {
      throw this.failureReasonRequired();
    }
  }

  private async requireAcceptance(
    transaction: Prisma.TransactionClient,
    projectId: string,
    acceptanceId: string,
  ): Promise<AcceptanceSummaryRecord> {
    const acceptance = await transaction.acceptance.findFirst({
      select: acceptanceSummarySelect,
      where: { id: acceptanceId, projectId },
    });
    if (!acceptance) {
      throw this.acceptanceNotFound();
    }

    return this.toSummary(acceptance);
  }

  private async requireDetail(
    transaction: Prisma.TransactionClient,
    projectId: string,
    acceptanceId: string,
  ): Promise<AcceptanceDetailRecord> {
    const acceptance = await transaction.acceptance.findFirstOrThrow({
      select: acceptanceDetailSelect,
      where: { id: acceptanceId, projectId },
    });

    return this.toDetail(acceptance);
  }

  private toSummary(acceptance: AcceptanceSummaryRow): AcceptanceSummaryRecord {
    return {
      acceptanceDate: acceptance.acceptanceDate,
      createdAt: acceptance.createdAt,
      createdById: acceptance.createdById,
      failureReason: acceptance.failureReason,
      goal: acceptance.goal,
      id: acceptance.id,
      participants: acceptance.participants,
      projectId: acceptance.projectId,
      remediationTaskCount: acceptance._count.remediationTasks,
      result: acceptance.result,
      stageName: acceptance.stageName,
      standards: acceptance.standards,
      updatedAt: acceptance.updatedAt,
    };
  }

  private toDetail(acceptance: AcceptanceDetailRow): AcceptanceDetailRecord {
    return {
      ...this.toSummary(acceptance),
      remediationTasks: acceptance.remediationTasks,
    };
  }

  private acceptanceNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'ACCEPTANCE_NOT_FOUND', '阶段验收不存在');
  }

  private participantInvalid(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ACCEPTANCE_PARTICIPANT_INVALID',
      '参与人员必须是当前项目成员',
    );
  }

  private failureReasonRequired(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ACCEPTANCE_FAILURE_REASON_REQUIRED',
      '验收未通过时必须填写未通过原因',
    );
  }
}
