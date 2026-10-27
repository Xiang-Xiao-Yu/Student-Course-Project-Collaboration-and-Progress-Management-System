import type { ApiClient } from '../../lib/api/client';

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
  readonly status: TaskStatus;
  readonly tagNames: string[];
  readonly title: string;
  readonly updatedAt: string;
}

export interface CreateTaskInput {
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
  readonly reopenReason?: string;
  readonly status: TaskStatus;
}

function tasksPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/tasks`;
}

function taskPath(projectId: string, taskId: string): string {
  return `${tasksPath(projectId)}/${encodeURIComponent(taskId)}`;
}

export function listTasks(api: Pick<ApiClient, 'get'>, projectId: string): Promise<TaskDto[]> {
  return api.get<TaskDto[]>(tasksPath(projectId));
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
