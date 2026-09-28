export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PROJECT_ROLES = ['OWNER', 'MEMBER', 'OBSERVER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REQUIREMENT_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'PENDING_ACCEPTANCE',
  'COMPLETED',
  'REJECTED',
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const TASK_STATUSES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'COMPLETED',
  'BLOCKED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ITERATION_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const;
export type IterationStatus = (typeof ITERATION_STATUSES)[number];

export const COMMENT_TARGET_TYPES = ['REQUIREMENT', 'TASK', 'MEETING'] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];

export const MEETING_ACTION_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const;
export type MeetingActionStatus = (typeof MEETING_ACTION_STATUSES)[number];

export const ACCEPTANCE_RESULTS = ['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED'] as const;
export type AcceptanceResult = (typeof ACCEPTANCE_RESULTS)[number];

export const ACTIVITY_TARGET_TYPES = [
  'PROJECT',
  'MEMBER',
  'REQUIREMENT',
  'TASK',
  'ITERATION',
  'COMMENT',
  'MEETING',
  'MEETING_ACTION',
  'ACCEPTANCE',
] as const;
export type ActivityTargetType = (typeof ACTIVITY_TARGET_TYPES)[number];

export const TASK_STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  BACKLOG: ['TODO'],
  TODO: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['PENDING_REVIEW', 'BLOCKED'],
  PENDING_REVIEW: ['COMPLETED'],
  COMPLETED: ['IN_PROGRESS'],
  BLOCKED: ['IN_PROGRESS'],
};

export const REQUIREMENT_STATUS_TRANSITIONS: Readonly<
  Record<RequirementStatus, readonly RequirementStatus[]>
> = {
  DRAFT: ['CONFIRMED'],
  CONFIRMED: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['PENDING_ACCEPTANCE'],
  PENDING_ACCEPTANCE: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};
