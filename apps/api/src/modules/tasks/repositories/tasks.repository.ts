import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { withProjectWrite } from '../../projects/project-write-access';
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
  rejectionReason?: string | null;
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
    const tasks = await this.prisma.task.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: taskSelect,
      where: { projectId },
    });
    return this.withRejectionReasons(this.prisma, projectId, tasks);
  }

  async findById(projectId: string, taskId: string): Promise<TaskRecord | null> {
    const task = await this.prisma.task.findFirst({
      select: taskSelect,
      where: { id: taskId, projectId },
    });
    if (!task) return null;
    return (await this.withRejectionReasons(this.prisma, projectId, [task]))[0] ?? null;
  }

  async createTask(
    projectId: string,
    creatorId: string,
    input: Required<Pick<TaskWriteInput, 'priority' | 'title'>> & TaskWriteInput,
    tagNames?: string[],
  ): Promise<TaskRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      creatorId,
      'TASK_CREATE',
      async (transaction, project) => {
        this.assertDueDateValid(input.dueDate, project.startDate);
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
        const result = await transaction.task.findUniqueOrThrow({
          select: taskSelect,
          where: { id: created.id },
        });
        await transaction.activityLog.create({
          data: {
            action: 'TASK_CREATED',
            actorId: creatorId,
            afterValue: JSON.stringify(this.snapshot(result)),
            projectId,
            targetId: created.id,
            targetType: 'TASK',
          },
        });

        return result;
      },
      { creating: true },
    );
  }

  async updateTask(
    projectId: string,
    actorId: string,
    task: TaskRecord,
    input: TaskWriteInput,
    tagNames?: string[],
  ): Promise<TaskRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'TASK_UPDATE',
      async (transaction, project) => {
        const current = await this.requireCurrent(transaction, projectId, task.id);
        const onlyReassignment =
          tagNames === undefined &&
          Object.entries(input).every(
            ([field, value]) => value === undefined || field === 'assigneeId',
          );
        if (!project.canManageTasks && current.assigneeId !== actorId && !onlyReassignment) {
          throw new AppException(
            HttpStatus.FORBIDDEN,
            'PROJECT_PERMISSION_DENIED',
            '只能编辑自己负责的任务，或单独调整任务负责人',
          );
        }
        this.assertDueDateValid(input.dueDate ?? current.dueDate ?? undefined, project.startDate);
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
        const updated = await this.requireCurrent(transaction, projectId, task.id);
        await transaction.activityLog.create({
          data: {
            action: 'TASK_UPDATED',
            actorId,
            afterValue: JSON.stringify(this.snapshot(updated)),
            beforeValue: JSON.stringify(this.snapshot(current)),
            projectId,
            targetId: task.id,
            targetType: 'TASK',
          },
        });

        return (await this.withRejectionReasons(transaction, projectId, [updated]))[0]!;
      },
    );
  }

  async updateTaskStatus(
    projectId: string,
    actorId: string,
    task: TaskRecord,
    status: TaskStatus,
    completionNote: string | undefined,
    reopenReason: string | undefined,
    rejectionReason?: string,
  ): Promise<TaskRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'TASK_STATUS_UPDATE',
      async (transaction, project) => {
        const current = await this.requireCurrent(transaction, projectId, task.id);
        if (current.status !== task.status) throw this.statusTransitionInvalid();
        if (
          completionNote !== undefined &&
          completionNote !== current.completionNote &&
          !project.canManageTasks &&
          current.assigneeId !== actorId
        ) {
          throw new AppException(
            HttpStatus.FORBIDDEN,
            'PROJECT_PERMISSION_DENIED',
            '只能修改自己负责任务的完成说明',
          );
        }
        if (rejectionReason !== undefined) {
          if (
            current.status !== 'PENDING_REVIEW' ||
            status !== 'PENDING_REVIEW' ||
            !rejectionReason.trim()
          ) {
            throw this.statusTransitionInvalid();
          }
          await transaction.activityLog.create({
            data: {
              action: 'TASK_REVIEW_REJECTED',
              actorId,
              projectId,
              targetId: task.id,
              targetType: 'TASK',
              beforeValue: JSON.stringify(this.snapshot(current)),
              afterValue: JSON.stringify({ ...this.snapshot(current), rejectionReason }),
            },
          });
          return { ...current, rejectionReason };
        }
        // A retry does not change business data or invent a status transition.
        if (status === current.status) {
          if (completionNote !== undefined && completionNote !== current.completionNote) {
            const updated = await transaction.task.update({
              where: { id: current.id },
              data: { completionNote },
              select: taskSelect,
            });
            await transaction.activityLog.create({
              data: {
                action: status === 'PENDING_REVIEW' ? 'TASK_REVIEW_RESUBMITTED' : 'TASK_UPDATED',
                actorId,
                projectId,
                targetId: current.id,
                targetType: 'TASK',
                beforeValue: JSON.stringify(this.snapshot(current)),
                afterValue: JSON.stringify(this.snapshot(updated)),
              },
            });
            return { ...updated, rejectionReason: null };
          }
          return (await this.withRejectionReasons(transaction, projectId, [current]))[0]!;
        }
        if (
          (status === 'PENDING_REVIEW' || status === 'COMPLETED') &&
          !(completionNote ?? current.completionNote)?.trim()
        ) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'TASK_COMPLETION_NOTE_REQUIRED',
            '提交审核前必须填写完成说明',
          );
        }
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
        const updated = await this.requireCurrent(transaction, projectId, task.id);
        await transaction.activityLog.create({
          data: {
            action: 'TASK_STATUS_CHANGED',
            actorId,
            afterValue: JSON.stringify({
              ...this.snapshot(updated),
              reopenReason: reopenReason ?? null,
            }),
            beforeValue: JSON.stringify(this.snapshot(current)),
            projectId,
            targetId: task.id,
            targetType: 'TASK',
          },
        });

        return updated;
      },
      { ownerOnly: status === 'COMPLETED' || rejectionReason !== undefined },
    );
  }

  async deleteTask(projectId: string, actorId: string, task: TaskRecord): Promise<void> {
    await withProjectWrite(this.prisma, projectId, actorId, 'TASK_DELETE', async (transaction) => {
      const current = await this.requireCurrent(transaction, projectId, task.id);
      await transaction.activityLog.create({
        data: {
          action: 'TASK_DELETED',
          actorId,
          beforeValue: JSON.stringify(this.snapshot(current)),
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

  private snapshot(task: TaskRecord): Record<string, unknown> {
    const { tags, ...fields } = task;
    return { ...fields, tagNames: tags.map((item) => item.tag.name).sort() };
  }

  private async requireCurrent(
    transaction: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
  ): Promise<TaskRecord> {
    const current = await transaction.task.findFirst({
      select: taskSelect,
      where: { id: taskId, projectId },
    });
    if (!current) throw new AppException(HttpStatus.NOT_FOUND, 'TASK_NOT_FOUND', '任务不存在');
    return current;
  }

  private assertDueDateValid(dueDate: Date | undefined, startDate: Date | null): void {
    if (
      dueDate &&
      (!Number.isFinite(dueDate.getTime()) ||
        (startDate && dueDate.getTime() < startDate.getTime()))
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TASK_DUE_DATE_INVALID',
        '任务截止日期不能早于项目开始日期',
      );
    }
  }

  private async withRejectionReasons(
    transaction: Prisma.TransactionClient,
    projectId: string,
    tasks: TaskRecord[],
  ): Promise<TaskRecord[]> {
    const pendingIds = tasks
      .filter((task) => task.status === 'PENDING_REVIEW')
      .map((task) => task.id);
    if (pendingIds.length === 0) return tasks.map((task) => ({ ...task, rejectionReason: null }));
    const logs = await transaction.activityLog.findMany({
      where: {
        projectId,
        targetType: 'TASK',
        targetId: { in: pendingIds },
        action: { in: ['TASK_REVIEW_REJECTED', 'TASK_REVIEW_RESUBMITTED', 'TASK_STATUS_CHANGED'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { targetId: true, action: true, afterValue: true },
    });
    const reasons = new Map<string, string | null>();
    for (const log of logs) {
      if (reasons.has(log.targetId)) continue;
      let reason: string | null = null;
      if (log.action === 'TASK_REVIEW_REJECTED' && log.afterValue) {
        const value: unknown = JSON.parse(log.afterValue);
        if (
          typeof value === 'object' &&
          value !== null &&
          'rejectionReason' in value &&
          typeof value.rejectionReason === 'string'
        ) {
          reason = value.rejectionReason;
        }
      }
      reasons.set(log.targetId, reason);
    }
    return tasks.map((task) => ({ ...task, rejectionReason: reasons.get(task.id) ?? null }));
  }

  private async validateRelations(
    transaction: Prisma.TransactionClient,
    projectId: string,
    assigneeId: string | undefined,
    requirementId: string | undefined,
  ): Promise<void> {
    if (assigneeId !== undefined) {
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

    if (requirementId !== undefined) {
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
