import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { withProjectWrite } from '../../projects/project-write-access';
import { ITERATION_STATUS_TRANSITIONS, IterationStatus } from '../iteration.constants';

const iterationSelect = {
  createdAt: true,
  endDate: true,
  goal: true,
  id: true,
  name: true,
  projectId: true,
  startDate: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.IterationSelect;

const iterationTaskSelect = {
  completedAt: true,
  dueDate: true,
  id: true,
  status: true,
  title: true,
} satisfies Prisma.TaskSelect;

export interface IterationRecord {
  createdAt: Date;
  endDate: Date;
  goal: string | null;
  id: string;
  name: string;
  projectId: string;
  startDate: Date;
  status: string;
  taskCount: number;
  updatedAt: Date;
}

export interface IterationTaskRecord {
  completedAt: Date | null;
  dueDate: Date | null;
  id: string;
  status: string;
  title: string;
}

export interface IterationDetailRecord extends IterationRecord {
  tasks: IterationTaskRecord[];
}

export interface IterationWriteInput {
  endDate?: Date;
  goal?: string;
  name?: string;
  startDate?: Date;
  status?: IterationStatus;
}

@Injectable()
export class IterationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(projectId: string): Promise<IterationRecord[]> {
    const iterations = await this.prisma.iteration.findMany({
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      select: {
        ...iterationSelect,
        _count: { select: { tasks: true } },
      },
      where: { projectId },
    });

    return iterations.map((iteration) => ({
      createdAt: iteration.createdAt,
      endDate: iteration.endDate,
      goal: iteration.goal,
      id: iteration.id,
      name: iteration.name,
      projectId: iteration.projectId,
      startDate: iteration.startDate,
      status: iteration.status,
      taskCount: iteration._count.tasks,
      updatedAt: iteration.updatedAt,
    }));
  }

  async getById(projectId: string, iterationId: string): Promise<IterationDetailRecord | null> {
    const iteration = await this.prisma.iteration.findFirst({
      select: {
        ...iterationSelect,
        _count: { select: { tasks: true } },
        tasks: {
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          select: iterationTaskSelect,
        },
      },
      where: { id: iterationId, projectId },
    });

    if (!iteration) {
      return null;
    }

    return {
      createdAt: iteration.createdAt,
      endDate: iteration.endDate,
      goal: iteration.goal,
      id: iteration.id,
      name: iteration.name,
      projectId: iteration.projectId,
      startDate: iteration.startDate,
      status: iteration.status,
      taskCount: iteration._count.tasks,
      tasks: iteration.tasks.map((task) => ({
        completedAt: task.completedAt,
        dueDate: task.dueDate,
        id: task.id,
        status: task.status,
        title: task.title,
      })),
      updatedAt: iteration.updatedAt,
    };
  }

  async createIteration(
    projectId: string,
    actorId: string,
    input: Required<Pick<IterationWriteInput, 'endDate' | 'name' | 'startDate'>> &
      IterationWriteInput,
  ): Promise<IterationDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'PROJECT_UPDATE',
      async (transaction) => {
        this.assertDateRange(input.startDate, input.endDate);
        const created = await transaction.iteration.create({
          data: {
            endDate: input.endDate,
            goal: input.goal,
            name: input.name,
            projectId,
            startDate: input.startDate,
            status: 'NOT_STARTED',
          },
          select: iterationSelect,
        });

        await transaction.activityLog.create({
          data: {
            action: 'ITERATION_CREATED',
            actorId,
            afterValue: JSON.stringify(this.snapshot(created)),
            projectId,
            targetId: created.id,
            targetType: 'ITERATION',
          },
        });

        return this.requireDetail(transaction, projectId, created.id);
      },
      { creating: true, ownerOnly: true },
    );
  }

  async updateIteration(
    projectId: string,
    actorId: string,
    iterationId: string,
    input: IterationWriteInput,
  ): Promise<IterationDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'PROJECT_UPDATE',
      async (transaction) => {
        const current = await this.requireIteration(transaction, projectId, iterationId);
        const status = input.status ?? (current.status as IterationStatus);
        this.assertStatusTransition(status, current.status as IterationStatus);
        this.assertDateRange(
          input.startDate ?? current.startDate,
          input.endDate ?? current.endDate,
        );

        const updated = await transaction.iteration.update({
          data: {
            endDate: input.endDate,
            goal: input.goal,
            name: input.name,
            startDate: input.startDate,
            status: input.status,
          },
          select: iterationSelect,
          where: { id: iterationId },
        });

        await transaction.activityLog.create({
          data: {
            action: input.status !== undefined ? 'ITERATION_STATUS_CHANGED' : 'ITERATION_UPDATED',
            actorId,
            afterValue: JSON.stringify(this.snapshot(updated)),
            beforeValue: JSON.stringify(this.snapshot(current)),
            projectId,
            targetId: iterationId,
            targetType: 'ITERATION',
          },
        });

        return this.requireDetail(transaction, projectId, iterationId);
      },
      { ownerOnly: true },
    );
  }

  async addTask(
    projectId: string,
    actorId: string,
    iterationId: string,
    taskId: string,
    expectedIterationId: string | null,
  ): Promise<IterationDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'PROJECT_UPDATE',
      async (transaction) => {
        const iteration = await this.requireIteration(transaction, projectId, iterationId);
        if (this.isTerminalStatus(iteration.status)) {
          throw this.iterationTargetTerminal();
        }

        const task = await transaction.task.findFirst({
          select: { id: true, iterationId: true, status: true, title: true },
          where: { id: taskId, projectId },
        });

        if (!task) {
          throw this.taskNotFound();
        }

        if (task.iterationId !== expectedIterationId) {
          throw this.iterationTaskMoved();
        }

        if (task.iterationId) {
          const source = await transaction.iteration.findFirst({
            select: { id: true, status: true },
            where: { id: task.iterationId, projectId },
          });

          if (source && this.isTerminalStatus(source.status) && task.status === 'COMPLETED') {
            throw this.iterationSourceTerminal();
          }
        }

        const updated = await transaction.task.updateMany({
          data: { iterationId },
          where: { id: task.id, iterationId: expectedIterationId, projectId },
        });
        if (updated.count !== 1) {
          throw this.iterationTaskMoved();
        }

        await transaction.activityLog.create({
          data: {
            action: 'ITERATION_TASK_ADDED',
            actorId,
            afterValue: JSON.stringify({ taskId: task.id, title: task.title, status: task.status }),
            beforeValue: JSON.stringify({ iterationId: task.iterationId ?? null }),
            projectId,
            targetId: iterationId,
            targetType: 'ITERATION',
          },
        });

        return this.requireDetail(transaction, projectId, iterationId);
      },
      { ownerOnly: true },
    );
  }

  async removeTask(
    projectId: string,
    actorId: string,
    iterationId: string,
    taskId: string,
  ): Promise<IterationDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'PROJECT_UPDATE',
      async (transaction) => {
        const iteration = await this.requireIteration(transaction, projectId, iterationId);
        const task = await transaction.task.findFirst({
          select: { id: true, iterationId: true, status: true, title: true },
          where: { id: taskId, projectId, iterationId },
        });

        if (!task) {
          throw this.taskNotFound();
        }
        if (this.isTerminalStatus(iteration.status) && task.status === 'COMPLETED') {
          throw this.iterationSourceTerminal();
        }

        await transaction.task.update({
          data: { iterationId: null },
          select: { id: true },
          where: { id: task.id },
        });

        await transaction.activityLog.create({
          data: {
            action: 'ITERATION_TASK_REMOVED',
            actorId,
            afterValue: JSON.stringify({ iterationId: null }),
            beforeValue: JSON.stringify({
              iterationId,
              taskId: task.id,
              title: task.title,
              status: task.status,
            }),
            projectId,
            targetId: iterationId,
            targetType: 'ITERATION',
          },
        });

        return this.requireDetail(transaction, projectId, iterationId);
      },
      { ownerOnly: true },
    );
  }

  async closeIteration(
    projectId: string,
    actorId: string,
    iterationId: string,
    nextIterationId: string | undefined,
  ): Promise<IterationDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'PROJECT_UPDATE',
      async (transaction) => {
        const current = await this.requireIteration(transaction, projectId, iterationId);
        this.assertStatusTransition('COMPLETED', current.status as IterationStatus);

        let movedCount = 0;

        if (nextIterationId) {
          if (nextIterationId === iterationId) {
            throw this.nextIterationNotFound();
          }
          const nextIteration = await transaction.iteration.findFirst({
            select: { id: true, status: true },
            where: { id: nextIterationId, projectId },
          });
          if (!nextIteration) {
            throw this.nextIterationNotFound();
          }
          if (this.isTerminalStatus(nextIteration.status)) {
            throw this.iterationTargetTerminal();
          }
          const moved = await transaction.task.updateMany({
            data: { iterationId: nextIterationId },
            where: {
              iterationId,
              status: { not: 'COMPLETED' },
            },
          });
          movedCount = moved.count;
        }

        const closed = await transaction.iteration.update({
          data: { status: 'COMPLETED' },
          select: iterationSelect,
          where: { id: iterationId },
        });

        await transaction.activityLog.create({
          data: {
            action: 'ITERATION_CLOSED',
            actorId,
            afterValue: JSON.stringify({ ...this.snapshot(closed), movedCount, nextIterationId }),
            beforeValue: JSON.stringify(this.snapshot(current)),
            projectId,
            targetId: iterationId,
            targetType: 'ITERATION',
          },
        });

        return this.requireDetail(transaction, projectId, iterationId);
      },
      { ownerOnly: true },
    );
  }

  async deleteIteration(projectId: string, actorId: string, iterationId: string): Promise<void> {
    await withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'PROJECT_UPDATE',
      async (transaction) => {
        const current = await this.requireIteration(transaction, projectId, iterationId);

        await transaction.activityLog.create({
          data: {
            action: 'ITERATION_DELETED',
            actorId,
            beforeValue: JSON.stringify(this.snapshot(current)),
            projectId,
            targetId: iterationId,
            targetType: 'ITERATION',
          },
        });

        await transaction.iteration.delete({ where: { id: iterationId } });
      },
      { ownerOnly: true },
    );
  }

  async getStats(projectId: string, iterationId: string): Promise<IterationTaskRecord[] | null> {
    const iteration = await this.prisma.iteration.findFirst({
      select: { id: true },
      where: { id: iterationId, projectId },
    });

    if (!iteration) {
      return null;
    }

    return this.prisma.task.findMany({
      select: iterationTaskSelect,
      where: { iterationId },
    });
  }

  private async requireIteration(
    transaction: Prisma.TransactionClient,
    projectId: string,
    iterationId: string,
  ): Promise<Omit<IterationRecord, 'taskCount'>> {
    const iteration = await transaction.iteration.findFirst({
      select: iterationSelect,
      where: { id: iterationId, projectId },
    });

    if (!iteration) {
      throw this.iterationNotFound();
    }

    return iteration;
  }

  private async requireDetail(
    transaction: Prisma.TransactionClient,
    projectId: string,
    iterationId: string,
  ): Promise<IterationDetailRecord> {
    const iteration = await transaction.iteration.findFirstOrThrow({
      select: {
        ...iterationSelect,
        _count: { select: { tasks: true } },
        tasks: {
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          select: iterationTaskSelect,
        },
      },
      where: { id: iterationId, projectId },
    });

    return {
      createdAt: iteration.createdAt,
      endDate: iteration.endDate,
      goal: iteration.goal,
      id: iteration.id,
      name: iteration.name,
      projectId: iteration.projectId,
      startDate: iteration.startDate,
      status: iteration.status,
      taskCount: iteration._count.tasks,
      tasks: iteration.tasks.map((task) => ({
        completedAt: task.completedAt,
        dueDate: task.dueDate,
        id: task.id,
        status: task.status,
        title: task.title,
      })),
      updatedAt: iteration.updatedAt,
    };
  }

  private snapshot(iteration: Omit<IterationRecord, 'taskCount'>): Record<string, unknown> {
    return {
      endDate: iteration.endDate.toISOString(),
      goal: iteration.goal,
      id: iteration.id,
      name: iteration.name,
      projectId: iteration.projectId,
      startDate: iteration.startDate.toISOString(),
      status: iteration.status,
    };
  }

  private assertStatusTransition(status: IterationStatus, currentStatus: IterationStatus): void {
    if (status !== currentStatus && !ITERATION_STATUS_TRANSITIONS[currentStatus].includes(status)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ITERATION_STATUS_TRANSITION_INVALID',
        '当前迭代状态不能转换为目标状态',
      );
    }
  }

  private assertDateRange(startDate: Date, endDate: Date): void {
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      startDate.getTime() > endDate.getTime()
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ITERATION_DATE_RANGE_INVALID',
        '迭代结束日期不能早于开始日期',
      );
    }
  }

  private isTerminalStatus(status: string): boolean {
    return status === 'COMPLETED' || status === 'CANCELED';
  }

  private iterationTargetTerminal(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ITERATION_TARGET_TERMINAL',
      '目标迭代已结束，不能变更其任务',
    );
  }

  private iterationSourceTerminal(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ITERATION_SOURCE_TERMINAL',
      '已结束迭代中的已完成任务不能变更归属',
    );
  }

  private iterationTaskMoved(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      'ITERATION_TASK_MOVED',
      '任务归属已变化，请刷新后重试',
    );
  }

  private iterationNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'ITERATION_NOT_FOUND', '迭代不存在');
  }

  private nextIterationNotFound(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ITERATION_NEXT_NOT_FOUND',
      '下一迭代不存在或不属于当前项目',
    );
  }

  private taskNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      'ITERATION_TASK_NOT_FOUND',
      '任务不存在或不属于当前迭代',
    );
  }
}
