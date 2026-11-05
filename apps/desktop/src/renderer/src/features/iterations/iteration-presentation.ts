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

export function isIterationTaskOverdue(
  task: Pick<IterationTaskSummaryDto, 'dueDate' | 'status'>,
  now = new Date(),
): boolean {
  if (!task.dueDate || task.status === 'COMPLETED') {
    return false;
  }

  const dueDate = new Date(task.dueDate);

  return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < now.getTime();
}
