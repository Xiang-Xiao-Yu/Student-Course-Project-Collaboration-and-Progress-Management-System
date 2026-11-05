import type { ApiClient } from '../../lib/api/client';

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

function taskQuery(projectId: string, taskId: string, query: TaskActivityQuery = {}): string {
  const params = new URLSearchParams({
    targetId: taskId,
    targetType: 'TASK',
  });

  params.set('limit', String(query.limit ?? TASK_ACTIVITY_PAGE_SIZE));

  if (query.cursor) {
    params.set('cursor', query.cursor);
  }

  return `/projects/${encodeURIComponent(projectId)}/activity?${params.toString()}`;
}

export function listTaskActivity(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  taskId: string,
  query: TaskActivityQuery = {},
): Promise<TaskActivityDto[]> {
  return api.get<TaskActivityDto[]>(taskQuery(projectId, taskId, query));
}

export function mergeTaskActivities(
  current: readonly TaskActivityDto[],
  next: readonly TaskActivityDto[],
): TaskActivityDto[] {
  const byId = new Map(current.map((activity) => [activity.id, activity]));

  for (const activity of next) {
    byId.set(activity.id, activity);
  }

  return [...byId.values()].sort((left, right) => {
    const createdAtOrder = right.createdAt.localeCompare(left.createdAt);

    return createdAtOrder || right.id.localeCompare(left.id);
  });
}

export type TaskActivityPageResolution =
  | {
      readonly activities: readonly TaskActivityDto[];
      readonly applied: false;
    }
  | {
      readonly activities: TaskActivityDto[];
      readonly applied: true;
      readonly hasMore: boolean;
    };

export function resolveTaskActivityPage(
  current: readonly TaskActivityDto[],
  page: readonly TaskActivityDto[],
  requestVersion: number,
  currentVersion: number,
): TaskActivityPageResolution {
  if (requestVersion !== currentVersion) {
    return { activities: current, applied: false };
  }

  return {
    activities: mergeTaskActivities(current, page),
    applied: true,
    hasMore: page.length === TASK_ACTIVITY_PAGE_SIZE,
  };
}
