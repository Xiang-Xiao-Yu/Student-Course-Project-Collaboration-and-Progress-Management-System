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
