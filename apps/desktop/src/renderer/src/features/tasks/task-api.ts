import type { ApiClient, ApiDownload } from '../../lib/api/client';

export type TaskPriority = 'HIGH' | 'LOW' | 'MEDIUM';
export type TaskStatus =
  'BACKLOG' | 'BLOCKED' | 'COMPLETED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'TODO';

export interface TaskDto {
  readonly assigneeId: string | null;
  readonly completedAt: string | null;
  readonly completionNote: string | null;
  readonly createdAt: string;
  readonly createdById: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly estimatedHours: number | null;
  readonly id: string;
  readonly priority: TaskPriority;
  readonly projectId: string;
  readonly requirementId: string | null;
  readonly rejectionReason: string | null;
  readonly status: TaskStatus;
  readonly tagNames: string[];
  readonly title: string;
  readonly updatedAt: string;
}

export interface CreateTaskInput {
  readonly acceptanceId?: string;
  readonly assigneeId?: string;
  readonly description?: string;
  readonly dueDate?: string;
  readonly estimatedHours?: number;
  readonly priority: TaskPriority;
  readonly requirementId?: string;
  readonly tagNames?: string[];
  readonly title: string;
}

export interface UpdateTaskInput {
  readonly assigneeId?: string;
  readonly description?: string;
  readonly dueDate?: string;
  readonly estimatedHours?: number;
  readonly priority?: TaskPriority;
  readonly requirementId?: string;
  readonly tagNames?: string[];
  readonly title?: string;
}

export interface UpdateTaskStatusInput {
  readonly completionNote?: string;
  readonly rejectionReason?: string;
  readonly reopenReason?: string;
  readonly status: TaskStatus;
}

export interface TaskListFilters {
  readonly assigneeId?: string;
  readonly dueDateFrom?: string;
  readonly dueDateTo?: string;
  readonly iterationId?: string;
  readonly priority?: TaskPriority;
  readonly search?: string;
  readonly status?: TaskStatus;
  readonly tag?: string;
}

function tasksPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/tasks`;
}

function taskPath(projectId: string, taskId: string): string {
  return `${tasksPath(projectId)}/${encodeURIComponent(taskId)}`;
}

export function buildTaskQueryString(filters: TaskListFilters = {}): string {
  const searchParams = new URLSearchParams();
  const entries = [
    ['search', filters.search],
    ['assigneeId', filters.assigneeId],
    ['status', filters.status],
    ['priority', filters.priority],
    ['tag', filters.tag],
    ['iterationId', filters.iterationId],
    ['dueDateFrom', filters.dueDateFrom],
    ['dueDateTo', filters.dueDateTo],
  ] as const;

  for (const [key, value] of entries) {
    const normalized = value?.trim();

    if (normalized) {
      searchParams.set(key, normalized);
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function tasksListPath(projectId: string, filters?: TaskListFilters): string {
  return `${tasksPath(projectId)}${buildTaskQueryString(filters)}`;
}

export function listTasks(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  filters: TaskListFilters = {},
): Promise<TaskDto[]> {
  return api.get<TaskDto[]>(tasksListPath(projectId, filters));
}

export function exportTasksCsv(
  api: Pick<ApiClient, 'download'>,
  projectId: string,
  filters: TaskListFilters = {},
): Promise<ApiDownload> {
  return api.download(`${tasksPath(projectId)}/export${buildTaskQueryString(filters)}`);
}

export function getTask(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  taskId: string,
): Promise<TaskDto> {
  return api.get<TaskDto>(taskPath(projectId, taskId));
}

export function createTask(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  input: CreateTaskInput,
): Promise<TaskDto> {
  return api.post<TaskDto, CreateTaskInput>(tasksPath(projectId), input);
}

export function updateTask(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskDto> {
  return api.patch<TaskDto, UpdateTaskInput>(taskPath(projectId, taskId), input);
}

export function updateTaskStatus(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  taskId: string,
  input: UpdateTaskStatusInput,
): Promise<TaskDto> {
  return api.patch<TaskDto, UpdateTaskStatusInput>(`${taskPath(projectId, taskId)}/status`, input);
}

export function deleteTask(
  api: Pick<ApiClient, 'delete'>,
  projectId: string,
  taskId: string,
): Promise<{ deleted: true }> {
  return api.delete<{ deleted: true }>(taskPath(projectId, taskId));
}
