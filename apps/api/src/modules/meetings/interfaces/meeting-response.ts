import type { TaskPriority, TaskStatus } from '../../tasks/task.constants';
import type { MeetingActionStatus } from '../meeting.constants';

export interface MeetingParticipantResponse {
  avatarUrl: string | null;
  id: string;
  nickname: string;
  username: string;
}

export interface MeetingActionResponse {
  assigneeId: string | null;
  convertedTaskId: string | null;
  createdAt: string;
  dueDate: string | null;
  id: string;
  meetingId: string;
  status: MeetingActionStatus;
  title: string;
  updatedAt: string;
}

export interface MeetingSummaryResponse {
  actionCount: number;
  agenda: string | null;
  createdAt: string;
  createdById: string;
  decisions: string | null;
  id: string;
  minutes: string | null;
  participantCount: number;
  projectId: string;
  scheduledAt: string;
  title: string;
  updatedAt: string;
}

export interface MeetingDetailResponse extends MeetingSummaryResponse {
  actions: MeetingActionResponse[];
  participants: MeetingParticipantResponse[];
}

export interface ConvertedTaskResponse {
  assigneeId: string | null;
  dueDate: string | null;
  id: string;
  priority: TaskPriority;
  projectId: string;
  requirementId: string | null;
  status: TaskStatus;
  title: string;
}

export interface MeetingActionConversionResponse {
  action: MeetingActionResponse;
  task: ConvertedTaskResponse;
}
