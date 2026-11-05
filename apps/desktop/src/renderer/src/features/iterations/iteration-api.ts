import type { ApiClient } from '../../lib/api/client';
import type { TaskStatus } from '../tasks/task-api';

export type IterationStatus = 'CANCELED' | 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';

export interface IterationSummaryDto {
  readonly createdAt: string;
  readonly endDate: string;
  readonly goal: string | null;
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
  readonly startDate: string;
  readonly status: IterationStatus;
  readonly taskCount: number;
  readonly updatedAt: string;
}

export interface IterationTaskSummaryDto {
  readonly completedAt: string | null;
  readonly dueDate: string | null;
  readonly id: string;
  readonly status: TaskStatus;
  readonly title: string;
}

export interface IterationDetailDto extends IterationSummaryDto {
  readonly tasks: IterationTaskSummaryDto[];
}

export interface IterationStatsDto {
  readonly blocked: number;
  readonly completed: number;
  readonly completionRate: number;
  readonly inProgress: number;
  readonly overdue: number;
  readonly total: number;
}

export interface CreateIterationInput {
  readonly endDate: string;
  readonly goal?: string;
  readonly name: string;
  readonly startDate: string;
}

export interface UpdateIterationInput {
  readonly endDate?: string;
  readonly goal?: string;
  readonly name?: string;
  readonly startDate?: string;
  readonly status?: IterationStatus;
}

export interface CloseIterationInput {
  readonly nextIterationId?: string;
}

function iterationsPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/iterations`;
}

function iterationPath(projectId: string, iterationId: string): string {
  return `${iterationsPath(projectId)}/${encodeURIComponent(iterationId)}`;
}

export function listIterations(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
): Promise<IterationSummaryDto[]> {
  return api.get<IterationSummaryDto[]>(iterationsPath(projectId));
}

export function getIteration(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  iterationId: string,
): Promise<IterationDetailDto> {
  return api.get<IterationDetailDto>(iterationPath(projectId, iterationId));
}

export function createIteration(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  input: CreateIterationInput,
): Promise<IterationDetailDto> {
  return api.post<IterationDetailDto, CreateIterationInput>(iterationsPath(projectId), input);
}

export function updateIteration(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  iterationId: string,
  input: UpdateIterationInput,
): Promise<IterationDetailDto> {
  return api.patch<IterationDetailDto, UpdateIterationInput>(
    iterationPath(projectId, iterationId),
    input,
  );
}

export function deleteIteration(
  api: Pick<ApiClient, 'delete'>,
  projectId: string,
  iterationId: string,
): Promise<{ deleted: true }> {
  return api.delete<{ deleted: true }>(iterationPath(projectId, iterationId));
}

export function addIterationTask(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  iterationId: string,
  taskId: string,
): Promise<IterationDetailDto> {
  return api.post<IterationDetailDto, { taskId: string }>(
    `${iterationPath(projectId, iterationId)}/tasks`,
    { taskId },
  );
}

export function removeIterationTask(
  api: Pick<ApiClient, 'delete'>,
  projectId: string,
  iterationId: string,
  taskId: string,
): Promise<IterationDetailDto> {
  return api.delete<IterationDetailDto>(
    `${iterationPath(projectId, iterationId)}/tasks/${encodeURIComponent(taskId)}`,
  );
}

export function closeIteration(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  iterationId: string,
  input: CloseIterationInput = {},
): Promise<IterationDetailDto> {
  return api.post<IterationDetailDto, CloseIterationInput>(
    `${iterationPath(projectId, iterationId)}/close`,
    input,
  );
}

export function getIterationStats(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  iterationId: string,
): Promise<IterationStatsDto> {
  return api.get<IterationStatsDto>(`${iterationPath(projectId, iterationId)}/stats`);
}
