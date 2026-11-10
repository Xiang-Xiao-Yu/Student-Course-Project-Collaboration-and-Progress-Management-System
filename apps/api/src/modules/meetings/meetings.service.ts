import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { ProjectAccessService } from '../projects/project-access.service';
import type { TaskPriority, TaskStatus } from '../tasks/task.constants';
import { AvatarStorageService } from '../users/avatar-storage.service';
import { ConvertMeetingActionDto } from './dto/convert-meeting-action.dto';
import { CreateMeetingActionDto } from './dto/create-meeting-action.dto';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingActionDto } from './dto/update-meeting-action.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import type {
  MeetingActionConversionResponse,
  MeetingActionResponse,
  MeetingDetailResponse,
  MeetingSummaryResponse,
} from './interfaces/meeting-response';
import {
  MeetingActionConversionRecord,
  MeetingActionRecord,
  MeetingDetailRecord,
  MeetingSummaryRecord,
  MeetingsRepository,
} from './repositories/meetings.repository';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly meetingsRepository: MeetingsRepository,
    private readonly projectAccessService: ProjectAccessService,
    private readonly avatarStorage: AvatarStorageService,
  ) {}

  async listMeetings(userId: string, projectId: string): Promise<MeetingSummaryResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'MEETING_VIEW');
    const meetings = await this.meetingsRepository.listByProject(projectId);

    return Promise.all(meetings.map((meeting) => this.toSummary(meeting)));
  }

  async getMeeting(
    userId: string,
    projectId: string,
    meetingId: string,
  ): Promise<MeetingDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'MEETING_VIEW');
    const meeting = await this.meetingsRepository.findById(projectId, meetingId);

    if (!meeting) {
      throw this.meetingNotFound();
    }

    return this.toDetail(meeting);
  }

  async createMeeting(
    userId: string,
    projectId: string,
    dto: CreateMeetingDto,
  ): Promise<MeetingDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'MEETING_CREATE');
    const meeting = await this.meetingsRepository.createMeeting(projectId, userId, {
      agenda: this.optionalText(dto.agenda),
      decisions: this.optionalText(dto.decisions),
      minutes: this.optionalText(dto.minutes),
      participantIds: dto.participantIds,
      scheduledAt: this.parseDate(dto.scheduledAt, 'MEETING_DATE_INVALID', '会议时间无效'),
      title: dto.title,
    });

    return this.toDetail(meeting);
  }

  async updateMeeting(
    userId: string,
    projectId: string,
    meetingId: string,
    dto: UpdateMeetingDto,
  ): Promise<MeetingDetailResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'MEETING_UPDATE');

    if (
      dto.agenda === undefined &&
      dto.decisions === undefined &&
      dto.minutes === undefined &&
      dto.participantIds === undefined &&
      dto.scheduledAt === undefined &&
      dto.title === undefined
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        '请至少提供一个需要更新的字段',
      );
    }

    const scheduledAt =
      dto.scheduledAt === undefined
        ? undefined
        : this.parseDate(dto.scheduledAt, 'MEETING_DATE_INVALID', '会议时间无效');
    const meeting = await this.meetingsRepository.updateMeeting(projectId, userId, meetingId, {
      agenda: this.optionalText(dto.agenda),
      decisions: this.optionalText(dto.decisions),
      minutes: this.optionalText(dto.minutes),
      participantIds: dto.participantIds,
      scheduledAt,
      title: dto.title,
    });

    return this.toDetail(meeting);
  }

  async createAction(
    userId: string,
    projectId: string,
    meetingId: string,
    dto: CreateMeetingActionDto,
  ): Promise<MeetingActionResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'MEETING_ACTION_MANAGE');
    const action = await this.meetingsRepository.createAction(projectId, userId, meetingId, {
      assigneeId: dto.assigneeId,
      dueDate: this.parseOptionalDate(dto.dueDate),
      title: dto.title,
    });

    return this.toAction(action);
  }

  async updateAction(
    userId: string,
    projectId: string,
    meetingId: string,
    actionId: string,
    dto: UpdateMeetingActionDto,
  ): Promise<MeetingActionResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'MEETING_ACTION_MANAGE');

    if (
      dto.assigneeId === undefined &&
      dto.dueDate === undefined &&
      dto.status === undefined &&
      dto.title === undefined
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        '请至少提供一个需要更新的字段',
      );
    }

    const action = await this.meetingsRepository.updateAction(
      projectId,
      userId,
      meetingId,
      actionId,
      {
        assigneeId: dto.assigneeId,
        dueDate: this.parseOptionalDate(dto.dueDate),
        status: dto.status,
        title: dto.title,
      },
    );

    return this.toAction(action);
  }

  async convertAction(
    userId: string,
    projectId: string,
    meetingId: string,
    actionId: string,
    dto: ConvertMeetingActionDto,
  ): Promise<MeetingActionConversionResponse> {
    await this.projectAccessService.requirePermission(projectId, userId, 'MEETING_ACTION_MANAGE');
    const conversion = await this.meetingsRepository.convertAction(
      projectId,
      userId,
      meetingId,
      actionId,
      {
        description: this.optionalText(dto.description) ?? undefined,
        priority: dto.priority,
        requirementId: dto.requirementId,
      },
    );

    return this.toConversion(conversion);
  }

  private parseOptionalDate(value: string | undefined): Date | undefined {
    return value === undefined
      ? undefined
      : this.parseDate(value, 'MEETING_ACTION_DUE_DATE_INVALID', '行动项截止日期无效');
  }

  private parseDate(value: string, code: string, message: string): Date {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
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

  private async toSummary(meeting: MeetingSummaryRecord): Promise<MeetingSummaryResponse> {
    return {
      actionCount: meeting.actionCount,
      agenda: meeting.agenda,
      createdAt: meeting.createdAt.toISOString(),
      createdBy: {
        ...meeting.createdBy,
        avatarUrl: await this.avatarStorage.toDataUrl(
          meeting.createdBy.id,
          meeting.createdBy.avatarUrl,
        ),
        userId: meeting.createdBy.id,
      },
      createdById: meeting.createdById,
      decisions: meeting.decisions,
      id: meeting.id,
      minutes: meeting.minutes,
      participantCount: meeting.participantCount,
      projectId: meeting.projectId,
      scheduledAt: meeting.scheduledAt.toISOString(),
      title: meeting.title,
      updatedAt: meeting.updatedAt.toISOString(),
    };
  }

  private async toDetail(meeting: MeetingDetailRecord): Promise<MeetingDetailResponse> {
    return {
      ...(await this.toSummary(meeting)),
      actions: meeting.actions.map((action) => this.toAction(action)),
      participants: await Promise.all(
        meeting.participants.map(async (participant) => ({
          ...participant.user,
          avatarUrl: await this.avatarStorage.toDataUrl(
            participant.user.id,
            participant.user.avatarUrl,
          ),
          userId: participant.user.id,
        })),
      ),
    };
  }

  private toAction(action: MeetingActionRecord): MeetingActionResponse {
    return {
      assigneeId: action.assigneeId,
      convertedTaskId: action.convertedTaskId,
      createdAt: action.createdAt.toISOString(),
      dueDate: action.dueDate?.toISOString() ?? null,
      id: action.id,
      meetingId: action.meetingId,
      status: action.status as MeetingActionResponse['status'],
      title: action.title,
      updatedAt: action.updatedAt.toISOString(),
    };
  }

  private toConversion(conversion: MeetingActionConversionRecord): MeetingActionConversionResponse {
    const action = this.toAction(conversion.action);

    return {
      ...action,
      action,
      task: {
        assigneeId: conversion.task.assigneeId,
        dueDate: conversion.task.dueDate?.toISOString() ?? null,
        id: conversion.task.id,
        priority: conversion.task.priority as TaskPriority,
        projectId: conversion.task.projectId,
        requirementId: conversion.task.requirementId,
        status: conversion.task.status as TaskStatus,
        title: conversion.task.title,
      },
    };
  }

  private meetingNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'MEETING_NOT_FOUND', '会议不存在');
  }
}
