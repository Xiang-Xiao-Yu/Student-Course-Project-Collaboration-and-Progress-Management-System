import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
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
    return this.prisma.$transaction(async (transaction) => {
      const lastRequirement = await transaction.requirement.findFirst({
        orderBy: { number: 'desc' },
        select: { number: true },
        where: { projectId },
      });
      const lastNumber = Number(lastRequirement?.number.match(/^REQ-(\d+)$/)?.[1] ?? 0);
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
          afterValue: JSON.stringify({ number, title: requirement.title }),
          projectId,
          targetId: requirement.id,
          targetType: 'REQUIREMENT',
        },
      });

      return requirement;
    });
  }

  async updateRequirement(
    projectId: string,
    actorId: string,
    requirement: RequirementRecord,
    data: RequirementWriteInput,
  ): Promise<RequirementRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.requirement.update({
        data,
        select: requirementSelect,
        where: { id: requirement.id },
      });
      const statusChanged = data.status !== undefined && data.status !== requirement.status;

      await transaction.activityLog.create({
        data: {
          action: statusChanged ? 'REQUIREMENT_STATUS_CHANGED' : 'REQUIREMENT_UPDATED',
          actorId,
          afterValue: JSON.stringify(statusChanged ? { status: data.status } : updated),
          beforeValue: JSON.stringify(
            statusChanged
              ? { status: requirement.status }
              : {
                  acceptanceCriteria: requirement.acceptanceCriteria,
                  description: requirement.description,
                  priority: requirement.priority,
                  title: requirement.title,
                },
          ),
          projectId,
          targetId: requirement.id,
          targetType: 'REQUIREMENT',
        },
      });

      return updated;
    });
  }

  async deleteRequirement(
    projectId: string,
    actorId: string,
    requirement: RequirementRecord,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.activityLog.create({
        data: {
          action: 'REQUIREMENT_DELETED',
          actorId,
          beforeValue: JSON.stringify({
            number: requirement.number,
            title: requirement.title,
          }),
          projectId,
          targetId: requirement.id,
          targetType: 'REQUIREMENT',
        },
      });
      await transaction.requirement.delete({
        where: { id: requirement.id },
      });
    });
  }
}
