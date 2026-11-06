import type { IterationStatus } from './iteration-api';
import type { IterationTaskSummaryDto } from './iteration-api';

const iterationStatusLabels: Readonly<Record<IterationStatus, string>> = {
  CANCELED: '已取消',
  COMPLETED: '已完成',
  IN_PROGRESS: '进行中',
  NOT_STARTED: '未开始',
};

const iterationStatusTransitions: Readonly<Record<IterationStatus, readonly IterationStatus[]>> = {
  CANCELED: [],
  COMPLETED: [],
  IN_PROGRESS: ['COMPLETED', 'CANCELED'],
  NOT_STARTED: ['IN_PROGRESS', 'CANCELED'],
};

export function getIterationStatusLabel(status: IterationStatus): string {
  return iterationStatusLabels[status];
}

export function getIterationStatusTransitions(status: IterationStatus): readonly IterationStatus[] {
  return iterationStatusTransitions[status];
}

export function getIterationStatusActionLabel(targetStatus: IterationStatus): string {
  switch (targetStatus) {
    case 'IN_PROGRESS':
      return '开始迭代';
    case 'COMPLETED':
      return '关闭迭代';
    case 'CANCELED':
      return '取消迭代';
    default:
      return getIterationStatusLabel(targetStatus);
  }
}

export function formatCompletionRate(rate: number): string {
  const percentage = Math.max(0, Math.min(100, rate * 100));

  return `${Number.isInteger(percentage) ? percentage : percentage.toFixed(1)}%`;
}

function toCalendarDate(value: Date, timeZone: string): string | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function isIterationTaskOverdue(
  task: Pick<IterationTaskSummaryDto, 'dueDate' | 'status'>,
  now = new Date(),
  timeZone = 'Asia/Shanghai',
): boolean {
  if (!task.dueDate || task.status === 'COMPLETED') {
    return false;
  }

  const dueDate = /^(\d{4}-\d{2}-\d{2})/.exec(task.dueDate)?.[1] ?? null;
  const today = toCalendarDate(now, timeZone);

  return Boolean(dueDate && today && dueDate < today);
}
