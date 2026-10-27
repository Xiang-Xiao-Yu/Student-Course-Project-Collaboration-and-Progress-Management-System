const taskStatusLabels: Record<string, string> = {
  BACKLOG: '待规划',
  BLOCKED: '已阻塞',
  COMPLETED: '已完成',
  IN_PROGRESS: '进行中',
  PENDING_REVIEW: '待审核',
  TODO: '待开始',
};

const taskPriorityLabels: Record<string, string> = {
  HIGH: '高',
  LOW: '低',
  MEDIUM: '中',
};

export const taskStatusColumns = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'COMPLETED',
  'BLOCKED',
] as const;

const taskStatusTransitions: Readonly<Record<string, readonly string[]>> = {
  BACKLOG: ['TODO'],
  BLOCKED: ['IN_PROGRESS'],
  COMPLETED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING_REVIEW', 'BLOCKED'],
  PENDING_REVIEW: ['COMPLETED'],
  TODO: ['IN_PROGRESS', 'BLOCKED'],
};

export function getTaskStatusLabel(status: string): string {
  return taskStatusLabels[status] ?? status;
}

export function getTaskPriorityLabel(priority: string): string {
  return taskPriorityLabels[priority] ?? priority;
}

export function getTaskStatusTransitions(status: string): readonly string[] {
  return taskStatusTransitions[status] ?? [];
}

export function canTransitionTaskStatus(currentStatus: string, targetStatus: string): boolean {
  return (
    currentStatus === targetStatus || getTaskStatusTransitions(currentStatus).includes(targetStatus)
  );
}

export function getTaskStatusActionLabel(currentStatus: string, targetStatus: string): string {
  if (targetStatus === 'TODO') {
    return '移至待开始';
  }

  if (targetStatus === 'IN_PROGRESS') {
    return currentStatus === 'COMPLETED' ? '重新打开任务' : '开始处理';
  }

  if (targetStatus === 'PENDING_REVIEW') {
    return '提交审核';
  }

  if (targetStatus === 'COMPLETED') {
    return '审核通过';
  }

  if (targetStatus === 'BLOCKED') {
    return '标记为阻塞';
  }

  return getTaskStatusLabel(targetStatus);
}
