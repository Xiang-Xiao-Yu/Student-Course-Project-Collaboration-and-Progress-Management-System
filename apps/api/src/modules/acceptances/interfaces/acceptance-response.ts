import type { AcceptanceResult } from '../acceptance.constants';

export interface AcceptanceParticipantResponse {
  avatarUrl: string | null;
  id: string;
  nickname: string;
  userId: string;
  username: string;
}

export interface AcceptanceRemediationTaskResponse {
  assigneeId: string | null;
  id: string;
  status: string;
  title: string;
}

export interface AcceptanceSummaryResponse {
  acceptanceDate: string | null;
  createdAt: string;
  createdById: string;
  failureReason: string | null;
  goal: string | null;
  id: string;
  participants: AcceptanceParticipantResponse[];
  projectId: string;
  remediationTaskCount: number;
  result: AcceptanceResult;
  stageName: string;
  standards: string;
  updatedAt: string;
}

export interface AcceptanceDetailResponse extends AcceptanceSummaryResponse {
  remediationTasks: AcceptanceRemediationTaskResponse[];
}
