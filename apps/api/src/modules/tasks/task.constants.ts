export const TASK_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'COMPLETED',
  'BLOCKED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  BACKLOG: ['TODO'],
  TODO: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['PENDING_REVIEW', 'BLOCKED'],
  PENDING_REVIEW: ['COMPLETED'],
  COMPLETED: ['IN_PROGRESS'],
  BLOCKED: ['IN_PROGRESS'],
};
