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

export function getTaskStatusLabel(status: string): string {
  return taskStatusLabels[status] ?? status;
}

export function getTaskPriorityLabel(priority: string): string {
  return taskPriorityLabels[priority] ?? priority;
}
