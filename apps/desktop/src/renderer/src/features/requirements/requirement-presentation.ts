import type { RequirementPriority, RequirementStatus } from './requirement-api';

const priorityLabels: Readonly<Record<RequirementPriority, string>> = {
  HIGH: '高',
  LOW: '低',
  MEDIUM: '中',
};

const statusLabels: Readonly<Record<RequirementStatus, string>> = {
  COMPLETED: '已完成',
  CONFIRMED: '已确认',
  DRAFT: '草稿',
  IN_PROGRESS: '开发中',
  PENDING_ACCEPTANCE: '待验收',
  REJECTED: '已拒绝',
};

const statusTransitions: Readonly<Record<RequirementStatus, readonly RequirementStatus[]>> = {
  COMPLETED: [],
  CONFIRMED: ['IN_PROGRESS', 'REJECTED'],
  DRAFT: ['CONFIRMED'],
  IN_PROGRESS: ['PENDING_ACCEPTANCE'],
  PENDING_ACCEPTANCE: ['COMPLETED', 'REJECTED'],
  REJECTED: [],
};

export function getRequirementPriorityLabel(priority: RequirementPriority): string {
  return priorityLabels[priority];
}

export function getRequirementStatusLabel(status: RequirementStatus): string {
  return statusLabels[status];
}

export function getRequirementStatusTransitions(
  status: RequirementStatus,
): readonly RequirementStatus[] {
  return statusTransitions[status];
}

export function getRequirementStatusOptions(
  currentStatus: RequirementStatus,
): readonly RequirementStatus[] {
  return [currentStatus, ...statusTransitions[currentStatus]];
}

export function getRequirementTaskProgress(tasks: readonly { readonly status: string }[]): string {
  if (tasks.length === 0) {
    return '暂未关联任务';
  }

  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;

  return `${completed}/${tasks.length} 个任务已完成`;
}
