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

export const TASK_ACTIVITY_PAGE_SIZE = 100;

export interface TaskActivityQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

function taskQuery(
  projectId: string,
  taskId: string,
  resource: 'activity' | 'comments',
  query: TaskActivityQuery = {},
): string {
  const params = new URLSearchParams({
    targetId: taskId,
    targetType: 'TASK',
  });

  if (resource === 'activity') {
    params.set('limit', String(query.limit ?? TASK_ACTIVITY_PAGE_SIZE));

    if (query.cursor) {
      params.set('cursor', query.cursor);
    }
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
  query: TaskActivityQuery = {},
): Promise<TaskActivityDto[]> {
  return api.get<TaskActivityDto[]>(taskQuery(projectId, taskId, 'activity', query));
}

export function mergeTaskActivities(
  current: readonly TaskActivityDto[],
  next: readonly TaskActivityDto[],
): TaskActivityDto[] {
  const byId = new Map(current.map((activity) => [activity.id, activity]));

  for (const activity of next) {
    byId.set(activity.id, activity);
  }

  return [...byId.values()];
}
