import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { withProjectWrite } from '../../projects/project-write-access';
import type { TaskPriority } from '../../tasks/task.constants';
import type { MeetingActionStatus } from '../meeting.constants';

const meetingActionSelect = {
  assigneeId: true,
  convertedTaskId: true,
  createdAt: true,
  dueDate: true,
  id: true,
  meetingId: true,
  status: true,
  title: true,
  updatedAt: true,
} satisfies Prisma.MeetingActionSelect;

const meetingSelect = {
  agenda: true,
  createdAt: true,
  createdById: true,
  decisions: true,
  id: true,
  minutes: true,
  projectId: true,
  scheduledAt: true,
  title: true,
  updatedAt: true,
} satisfies Prisma.MeetingSelect;

const meetingSummarySelect = {
  ...meetingSelect,
  _count: { select: { actions: true, participants: true } },
} satisfies Prisma.MeetingSelect;

const meetingParticipantSelect = {
  user: {
    select: {
      avatarUrl: true,
      id: true,
      nickname: true,
      username: true,
    },
  },
} satisfies Prisma.MeetingParticipantSelect;

const meetingDetailSelect = {
  ...meetingSummarySelect,
  actions: { orderBy: { createdAt: 'asc' }, select: meetingActionSelect },
  participants: { orderBy: { userId: 'asc' }, select: meetingParticipantSelect },
} satisfies Prisma.MeetingSelect;

const convertedTaskSelect = {
  assigneeId: true,
  dueDate: true,
  id: true,
  priority: true,
  projectId: true,
  requirementId: true,
  status: true,
  title: true,
} satisfies Prisma.TaskSelect;

type MeetingSummaryRow = Prisma.MeetingGetPayload<{ select: typeof meetingSummarySelect }>;
type MeetingDetailRow = Prisma.MeetingGetPayload<{ select: typeof meetingDetailSelect }>;

export interface MeetingParticipantUserRecord {
  avatarUrl: string | null;
  id: string;
  nickname: string;
  username: string;
}

export interface MeetingParticipantRecord {
  user: MeetingParticipantUserRecord;
}

export interface MeetingActionRecord {
  assigneeId: string | null;
  convertedTaskId: string | null;
  createdAt: Date;
  dueDate: Date | null;
  id: string;
  meetingId: string;
  status: string;
  title: string;
  updatedAt: Date;
}

export interface MeetingRecord {
  agenda: string | null;
  createdAt: Date;
  createdById: string;
  decisions: string | null;
  id: string;
  minutes: string | null;
  projectId: string;
  scheduledAt: Date;
  title: string;
  updatedAt: Date;
}

export interface MeetingSummaryRecord extends MeetingRecord {
  actionCount: number;
  participantCount: number;
}

export interface MeetingDetailRecord extends MeetingSummaryRecord {
  actions: MeetingActionRecord[];
  participants: MeetingParticipantRecord[];
}

export interface MeetingWriteInput {
  agenda?: string | null;
  decisions?: string | null;
  minutes?: string | null;
  participantIds?: string[];
  scheduledAt?: Date;
  title?: string;
}

export interface MeetingActionWriteInput {
  assigneeId?: string;
  dueDate?: Date;
  status?: MeetingActionStatus;
  title?: string;
}

export interface MeetingActionConvertInput {
  description?: string;
  priority?: TaskPriority;
  requirementId?: string;
}

export interface ConvertedTaskRecord {
  assigneeId: string | null;
  dueDate: Date | null;
  id: string;
  priority: string;
  projectId: string;
  requirementId: string | null;
  status: string;
  title: string;
}

export interface MeetingActionConversionRecord {
  action: MeetingActionRecord;
  task: ConvertedTaskRecord;
}

@Injectable()
export class MeetingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(projectId: string): Promise<MeetingSummaryRecord[]> {
    const meetings = await this.prisma.meeting.findMany({
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      select: meetingSummarySelect,
      where: { projectId },
    });

    return meetings.map((meeting) => this.toSummary(meeting));
  }

  async findById(projectId: string, meetingId: string): Promise<MeetingDetailRecord | null> {
    const meeting = await this.prisma.meeting.findFirst({
      select: meetingDetailSelect,
      where: { id: meetingId, projectId },
    });

    return meeting ? this.toDetail(meeting) : null;
  }

  async createMeeting(
    projectId: string,
    actorId: string,
    input: Required<Pick<MeetingWriteInput, 'scheduledAt' | 'title'>> & MeetingWriteInput,
  ): Promise<MeetingDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'MEETING_CREATE',
      async (transaction) => {
        const participantIds =
          (await this.normalizeParticipantIds(transaction, projectId, input.participantIds)) ?? [];
        const created = await transaction.meeting.create({
          data: {
            agenda: input.agenda ?? null,
            createdById: actorId,
            decisions: input.decisions ?? null,
            minutes: input.minutes ?? null,
            participants: { create: participantIds.map((userId) => ({ userId })) },
            projectId,
            scheduledAt: input.scheduledAt,
            title: input.title,
          },
          select: { id: true },
        });
        const detail = await this.requireDetail(transaction, projectId, created.id);

        await transaction.activityLog.create({
          data: {
            action: 'MEETING_CREATED',
            actorId,
            afterValue: JSON.stringify(detail),
            projectId,
            targetId: created.id,
            targetType: 'MEETING',
          },
        });

        return detail;
      },
      { creating: true },
    );
  }

  async updateMeeting(
    projectId: string,
    actorId: string,
    meetingId: string,
    input: MeetingWriteInput,
  ): Promise<MeetingDetailRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'MEETING_UPDATE',
      async (transaction) => {
        const current = await this.requireMeeting(transaction, projectId, meetingId);
        const participantIds = await this.normalizeParticipantIds(
          transaction,
          projectId,
          input.participantIds,
        );
        const updated = await transaction.meeting.update({
          data: {
            agenda: input.agenda,
            decisions: input.decisions,
            minutes: input.minutes,
            scheduledAt: input.scheduledAt,
            title: input.title,
          },
          select: { id: true },
          where: { id: meetingId },
        });

        if (participantIds !== undefined) {
          await transaction.meetingParticipant.deleteMany({ where: { meetingId } });
          if (participantIds.length > 0) {
            await transaction.meetingParticipant.createMany({
              data: participantIds.map((userId) => ({ meetingId, userId })),
            });
          }
        }

        const detail = await this.requireDetail(transaction, projectId, updated.id);
        await transaction.activityLog.create({
          data: {
            action: 'MEETING_UPDATED',
            actorId,
            afterValue: JSON.stringify(detail),
            beforeValue: JSON.stringify(current),
            projectId,
            targetId: meetingId,
            targetType: 'MEETING',
          },
        });

        return detail;
      },
    );
  }

  async createAction(
    projectId: string,
    actorId: string,
    meetingId: string,
    input: Required<Pick<MeetingActionWriteInput, 'title'>> & MeetingActionWriteInput,
  ): Promise<MeetingActionRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'MEETING_ACTION_MANAGE',
      async (transaction, project) => {
        await this.requireMeeting(transaction, projectId, meetingId);
        await this.validateAssignee(transaction, projectId, input.assigneeId);
        this.assertDueDateValid(input.dueDate, project.startDate);
        const action = await transaction.meetingAction.create({
          data: {
            assigneeId: input.assigneeId,
            dueDate: input.dueDate,
            meetingId,
            title: input.title,
          },
          select: meetingActionSelect,
        });

        await transaction.activityLog.create({
          data: {
            action: 'MEETING_ACTION_CREATED',
            actorId,
            afterValue: JSON.stringify(action),
            projectId,
            targetId: action.id,
            targetType: 'MEETING_ACTION',
          },
        });

        return action;
      },
      { creating: true },
    );
  }

  async updateAction(
    projectId: string,
    actorId: string,
    meetingId: string,
    actionId: string,
    input: MeetingActionWriteInput,
  ): Promise<MeetingActionRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'MEETING_ACTION_MANAGE',
      async (transaction, project) => {
        await this.requireMeeting(transaction, projectId, meetingId);
        const current = await this.requireAction(transaction, meetingId, actionId);
        await this.validateAssignee(transaction, projectId, input.assigneeId);
        this.assertDueDateValid(input.dueDate ?? current.dueDate ?? undefined, project.startDate);
        const updated = await transaction.meetingAction.update({
          data: {
            assigneeId: input.assigneeId,
            dueDate: input.dueDate,
            status: input.status,
            title: input.title,
          },
          select: meetingActionSelect,
          where: { id: actionId },
        });

        await transaction.activityLog.create({
          data: {
            action:
              updated.status !== current.status
                ? 'MEETING_ACTION_STATUS_CHANGED'
                : 'MEETING_ACTION_UPDATED',
            actorId,
            afterValue: JSON.stringify(updated),
            beforeValue: JSON.stringify(current),
            projectId,
            targetId: actionId,
            targetType: 'MEETING_ACTION',
          },
        });

        return updated;
      },
    );
  }

  async convertAction(
    projectId: string,
    actorId: string,
    meetingId: string,
    actionId: string,
    input: MeetingActionConvertInput,
  ): Promise<MeetingActionConversionRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'MEETING_ACTION_MANAGE',
      async (transaction) => {
        await this.requireMeeting(transaction, projectId, meetingId);
        const action = await this.requireAction(transaction, meetingId, actionId);
        if (action.convertedTaskId) {
          throw this.actionAlreadyConverted();
        }
        await this.validateAssignee(transaction, projectId, action.assigneeId ?? undefined);
        if (input.requirementId !== undefined) {
          await this.validateRequirement(transaction, projectId, input.requirementId);
        }

        const createdTask = await transaction.task.create({
          data: {
            assigneeId: action.assigneeId,
            createdById: actorId,
            description: input.description,
            dueDate: action.dueDate,
            priority: input.priority,
            projectId,
            requirementId: input.requirementId,
            title: action.title,
          },
          select: convertedTaskSelect,
        });
        const claimed = await transaction.meetingAction.updateMany({
          data: { convertedTaskId: createdTask.id },
          where: { convertedTaskId: null, id: actionId },
        });
        if (claimed.count !== 1) {
          throw this.actionAlreadyConverted();
        }
        const updatedAction = await this.requireAction(transaction, meetingId, actionId);

        await transaction.activityLog.create({
          data: {
            action: 'TASK_CREATED',
            actorId,
            afterValue: JSON.stringify(createdTask),
            projectId,
            targetId: createdTask.id,
            targetType: 'TASK',
          },
        });
        await transaction.activityLog.create({
          data: {
            action: 'MEETING_ACTION_CONVERTED',
            actorId,
            afterValue: JSON.stringify({ actionId, taskId: createdTask.id }),
            beforeValue: JSON.stringify({ convertedTaskId: null }),
            projectId,
            targetId: actionId,
            targetType: 'MEETING_ACTION',
          },
        });

        return { action: updatedAction, task: createdTask };
      },
      { creating: true },
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

  private async validateAssignee(
    transaction: Prisma.TransactionClient,
    projectId: string,
    assigneeId: string | undefined,
  ): Promise<void> {
    if (assigneeId === undefined) {
      return;
    }

    const membership = await transaction.projectMember.findUnique({
      select: { id: true },
      where: { projectId_userId: { projectId, userId: assigneeId } },
    });
    if (!membership) {
      throw this.assigneeInvalid();
    }
  }

  private async validateRequirement(
    transaction: Prisma.TransactionClient,
    projectId: string,
    requirementId: string,
  ): Promise<void> {
    const requirement = await transaction.requirement.findFirst({
      select: { id: true },
      where: { id: requirementId, projectId },
    });
    if (!requirement) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TASK_REQUIREMENT_INVALID',
        '关联需求不属于当前项目',
      );
    }
  }

  private assertDueDateValid(dueDate: Date | undefined, projectStartDate: Date | null): void {
    if (dueDate && !Number.isFinite(dueDate.getTime())) {
      throw this.dueDateInvalid();
    }
    if (dueDate && projectStartDate && dueDate.getTime() < projectStartDate.getTime()) {
      throw this.dueDateInvalid();
    }
  }

  private async requireMeeting(
    transaction: Prisma.TransactionClient,
    projectId: string,
    meetingId: string,
  ): Promise<MeetingSummaryRecord> {
    const meeting = await transaction.meeting.findFirst({
      select: meetingSummarySelect,
      where: { id: meetingId, projectId },
    });
    if (!meeting) {
      throw this.meetingNotFound();
    }

    return this.toSummary(meeting);
  }

  private async requireDetail(
    transaction: Prisma.TransactionClient,
    projectId: string,
    meetingId: string,
  ): Promise<MeetingDetailRecord> {
    const meeting = await transaction.meeting.findFirstOrThrow({
      select: meetingDetailSelect,
      where: { id: meetingId, projectId },
    });

    return this.toDetail(meeting);
  }

  private async requireAction(
    transaction: Prisma.TransactionClient,
    meetingId: string,
    actionId: string,
  ): Promise<MeetingActionRecord> {
    const action = await transaction.meetingAction.findFirst({
      select: meetingActionSelect,
      where: { id: actionId, meetingId },
    });
    if (!action) {
      throw this.actionNotFound();
    }

    return action;
  }

  private toSummary(meeting: MeetingSummaryRow): MeetingSummaryRecord {
    return {
      actionCount: meeting._count.actions,
      agenda: meeting.agenda,
      createdAt: meeting.createdAt,
      createdById: meeting.createdById,
      decisions: meeting.decisions,
      id: meeting.id,
      minutes: meeting.minutes,
      participantCount: meeting._count.participants,
      projectId: meeting.projectId,
      scheduledAt: meeting.scheduledAt,
      title: meeting.title,
      updatedAt: meeting.updatedAt,
    };
  }

  private toDetail(meeting: MeetingDetailRow): MeetingDetailRecord {
    return {
      ...this.toSummary(meeting),
      actions: meeting.actions,
      participants: meeting.participants,
    };
  }

  private meetingNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'MEETING_NOT_FOUND', '会议不存在');
  }

  private actionNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'MEETING_ACTION_NOT_FOUND', '行动项不存在');
  }

  private participantInvalid(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MEETING_PARTICIPANT_INVALID',
      '参会人员必须是当前项目成员',
    );
  }

  private assigneeInvalid(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MEETING_ACTION_ASSIGNEE_INVALID',
      '行动项负责人必须是当前项目成员',
    );
  }

  private dueDateInvalid(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MEETING_ACTION_DUE_DATE_INVALID',
      '行动项截止日期无效或早于项目开始日期',
    );
  }

  private actionAlreadyConverted(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      'MEETING_ACTION_ALREADY_CONVERTED',
      '行动项已转换为任务',
    );
  }
}
