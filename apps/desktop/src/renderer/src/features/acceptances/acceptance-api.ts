import type { ApiClient } from '../../lib/api/client';
import type { TaskStatus } from '../tasks/task-api';

export type AcceptanceResult = 'FAILED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'PASSED';

export interface AcceptanceUserDto {
  readonly avatarUrl: string | null;
  readonly id: string;
  readonly nickname: string;
  readonly username: string;
}

export type AcceptanceParticipantDto = AcceptanceUserDto;

export interface AcceptanceRemediationTaskDto {
  readonly assigneeId: string | null;
  readonly id: string;
  readonly status: TaskStatus;
  readonly title: string;
}

export interface AcceptanceSummaryDto {
  readonly acceptanceDate: string | null;
  readonly createdAt: string;
  readonly createdById: string;
  readonly failureReason: string | null;
  readonly goal: string | null;
  readonly id: string;
  readonly projectId: string;
  readonly remediationTaskCount: number;
  readonly result: AcceptanceResult;
  readonly stageName: string;
  readonly standards: string;
  readonly updatedAt: string;
}

export interface AcceptanceDto extends AcceptanceSummaryDto {
  readonly participants: AcceptanceParticipantDto[];
  readonly remediationTasks: AcceptanceRemediationTaskDto[];
}

export interface CreateAcceptanceInput {
  readonly acceptanceDate?: string;
  readonly failureReason?: string;
  readonly goal?: string;
  readonly participantIds: string[];
  readonly result?: AcceptanceResult;
  readonly stageName: string;
  readonly standards: string;
}

export interface UpdateAcceptanceInput {
  readonly acceptanceDate?: string;
  readonly failureReason?: string;
  readonly goal?: string;
  readonly participantIds?: string[];
  readonly result?: AcceptanceResult;
  readonly stageName?: string;
  readonly standards?: string;
}

function acceptancesPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/acceptances`;
}

function acceptancePath(projectId: string, acceptanceId: string): string {
  return `${acceptancesPath(projectId)}/${encodeURIComponent(acceptanceId)}`;
}

export function listAcceptances(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
): Promise<AcceptanceSummaryDto[]> {
  return api.get<AcceptanceSummaryDto[]>(acceptancesPath(projectId));
}

export function getAcceptance(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  acceptanceId: string,
): Promise<AcceptanceDto> {
  return api.get<AcceptanceDto>(acceptancePath(projectId, acceptanceId));
}

export function createAcceptance(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  input: CreateAcceptanceInput,
): Promise<AcceptanceDto> {
  return api.post<AcceptanceDto, CreateAcceptanceInput>(acceptancesPath(projectId), input);
}

export function updateAcceptance(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  acceptanceId: string,
  input: UpdateAcceptanceInput,
): Promise<AcceptanceDto> {
  return api.patch<AcceptanceDto, UpdateAcceptanceInput>(
    acceptancePath(projectId, acceptanceId),
    input,
  );
}
