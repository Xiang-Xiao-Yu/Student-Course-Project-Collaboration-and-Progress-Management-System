import type { TaskDto } from './task-api';

export type BoardTaskMutation =
  | { readonly task: TaskDto; readonly type: 'created' }
  | { readonly task: TaskDto; readonly type: 'updated' }
  | { readonly taskId: string; readonly type: 'deleted' };

export function applyBoardTaskMutation(
  currentTasks: readonly TaskDto[],
  mutation: BoardTaskMutation,
): TaskDto[] {
  if (mutation.type === 'created') {
    const exists = currentTasks.some((task) => task.id === mutation.task.id);

    return exists
      ? currentTasks.map((task) => (task.id === mutation.task.id ? mutation.task : task))
      : [...currentTasks, mutation.task];
  }

  if (mutation.type === 'updated') {
    return currentTasks.map((task) => (task.id === mutation.task.id ? mutation.task : task));
  }

  return currentTasks.filter((task) => task.id !== mutation.taskId);
}
