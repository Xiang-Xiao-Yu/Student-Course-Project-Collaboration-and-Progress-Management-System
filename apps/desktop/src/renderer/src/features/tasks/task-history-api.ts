import type { ApiClient } from '../../lib/api/client';

export interface TaskCommentAuthorDto {
  readonly avatarUrl: string | null;
  readonly id: string;
  readonly nickname: string;
  readonly username: string;
}

export interface TaskCommentDto {
  readonly author: TaskCommentAuthorDto;
  readonly content: string;
  readonly createdAt: string;
  readonly id: string;
  readonly targetType: 'TASK';
  readonly updatedAt: string;
}

export interface TaskActivityActorDto {
  readonly id: string;
  readonly nickname: string;
  readonly username: string;
}

export interface TaskActivityDto {
  readonly action: string;
  readonly actor: TaskActivityActorDto | null;
  readonly afterValue: unknown;
  readonly beforeValue: unknown;
  readonly createdAt: string;
  readonly id: string;
  readonly targetId: string;
  readonly targetType: string;
}

function taskQuery(projectId: string, taskId: string, resource: 'activity' | 'comments'): string {
  const params = new URLSearchParams({
    targetId: taskId,
    targetType: 'TASK',
  });

  if (resource === 'activity') {
    params.set('limit', '100');
  }

  return `/projects/${encodeURIComponent(projectId)}/${resource}?${params.toString()}`;
}

export function listTaskComments(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  taskId: string,
): Promise<TaskCommentDto[]> {
  return api.get<TaskCommentDto[]>(taskQuery(projectId, taskId, 'comments'));
}

export function listTaskActivity(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  taskId: string,
): Promise<TaskActivityDto[]> {
  return api.get<TaskActivityDto[]>(taskQuery(projectId, taskId, 'activity'));
}
