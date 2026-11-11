import type { ApiClient } from '../../lib/api/client';

export type MeetingActionStatus = 'CANCELED' | 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';

export interface MeetingUserDto {
  readonly avatarUrl: string | null;
  readonly id: string;
  readonly nickname: string;
  readonly userId: string;
  readonly username: string;
}

export type MeetingParticipantDto = MeetingUserDto;

export interface MeetingActionDto {
  readonly assigneeId: string | null;
  readonly convertedTaskId: string | null;
  readonly createdAt: string;
  readonly dueDate: string | null;
  readonly id: string;
  readonly meetingId: string;
  readonly status: MeetingActionStatus;
  readonly title: string;
  readonly updatedAt: string;
}

export interface MeetingSummaryDto {
  readonly actionCount: number;
  readonly agenda: string | null;
  readonly createdAt: string;
  readonly createdBy: MeetingUserDto;
  readonly createdById: string;
  readonly decisions: string | null;
  readonly id: string;
  readonly minutes: string | null;
  readonly participantCount: number;
  readonly projectId: string;
  readonly scheduledAt: string;
  readonly title: string;
  readonly updatedAt: string;
}

export interface MeetingDto extends MeetingSummaryDto {
  readonly actions: MeetingActionDto[];
  readonly participants: MeetingParticipantDto[];
}

export interface ConvertedTaskDto {
  readonly assigneeId: string | null;
  readonly dueDate: string | null;
  readonly id: string;
  readonly priority: 'HIGH' | 'LOW' | 'MEDIUM';
  readonly projectId: string;
  readonly requirementId: string | null;
  readonly status: string;
  readonly title: string;
}

export interface MeetingActionConversionDto extends MeetingActionDto {
  readonly action: MeetingActionDto;
  readonly task: ConvertedTaskDto;
}

export interface CreateMeetingInput {
  readonly agenda?: string;
  readonly participantIds: string[];
  readonly scheduledAt: string;
  readonly title: string;
}

export interface UpdateMeetingInput {
  readonly agenda?: string;
  readonly decisions?: string;
  readonly minutes?: string;
  readonly participantIds?: string[];
  readonly scheduledAt?: string;
  readonly title?: string;
}

export interface CreateMeetingActionInput {
  readonly assigneeId?: string;
  readonly dueDate?: string;
  readonly title: string;
}

export interface UpdateMeetingActionInput {
  readonly assigneeId?: string;
  readonly dueDate?: string;
  readonly status?: MeetingActionStatus;
  readonly title?: string;
}

function meetingsPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/meetings`;
}

function meetingPath(projectId: string, meetingId: string): string {
  return `${meetingsPath(projectId)}/${encodeURIComponent(meetingId)}`;
}

function actionPath(projectId: string, meetingId: string, actionId: string): string {
  return `${meetingPath(projectId, meetingId)}/actions/${encodeURIComponent(actionId)}`;
}

export function listMeetings(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
): Promise<MeetingSummaryDto[]> {
  return api.get<MeetingSummaryDto[]>(meetingsPath(projectId));
}

export function getMeeting(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  meetingId: string,
): Promise<MeetingDto> {
  return api.get<MeetingDto>(meetingPath(projectId, meetingId));
}

export function createMeeting(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  input: CreateMeetingInput,
): Promise<MeetingDto> {
  return api.post<MeetingDto, CreateMeetingInput>(meetingsPath(projectId), input);
}

export function updateMeeting(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  meetingId: string,
  input: UpdateMeetingInput,
): Promise<MeetingDto> {
  return api.patch<MeetingDto, UpdateMeetingInput>(meetingPath(projectId, meetingId), input);
}

export function createMeetingAction(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  meetingId: string,
  input: CreateMeetingActionInput,
): Promise<MeetingActionDto> {
  return api.post<MeetingActionDto, CreateMeetingActionInput>(
    `${meetingPath(projectId, meetingId)}/actions`,
    input,
  );
}

export function updateMeetingAction(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  meetingId: string,
  actionId: string,
  input: UpdateMeetingActionInput,
): Promise<MeetingActionDto> {
  return api.patch<MeetingActionDto, UpdateMeetingActionInput>(
    actionPath(projectId, meetingId, actionId),
    input,
  );
}

export function convertMeetingAction(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  meetingId: string,
  actionId: string,
): Promise<MeetingActionConversionDto> {
  return api.post<MeetingActionConversionDto>(
    `${actionPath(projectId, meetingId, actionId)}/convert`,
  );
}
