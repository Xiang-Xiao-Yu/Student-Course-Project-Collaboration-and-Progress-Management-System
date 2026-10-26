import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { ProjectAccessService } from '../projects/project-access.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskResponse } from './interfaces/task-response';
import { TASK_STATUS_TRANSITIONS, TaskPriority, TaskStatus } from './task.constants';
import { TaskRecord, TasksRepository } from './repositories/tasks.repository';

@Injectable()
export class TasksService {
  constructor(
    private readonly projectAccessService: ProjectAccessService,
    private readonly tasksRepository: TasksRepository,
  ) {}

  async listTasks(userId: string, projectId: string): Promise<TaskResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'TASK_VIEW');
    const tasks = await this.tasksRepository.listByProject(projectId);

    return tasks.map((task) => this.toResponse(task));
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

  private assertDueDateValid(dueDate: Date | undefined, projectStartDate: Date | null): void {
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
      status: task.status as TaskStatus,
      tagNames: task.tags.map((item) => item.tag.name).sort(),
      title: task.title,
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
