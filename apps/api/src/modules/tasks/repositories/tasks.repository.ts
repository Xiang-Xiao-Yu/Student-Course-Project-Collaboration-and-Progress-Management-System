import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TaskPriority, TaskStatus } from '../task.constants';

const taskSelect = {
  assigneeId: true,
  completedAt: true,
  completionNote: true,
  createdAt: true,
  createdById: true,
  description: true,
  dueDate: true,
  estimatedHours: true,
  id: true,
  priority: true,
  projectId: true,
  requirementId: true,
  status: true,
  tags: {
    select: {
      tag: {
        select: { name: true },
      },
    },
  },
  title: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;

export interface TaskRecord {
  assigneeId: string | null;
  completedAt: Date | null;
  completionNote: string | null;
  createdAt: Date;
  createdById: string;
  description: string | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  id: string;
  priority: string;
  projectId: string;
  requirementId: string | null;
  status: string;
  tags: Array<{ tag: { name: string } }>;
  title: string;
  updatedAt: Date;
}

export interface TaskWriteInput {
  assigneeId?: string;
  description?: string;
  dueDate?: Date;
  estimatedHours?: number;
  priority?: TaskPriority;
  requirementId?: string;
  title?: string;
}

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(projectId: string): Promise<TaskRecord[]> {
    return this.prisma.task.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: taskSelect,
      where: { projectId },
    });
  }

  async findById(projectId: string, taskId: string): Promise<TaskRecord | null> {
    return this.prisma.task.findFirst({
      select: taskSelect,
      where: { id: taskId, projectId },
    });
  }

  async createTask(
    projectId: string,
    creatorId: string,
    input: Required<Pick<TaskWriteInput, 'priority' | 'title'>> & TaskWriteInput,
    tagNames?: string[],
  ): Promise<TaskRecord> {
    return this.prisma.$transaction(async (transaction) => {
      await this.validateRelations(transaction, projectId, input.assigneeId, input.requirementId);
      const created = await transaction.task.create({
        data: {
          assigneeId: input.assigneeId,
          createdById: creatorId,
          description: input.description,
          dueDate: input.dueDate,
          estimatedHours: input.estimatedHours,
          priority: input.priority,
          projectId,
          requirementId: input.requirementId,
          title: input.title,
        },
        select: { id: true },
      });

      await this.syncTags(transaction, projectId, created.id, tagNames);
      await transaction.activityLog.create({
        data: {
          action: 'TASK_CREATED',
          actorId: creatorId,
          afterValue: JSON.stringify({
            status: 'BACKLOG',
            title: input.title,
          }),
          projectId,
          targetId: created.id,
          targetType: 'TASK',
        },
      });

      return transaction.task.findUniqueOrThrow({
        select: taskSelect,
        where: { id: created.id },
      });
    });
  }

  async updateTask(
    projectId: string,
    actorId: string,
    task: TaskRecord,
    input: TaskWriteInput,
    tagNames?: string[],
  ): Promise<TaskRecord> {
    return this.prisma.$transaction(async (transaction) => {
      await this.validateRelations(transaction, projectId, input.assigneeId, input.requirementId);
      await transaction.task.update({
        data: {
          assigneeId: input.assigneeId,
          description: input.description,
          dueDate: input.dueDate,
          estimatedHours: input.estimatedHours,
          priority: input.priority,
          requirementId: input.requirementId,
          title: input.title,
        },
        select: { id: true },
        where: { id: task.id },
      });
      await this.syncTags(transaction, projectId, task.id, tagNames);
      await transaction.activityLog.create({
        data: {
          action: 'TASK_UPDATED',
          actorId,
          afterValue: JSON.stringify(input),
          beforeValue: JSON.stringify({
            assigneeId: task.assigneeId,
            description: task.description,
            dueDate: task.dueDate?.toISOString() ?? null,
            estimatedHours: task.estimatedHours,
            priority: task.priority,
            requirementId: task.requirementId,
            title: task.title,
          }),
          projectId,
          targetId: task.id,
          targetType: 'TASK',
        },
      });

      return transaction.task.findUniqueOrThrow({
        select: taskSelect,
        where: { id: task.id },
      });
    });
  }

  async updateTaskStatus(
    projectId: string,
    actorId: string,
    task: TaskRecord,
    status: TaskStatus,
    completionNote: string | undefined,
    reopenReason: string | undefined,
  ): Promise<TaskRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const completedAt =
        status === 'COMPLETED'
          ? new Date()
          : status === 'IN_PROGRESS' && task.status === 'COMPLETED'
            ? null
            : undefined;
      const update = await transaction.task.updateMany({
        data: {
          completedAt,
          completionNote,
          status,
        },
        where: {
          id: task.id,
          status: task.status,
        },
      });

      if (update.count !== 1) {
        throw this.statusTransitionInvalid();
      }

      await transaction.activityLog.create({
        data: {
          action: 'TASK_STATUS_CHANGED',
          actorId,
          afterValue: JSON.stringify({
            completionNote: completionNote ?? task.completionNote,
            reopenReason: reopenReason ?? null,
            status,
          }),
          beforeValue: JSON.stringify({ status: task.status }),
          projectId,
          targetId: task.id,
          targetType: 'TASK',
        },
      });

      return transaction.task.findUniqueOrThrow({
        select: taskSelect,
        where: { id: task.id },
      });
    });
  }

  async deleteTask(projectId: string, actorId: string, task: TaskRecord): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.activityLog.create({
        data: {
          action: 'TASK_DELETED',
          actorId,
          beforeValue: JSON.stringify({
            status: task.status,
            title: task.title,
          }),
          projectId,
          targetId: task.id,
          targetType: 'TASK',
        },
      });
      await transaction.task.delete({
        where: { id: task.id },
      });
    });
  }

  statusTransitionInvalid(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'TASK_STATUS_TRANSITION_INVALID',
      '当前任务状态不能转换为目标状态',
    );
  }

  private async validateRelations(
    transaction: Prisma.TransactionClient,
    projectId: string,
    assigneeId: string | undefined,
    requirementId: string | undefined,
  ): Promise<void> {
    if (assigneeId) {
      const membership = await transaction.projectMember.findUnique({
        select: { id: true },
        where: {
          projectId_userId: {
            projectId,
            userId: assigneeId,
          },
        },
      });

      if (!membership) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'TASK_ASSIGNEE_INVALID',
          '任务负责人必须是当前项目成员',
        );
      }
    }

    if (requirementId) {
      const requirement = await transaction.requirement.findFirst({
        select: { id: true },
        where: {
          id: requirementId,
          projectId,
        },
      });

      if (!requirement) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'TASK_REQUIREMENT_INVALID',
          '关联需求不属于当前项目',
        );
      }
    }
  }

  private async syncTags(
    transaction: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    tagNames: string[] | undefined,
  ): Promise<void> {
    if (tagNames === undefined) {
      return;
    }

    const normalizedNames = [...new Set(tagNames.map((name) => name.trim()))].filter(
      (name) => name.length > 0,
    );

    await transaction.taskTag.deleteMany({
      where: { taskId },
    });

    for (const name of normalizedNames) {
      const tag = await transaction.tag.upsert({
        create: {
          color: '#64748B',
          name,
          projectId,
        },
        select: { id: true },
        update: {},
        where: {
          projectId_name: {
            name,
            projectId,
          },
        },
      });
      await transaction.taskTag.create({
        data: {
          tagId: tag.id,
          taskId,
        },
      });
    }
  }
}
