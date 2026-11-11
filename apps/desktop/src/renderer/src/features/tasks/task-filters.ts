import type { TaskListFilters } from './task-api';

export interface TaskFilterValues {
  readonly assigneeId: string;
  readonly dueDateFrom: string;
  readonly dueDateTo: string;
  readonly iterationId: string;
  readonly priority: string;
  readonly search: string;
  readonly status: string;
  readonly tag: string;
}

export const EMPTY_TASK_FILTER_VALUES: TaskFilterValues = {
  assigneeId: '',
  dueDateFrom: '',
  dueDateTo: '',
  iterationId: '',
  priority: '',
  search: '',
  status: '',
  tag: '',
};

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function validateTaskFilterValues(values: TaskFilterValues): string | null {
  if (values.dueDateFrom && !isCalendarDate(values.dueDateFrom)) {
    return '截止日期筛选的开始日期无效，请使用 YYYY-MM-DD 格式。';
  }

  if (values.dueDateTo && !isCalendarDate(values.dueDateTo)) {
    return '截止日期筛选的结束日期无效，请使用 YYYY-MM-DD 格式。';
  }

  if (values.dueDateFrom && values.dueDateTo && values.dueDateFrom > values.dueDateTo) {
    return '截止日期筛选的结束日期不能早于开始日期。';
  }

  return null;
}

export function toTaskListFilters(values: TaskFilterValues): TaskListFilters {
  return {
    ...(values.search.trim() ? { search: values.search.trim() } : {}),
    ...(values.assigneeId ? { assigneeId: values.assigneeId } : {}),
    ...(values.status ? { status: values.status as TaskListFilters['status'] } : {}),
    ...(values.priority ? { priority: values.priority as TaskListFilters['priority'] } : {}),
    ...(values.tag.trim() ? { tag: values.tag.trim() } : {}),
    ...(values.iterationId ? { iterationId: values.iterationId } : {}),
    ...(values.dueDateFrom ? { dueDateFrom: values.dueDateFrom } : {}),
    ...(values.dueDateTo ? { dueDateTo: values.dueDateTo } : {}),
  };
}

export function countActiveTaskFilters(filters: TaskListFilters): number {
  return Object.values(filters).filter((value) => Boolean(value?.trim())).length;
}

export function hasActiveTaskFilters(filters: TaskListFilters): boolean {
  return countActiveTaskFilters(filters) > 0;
}
