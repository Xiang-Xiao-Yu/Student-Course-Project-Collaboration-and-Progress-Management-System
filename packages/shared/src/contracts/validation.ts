import type { CommentTargetType } from './status';

export interface CommentTargetInput {
  targetType: CommentTargetType;
  projectId: string;
  targetProjectId: string;
  requirementId?: string | null;
  taskId?: string | null;
  meetingId?: string | null;
}

export function isCommentTargetValid(input: CommentTargetInput): boolean {
  if (!input.projectId || input.projectId !== input.targetProjectId) {
    return false;
  }

  const targets = {
    REQUIREMENT: input.requirementId,
    TASK: input.taskId,
    MEETING: input.meetingId,
  };

  return Object.entries(targets).every(([type, id]) =>
    type === input.targetType ? typeof id === 'string' && id.length > 0 : id == null,
  );
}

export const REQUEST_VALIDATION_RULES = {
  COMMENT_CONTENT_MIN_LENGTH: 1,
  PASSWORD_MIN_LENGTH: 8,
  PROJECT_NAME_MIN_LENGTH: 1,
  REQUIREMENT_ACCEPTANCE_CRITERIA_MIN_LENGTH: 1,
  REQUIREMENT_TITLE_MAX_LENGTH: 100,
  REQUIREMENT_TITLE_MIN_LENGTH: 1,
  TASK_TITLE_MIN_LENGTH: 1,
  USERNAME_MIN_LENGTH: 1,
} as const;

export function isDateRangeValid(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): boolean {
  if (!startDate || !endDate) {
    return true;
  }

  return startDate.getTime() <= endDate.getTime();
}

export function isTaskDueDateValid(
  dueDate: Date | null | undefined,
  projectStartDate: Date | null | undefined,
): boolean {
  if (!dueDate || !projectStartDate) {
    return true;
  }

  return dueDate.getTime() >= projectStartDate.getTime();
}
