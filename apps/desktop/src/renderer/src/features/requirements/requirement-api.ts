import type { ApiClient } from '../../lib/api/client';

export type RequirementPriority = 'HIGH' | 'LOW' | 'MEDIUM';
export type RequirementStatus =
  'COMPLETED' | 'CONFIRMED' | 'DRAFT' | 'IN_PROGRESS' | 'PENDING_ACCEPTANCE' | 'REJECTED';

export interface RequirementTaskSummary {
  readonly assigneeId: string | null;
  readonly id: string;
  readonly status: string;
  readonly title: string;
}

export interface RequirementDto {
  readonly acceptanceCriteria: string;
  readonly createdAt: string;
  readonly creatorId: string;
  readonly description: string | null;
  readonly id: string;
  readonly number: string;
  readonly priority: RequirementPriority;
  readonly projectId: string;
  readonly status: RequirementStatus;
  readonly tasks: RequirementTaskSummary[];
  readonly title: string;
  readonly updatedAt: string;
}

export interface CreateRequirementInput {
  readonly acceptanceCriteria: string;
  readonly description?: string;
  readonly priority: RequirementPriority;
  readonly title: string;
}

export interface UpdateRequirementInput {
  readonly acceptanceCriteria?: string;
  readonly description?: string;
  readonly priority?: RequirementPriority;
  readonly status?: RequirementStatus;
  readonly title?: string;
}

function requirementsPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/requirements`;
}

function requirementPath(projectId: string, requirementId: string): string {
  return `${requirementsPath(projectId)}/${encodeURIComponent(requirementId)}`;
}

export function listRequirements(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
): Promise<RequirementDto[]> {
  return api.get<RequirementDto[]>(requirementsPath(projectId));
}

export function getRequirement(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  requirementId: string,
): Promise<RequirementDto> {
  return api.get<RequirementDto>(requirementPath(projectId, requirementId));
}

export function createRequirement(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  input: CreateRequirementInput,
): Promise<RequirementDto> {
  return api.post<RequirementDto, CreateRequirementInput>(requirementsPath(projectId), input);
}

export function updateRequirement(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  requirementId: string,
  input: UpdateRequirementInput,
): Promise<RequirementDto> {
  return api.patch<RequirementDto, UpdateRequirementInput>(
    requirementPath(projectId, requirementId),
    input,
  );
}

export function deleteRequirement(
  api: Pick<ApiClient, 'delete'>,
  projectId: string,
  requirementId: string,
): Promise<{ deleted: true }> {
  return api.delete<{ deleted: true }>(requirementPath(projectId, requirementId));
}
