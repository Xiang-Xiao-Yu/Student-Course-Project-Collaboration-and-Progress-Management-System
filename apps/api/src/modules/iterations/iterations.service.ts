import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { ProjectAccessService } from '../projects/project-access.service';
import type { IterationStatus } from './iteration.constants';
import { AddIterationTaskDto } from './dto/add-iteration-task.dto';
import { CloseIterationDto } from './dto/close-iteration.dto';
import { CreateIterationDto } from './dto/create-iteration.dto';
import { UpdateIterationDto } from './dto/update-iteration.dto';
import type {
  IterationDetailResponse,
  IterationResponse,
  IterationStatsResponse,
} from './interfaces/iteration-response';
import {
  IterationDetailRecord,
  IterationRecord,
  IterationsRepository,
} from './repositories/iterations.repository';

@Injectable()
export class IterationsService {
  constructor(
    private readonly projectAccessService: ProjectAccessService,
    private readonly iterationsRepository: IterationsRepository,
  ) {}

  async listIterations(userId: string, projectId: string): Promise<IterationResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_VIEW');
    const iterations = await this.iterationsRepository.listByProject(projectId);

    return iterations.map((iteration) => this.toSummary(iteration));
  }

  async getIteration(
    userId: string,
    projectId: string,
    iterationId: string,
  ): Promise<IterationDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_VIEW');
    const iteration = await this.iterationsRepository.getById(projectId, iterationId);

    if (!iteration) {
      throw this.iterationNotFound();
    }

    return this.toDetail(iteration);
  }

  async createIteration(
    userId: string,
    projectId: string,
    dto: CreateIterationDto,
  ): Promise<IterationDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_UPDATE');
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.assertDateRange(startDate, endDate);

    const iteration = await this.iterationsRepository.createIteration(projectId, userId, {
      endDate,
      goal: dto.goal,
      name: dto.name,
      startDate,
    });

    return this.toDetail(iteration);
  }

  async updateIteration(
    userId: string,
    projectId: string,
    iterationId: string,
    dto: UpdateIterationDto,
  ): Promise<IterationDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_UPDATE');

    if (
      dto.name === undefined &&
      dto.goal === undefined &&
      dto.startDate === undefined &&
      dto.endDate === undefined &&
      dto.status === undefined
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        '请至少提供一个需要更新的字段',
      );
    }

    const startDate = dto.startDate !== undefined ? new Date(dto.startDate) : undefined;
    const endDate = dto.endDate !== undefined ? new Date(dto.endDate) : undefined;
    this.assertDateRange(startDate, endDate);

    const iteration = await this.iterationsRepository.updateIteration(
      projectId,
      userId,
      iterationId,
      {
        endDate,
        goal: dto.goal,
        name: dto.name,
        startDate,
        status: dto.status,
      },
    );

    return this.toDetail(iteration);
  }

  async addTask(
    userId: string,
    projectId: string,
    iterationId: string,
    dto: AddIterationTaskDto,
  ): Promise<IterationDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_UPDATE');
    const iteration = await this.iterationsRepository.addTask(
      projectId,
      userId,
      iterationId,
      dto.taskId,
    );

    return this.toDetail(iteration);
  }

  async removeTask(
    userId: string,
    projectId: string,
    iterationId: string,
    taskId: string,
  ): Promise<IterationDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_UPDATE');
    const iteration = await this.iterationsRepository.removeTask(
      projectId,
      userId,
      iterationId,
      taskId,
    );

    return this.toDetail(iteration);
  }

  async closeIteration(
    userId: string,
    projectId: string,
    iterationId: string,
    dto: CloseIterationDto,
  ): Promise<IterationDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_UPDATE');
    const iteration = await this.iterationsRepository.closeIteration(
      projectId,
      userId,
      iterationId,
      dto.nextIterationId,
    );

    return this.toDetail(iteration);
  }

  async deleteIteration(
    userId: string,
    projectId: string,
    iterationId: string,
  ): Promise<{ deleted: true }> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_UPDATE');
    await this.iterationsRepository.deleteIteration(projectId, userId, iterationId);

    return { deleted: true };
  }

  async getStats(
    userId: string,
    projectId: string,
    iterationId: string,
  ): Promise<IterationStatsResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_VIEW');
    const tasks = await this.iterationsRepository.getStats(projectId, iterationId);

    if (tasks === null) {
      throw this.iterationNotFound();
    }

    const now = Date.now();
    const total = tasks.length;
    const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
    const inProgress = tasks.filter((task) => task.status === 'IN_PROGRESS').length;
    const blocked = tasks.filter((task) => task.status === 'BLOCKED').length;
    const overdue = tasks.filter(
      (task) =>
        task.status !== 'COMPLETED' && task.dueDate !== null && task.dueDate.getTime() < now,
    ).length;

    return {
      blocked,
      completed,
      completionRate: total === 0 ? 0 : Math.round((completed / total) * 10000) / 10000,
      inProgress,
      overdue,
      total,
    };
  }

  private assertDateRange(startDate: Date | undefined, endDate: Date | undefined): void {
    if (
      (startDate && !Number.isFinite(startDate.getTime())) ||
      (endDate && !Number.isFinite(endDate.getTime())) ||
      (startDate && endDate && startDate.getTime() > endDate.getTime())
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ITERATION_DATE_RANGE_INVALID',
        '迭代结束日期不能早于开始日期',
      );
    }
  }

  private toSummary(iteration: IterationRecord): IterationResponse {
    return {
      createdAt: iteration.createdAt.toISOString(),
      endDate: iteration.endDate.toISOString(),
      goal: iteration.goal,
      id: iteration.id,
      name: iteration.name,
      projectId: iteration.projectId,
      startDate: iteration.startDate.toISOString(),
      status: iteration.status as IterationStatus,
      taskCount: iteration.taskCount,
      updatedAt: iteration.updatedAt.toISOString(),
    };
  }

  private toDetail(iteration: IterationDetailRecord): IterationDetailResponse {
    return {
      ...this.toSummary(iteration),
      tasks: iteration.tasks.map((task) => ({
        completedAt: task.completedAt?.toISOString() ?? null,
        dueDate: task.dueDate?.toISOString() ?? null,
        id: task.id,
        status: task.status as IterationDetailResponse['tasks'][number]['status'],
        title: task.title,
      })),
    };
  }

  private iterationNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'ITERATION_NOT_FOUND', '迭代不存在');
  }
}
