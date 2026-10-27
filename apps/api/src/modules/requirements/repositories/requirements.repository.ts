import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { AppException } from '../../../common/errors/app.exception';
import { withProjectWrite } from '../../projects/project-write-access';
import type { RequirementPriority, RequirementStatus } from '../requirement.constants';

const requirementSelect = {
  acceptanceCriteria: true,
  createdAt: true,
  creatorId: true,
  description: true,
  id: true,
  number: true,
  priority: true,
  projectId: true,
  status: true,
  tasks: {
    select: {
      assigneeId: true,
      id: true,
      status: true,
      title: true,
    },
  },
  title: true,
  updatedAt: true,
} satisfies Prisma.RequirementSelect;

export interface RequirementRecord {
  acceptanceCriteria: string;
  createdAt: Date;
  creatorId: string;
  description: string | null;
  id: string;
  number: string;
  priority: string;
  projectId: string;
  status: string;
  tasks: Array<{
    assigneeId: string | null;
    id: string;
    status: string;
    title: string;
  }>;
  title: string;
  updatedAt: Date;
}

export interface RequirementWriteInput {
  acceptanceCriteria?: string;
  description?: string;
  priority?: RequirementPriority;
  status?: RequirementStatus;
  title?: string;
}

@Injectable()
export class RequirementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(projectId: string): Promise<RequirementRecord[]> {
    return this.prisma.requirement.findMany({
      orderBy: [{ number: 'asc' }],
      select: requirementSelect,
      where: { projectId },
    });
  }

  async findById(projectId: string, requirementId: string): Promise<RequirementRecord | null> {
    return this.prisma.requirement.findFirst({
      select: requirementSelect,
      where: { id: requirementId, projectId },
    });
  }

  async createRequirement(
    projectId: string,
    creatorId: string,
    input: Required<Pick<RequirementWriteInput, 'acceptanceCriteria' | 'priority' | 'title'>> &
      RequirementWriteInput,
  ): Promise<RequirementRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      creatorId,
      'REQUIREMENT_CREATE',
      async (transaction) => {
        const requirements = await transaction.requirement.findMany({
          select: { number: true },
          where: { projectId },
        });
        const lastNumber = requirements.reduce(
          (maximum, requirement) =>
            Math.max(maximum, Number(requirement.number.match(/^REQ-(\d+)$/)?.[1] ?? 0)),
          0,
        );
        const number = `REQ-${String(lastNumber + 1).padStart(3, '0')}`;
        const requirement = await transaction.requirement.create({
          data: {
            acceptanceCriteria: input.acceptanceCriteria,
            creatorId,
            description: input.description,
            number,
            priority: input.priority,
            projectId,
            title: input.title,
          },
          select: requirementSelect,
        });

        await transaction.activityLog.create({
          data: {
            action: 'REQUIREMENT_CREATED',
            actorId: creatorId,
            afterValue: JSON.stringify(requirement),
            projectId,
            targetId: requirement.id,
            targetType: 'REQUIREMENT',
          },
        });

        return requirement;
      },
      { creating: true },
    );
  }

  async updateRequirement(
    projectId: string,
    actorId: string,
    requirement: RequirementRecord,
    data: RequirementWriteInput,
  ): Promise<RequirementRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'REQUIREMENT_UPDATE',
      async (transaction) => {
        const current = await transaction.requirement.findFirst({
          where: { id: requirement.id, projectId },
          select: requirementSelect,
        });
        if (!current)
          throw new AppException(HttpStatus.NOT_FOUND, 'REQUIREMENT_NOT_FOUND', '需求不存在');
        const changed = await transaction.requirement.updateMany({
          data,
          where: {
            id: requirement.id,
            projectId,
            ...(data.status !== undefined ? { status: requirement.status } : {}),
          },
        });
        if (changed.count !== 1) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'REQUIREMENT_STATUS_TRANSITION_INVALID',
            '需求状态已变化，请刷新后重试',
          );
        }
        const updated = await transaction.requirement.findUniqueOrThrow({
          where: { id: requirement.id },
          select: requirementSelect,
        });
        const statusChanged = current.status !== updated.status;

        await transaction.activityLog.create({
          data: {
            action: statusChanged ? 'REQUIREMENT_STATUS_CHANGED' : 'REQUIREMENT_UPDATED',
            actorId,
            afterValue: JSON.stringify(updated),
            beforeValue: JSON.stringify(current),
            projectId,
            targetId: requirement.id,
            targetType: 'REQUIREMENT',
          },
        });

        return updated;
      },
    );
  }

  async deleteRequirement(
    projectId: string,
    actorId: string,
    requirement: RequirementRecord,
  ): Promise<void> {
    await withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'REQUIREMENT_DELETE',
      async (transaction) => {
        const current = await transaction.requirement.findFirst({
          where: { id: requirement.id, projectId },
          select: requirementSelect,
        });
        if (!current)
          throw new AppException(HttpStatus.NOT_FOUND, 'REQUIREMENT_NOT_FOUND', '需求不存在');
        await transaction.activityLog.create({
          data: {
            action: 'REQUIREMENT_DELETED',
            actorId,
            beforeValue: JSON.stringify(current),
            projectId,
            targetId: requirement.id,
            targetType: 'REQUIREMENT',
          },
        });
        await transaction.requirement.delete({
          where: { id: requirement.id },
        });
      },
    );
  }
}
