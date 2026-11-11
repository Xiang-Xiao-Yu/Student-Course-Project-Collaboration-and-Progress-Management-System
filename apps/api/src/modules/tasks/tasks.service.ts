import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { createCsv } from '../../common/export/csv';
import { ProjectAccessService } from '../projects/project-access.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskResponse } from './interfaces/task-response';
import { TASK_STATUS_TRANSITIONS, TaskPriority, TaskStatus } from './task.constants';
import { TaskRecord, TasksRepository } from './repositories/tasks.repository';
import type { TaskListFilters } from './repositories/tasks.repository';

const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  BACKLOG: '待规划',
  BLOCKED: '已阻塞',
  COMPLETED: '已完成',
  IN_PROGRESS: '进行中',
  PENDING_REVIEW: '待审核',
  TODO: '待开始',
};

const TASK_PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  HIGH: '高',
  LOW: '低',
  MEDIUM: '中',
};

@Injectable()
export class TasksService {
  constructor(
    private readonly projectAccessService: ProjectAccessService,
    private readonly tasksRepository: TasksRepository,
  ) {}

  async listTasks(
    userId: string,
    projectId: string,
    query: ListTasksQueryDto = new ListTasksQueryDto(),
  ): Promise<TaskResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'TASK_VIEW');
    const tasks = await this.tasksRepository.listByProject(projectId, this.toTaskFilters(query));

    return tasks.map((task) => this.toResponse(task));
  }

  async exportTasksCsv(
    userId: string,
    projectId: string,
    query: ListTasksQueryDto = new ListTasksQueryDto(),
  ): Promise<{ content: string; filename: string }> {
    await this.projectAccessService.requirePermission(projectId, userId, 'REPORT_EXPORT');
    const tasks = await this.tasksRepository.listByProject(projectId, this.toTaskFilters(query));
    const rows: unknown[][] = [
      [
        '任务 ID',
        '标题',
        '状态',
        '优先级',
        '负责人',
        '关联需求',
        '所属迭代',
        '截止日期',
        '标签',
        '预估工时',
        '完成说明',
        '创建时间',
        '完成时间',
        '更新时间',
      ],
      ...tasks.map((task) => [
        task.id,
        task.title,
        TASK_STATUS_LABELS[task.status as TaskStatus],
        TASK_PRIORITY_LABELS[task.priority as TaskPriority],
        task.assignee ? `${task.assignee.nickname} (@${task.assignee.username})` : '未分配',
        task.requirement ? `${task.requirement.number} ${task.requirement.title}` : '',
        task.iteration?.name ?? '',
        task.dueDate?.toISOString() ?? '',
        task.tags
          .map((item) => item.tag.name)
          .sort()
          .join(';'),
        task.estimatedHours ?? '',
        task.completionNote ?? '',
        task.createdAt.toISOString(),
        task.completedAt?.toISOString() ?? '',
        task.updatedAt.toISOString(),
      ]),
    ];

    return {
      content: createCsv(rows),
      filename: `tasks-${projectId}.csv`,
    };
  }

  async getTask(userId: string, projectId: string, taskId: string): Promise<TaskResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'TASK_VIEW');
    const task = await this.requireTask(projectId, taskId);

    return this.toResponse(task);
  }

  async createTask(userId: string, projectId: string, dto: CreateTaskDto): Promise<TaskResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'TASK_CREATE',
    );

    this.assertCanCreate(access.project.status);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    this.assertDueDateValid(dueDate, access.project.startDate);

    const task = await this.tasksRepository.createTask(
      projectId,
      userId,
      {
        acceptanceId: dto.acceptanceId,
        assigneeId: dto.assigneeId,
        description: dto.description,
        dueDate,
        estimatedHours: dto.estimatedHours,
        priority: dto.priority,
        requirementId: dto.requirementId,
        title: dto.title,
      },
      dto.tagNames,
    );

    return this.toResponse(task);
  }

  async updateTask(
    userId: string,
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'TASK_UPDATE',
    );

    this.assertNotArchived(access.project.status);
    const task = await this.requireTask(projectId, taskId);

    if (
      dto.title === undefined &&
      dto.description === undefined &&
      dto.assigneeId === undefined &&
      dto.acceptanceId === undefined &&
      dto.requirementId === undefined &&
      dto.priority === undefined &&
      dto.dueDate === undefined &&
      dto.estimatedHours === undefined &&
      dto.tagNames === undefined
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        '请至少提供一个需要更新的字段',
      );
    }

    const dueDate = dto.dueDate !== undefined ? new Date(dto.dueDate) : undefined;
    this.assertDueDateValid(dueDate ?? task.dueDate ?? undefined, access.project.startDate);
    const updated = await this.tasksRepository.updateTask(
      projectId,
      userId,
      task,
      {
        acceptanceId: dto.acceptanceId,
        assigneeId: dto.assigneeId,
        description: dto.description,
        dueDate,
        estimatedHours: dto.estimatedHours,
        priority: dto.priority,
        requirementId: dto.requirementId,
        title: dto.title,
      },
      dto.tagNames,
    );

    return this.toResponse(updated);
  }

  async updateTaskStatus(
    userId: string,
    projectId: string,
    taskId: string,
    dto: UpdateTaskStatusDto,
  ): Promise<TaskResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'TASK_STATUS_UPDATE',
    );

    this.assertNotArchived(access.project.status);
    const task = await this.requireTask(projectId, taskId);
    const currentStatus = task.status as TaskStatus;

    if (dto.rejectionReason !== undefined) {
      if (!access.isPlatformAdmin && access.role !== 'OWNER') {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'PROJECT_PERMISSION_DENIED',
          '只有项目负责人可以审核任务',
        );
      }
      if (
        currentStatus !== 'PENDING_REVIEW' ||
        dto.status !== 'PENDING_REVIEW' ||
        !dto.rejectionReason.trim() ||
        dto.completionNote !== undefined ||
        dto.reopenReason !== undefined
      ) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'VALIDATION_FAILED',
          '审核不通过时须保持待审核并填写原因，不能修改完成说明',
        );
      }
    }

    if (
      dto.status !== currentStatus &&
      !TASK_STATUS_TRANSITIONS[currentStatus].includes(dto.status)
    ) {
      throw this.tasksRepository.statusTransitionInvalid();
    }

    const completionNote = dto.completionNote ?? task.completionNote ?? undefined;

    if (dto.status === 'PENDING_REVIEW' && !completionNote?.trim()) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TASK_COMPLETION_NOTE_REQUIRED',
        '提交审核前必须填写完成说明',
      );
    }

    if (dto.status === 'COMPLETED') {
      if (!access.isPlatformAdmin && access.role !== 'OWNER') {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'PROJECT_PERMISSION_DENIED',
          '只有项目负责人可以审核通过任务',
        );
      }

      if (!completionNote?.trim()) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'TASK_COMPLETION_NOTE_REQUIRED',
          '完成任务前必须填写完成说明',
        );
      }
    }

    if (
      currentStatus === 'COMPLETED' &&
      dto.status === 'IN_PROGRESS' &&
      !dto.reopenReason?.trim()
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TASK_REOPEN_REASON_REQUIRED',
        '重新打开任务必须填写原因',
      );
    }

    const updated = await this.tasksRepository.updateTaskStatus(
      projectId,
      userId,
      task,
      dto.status,
      dto.completionNote === undefined ? undefined : dto.completionNote.trim(),
      dto.reopenReason?.trim(),
      dto.rejectionReason?.trim(),
    );

    return this.toResponse(updated);
  }

  async deleteTask(userId: string, projectId: string, taskId: string): Promise<{ deleted: true }> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'TASK_DELETE',
    );

    this.assertNotArchived(access.project.status);
    const task = await this.requireTask(projectId, taskId);

    await this.tasksRepository.deleteTask(projectId, userId, task);

    return { deleted: true };
  }

  private async requireTask(projectId: string, taskId: string): Promise<TaskRecord> {
    const task = await this.tasksRepository.findById(projectId, taskId);

    if (!task) {
      throw new AppException(HttpStatus.NOT_FOUND, 'TASK_NOT_FOUND', '任务不存在');
    }

    return task;
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
        '已归档项目只读，不能修改任务',
      );
    }
  }

  private toTaskFilters(query: ListTasksQueryDto): TaskListFilters {
    const dueDateFrom =
      query.dueDateFrom === undefined ? undefined : this.startOfUtcDay(query.dueDateFrom);
    const dueDateToExclusive =
      query.dueDateTo === undefined ? undefined : this.startOfNextUtcDay(query.dueDateTo);

    if (dueDateFrom && dueDateToExclusive && dueDateFrom >= dueDateToExclusive) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TASK_FILTER_DATE_RANGE_INVALID',
        '截止日期筛选结束日期不能早于开始日期',
      );
    }

    return {
      assigneeId: query.assigneeId,
      dueDateFrom,
      dueDateToExclusive,
      iterationId: query.iterationId,
      priority: query.priority,
      search: query.search,
      status: query.status,
      tag: query.tag,
    };
  }

  private startOfUtcDay(value: string): Date {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private startOfNextUtcDay(value: string): Date {
    const date = this.startOfUtcDay(value);
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

  private assertDueDateValid(dueDate: Date | undefined, projectStartDate: Date | null): void {
    if (dueDate && !Number.isFinite(dueDate.getTime())) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TASK_DUE_DATE_INVALID',
        '任务截止日期无效',
      );
    }
    if (dueDate && projectStartDate && dueDate.getTime() < projectStartDate.getTime()) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TASK_DUE_DATE_INVALID',
        '任务截止日期不能早于项目开始日期',
      );
    }
  }

  private toResponse(task: TaskRecord): TaskResponse {
    return {
      acceptanceId: task.acceptanceId,
      assigneeId: task.assigneeId,
      completedAt: task.completedAt?.toISOString() ?? null,
      completionNote: task.completionNote,
      createdAt: task.createdAt.toISOString(),
      createdById: task.createdById,
      description: task.description,
      dueDate: task.dueDate?.toISOString() ?? null,
      estimatedHours: task.estimatedHours,
      id: task.id,
      priority: task.priority as TaskPriority,
      projectId: task.projectId,
      requirementId: task.requirementId,
      rejectionReason: task.rejectionReason ?? null,
      status: task.status as TaskStatus,
      tagNames: task.tags.map((item) => item.tag.name).sort(),
      title: task.title,
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
