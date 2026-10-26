import type { ApiClient } from '../../lib/api/client';

export type ProjectAccessRole = 'ADMIN' | 'MEMBER' | 'OBSERVER' | 'OWNER';
export type ProjectRole = 'MEMBER' | 'OBSERVER' | 'OWNER';
export type ProjectStatus = 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' | 'PAUSED' | 'PLANNING';

export interface ProjectDto {
  readonly accessRole: ProjectAccessRole;
  readonly createdAt: string;
  readonly description: string | null;
  readonly endDate: string | null;
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly startDate: string | null;
  readonly status: ProjectStatus;
  readonly updatedAt: string;
}

export interface ProjectMemberDto {
  readonly avatarUrl: string | null;
  readonly id: string;
  readonly joinedAt: string;
  readonly nickname: string;
  readonly role: ProjectRole;
  readonly userId: string;
  readonly username: string;
}

export interface ProjectInput {
  readonly description?: string;
  readonly endDate?: string;
  readonly name?: string;
  readonly startDate?: string;
}

export interface InviteProjectMemberInput {
  readonly role: Exclude<ProjectRole, 'OWNER'>;
  readonly username: string;
}

export interface UpdateProjectMemberRoleInput {
  readonly role: ProjectRole;
}

function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function listProjects(api: Pick<ApiClient, 'get'>): Promise<ProjectDto[]> {
  return api.get<ProjectDto[]>('/projects');
}

export function createProject(
  api: Pick<ApiClient, 'post'>,
  input: ProjectInput,
): Promise<ProjectDto> {
  return api.post<ProjectDto, ProjectInput>('/projects', input);
}

export function getProject(api: Pick<ApiClient, 'get'>, projectId: string): Promise<ProjectDto> {
  return api.get<ProjectDto>(projectPath(projectId));
}

export function updateProject(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  input: ProjectInput,
): Promise<ProjectDto> {
  return api.patch<ProjectDto, ProjectInput>(projectPath(projectId), input);
}

export function updateProjectStatus(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  status: ProjectStatus,
): Promise<ProjectDto> {
  return api.patch<ProjectDto, { status: ProjectStatus }>(`${projectPath(projectId)}/status`, {
    status,
  });
}

export function archiveProject(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
): Promise<ProjectDto> {
  return api.post<ProjectDto>(`${projectPath(projectId)}/archive`);
}

export function deleteProject(
  api: Pick<ApiClient, 'delete'>,
  projectId: string,
  confirmName: string,
): Promise<{ deleted: true }> {
  return api.delete<{ deleted: true }, { confirmName: string }>(projectPath(projectId), {
    confirmName,
  });
}

export function listProjectMembers(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
): Promise<ProjectMemberDto[]> {
  return api.get<ProjectMemberDto[]>(`${projectPath(projectId)}/members`);
}

export function inviteProjectMember(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  input: InviteProjectMemberInput,
): Promise<ProjectMemberDto> {
  return api.post<ProjectMemberDto, InviteProjectMemberInput>(
    `${projectPath(projectId)}/members`,
    input,
  );
}

export function updateProjectMemberRole(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ProjectMemberDto> {
  return api.patch<ProjectMemberDto, UpdateProjectMemberRoleInput>(
    `${projectPath(projectId)}/members/${encodeURIComponent(userId)}`,
    { role },
  );
}

export function removeProjectMember(
  api: Pick<ApiClient, 'delete'>,
  projectId: string,
  userId: string,
): Promise<{ removed: true }> {
  return api.delete<{ removed: true }>(
    `${projectPath(projectId)}/members/${encodeURIComponent(userId)}`,
  );
}
