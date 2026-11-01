import type { TaskActivityDto } from './task-history-api';
import { getTaskStatusLabel } from './task-presentation';

const actionLabels: Readonly<Record<string, string>> = {
  TASK_CREATED: '创建任务',
  TASK_DELETED: '删除任务',
  TASK_REVIEW_REJECTED: '审核不通过',
  TASK_REVIEW_RESUBMITTED: '重新提交审核',
  TASK_STATUS_CHANGED: '更新任务状态',
  TASK_UPDATED: '更新任务信息',
};

function readStringProperty(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === 'string' && property.trim() ? property : null;
}

export function getTaskActivityLabel(action: string): string {
  return actionLabels[action] ?? '更新任务';
}

export function getTaskActivityDetail(activity: TaskActivityDto): string | null {
  if (activity.action === 'TASK_STATUS_CHANGED') {
    const before = readStringProperty(activity.beforeValue, 'status');
    const after = readStringProperty(activity.afterValue, 'status');

    if (before && after) {
      return `${getTaskStatusLabel(before)} → ${getTaskStatusLabel(after)}`;
    }
  }

  if (activity.action === 'TASK_REVIEW_REJECTED') {
    const reason = readStringProperty(activity.afterValue, 'rejectionReason');

    return reason ? `原因：${reason}` : null;
  }

  return null;
}
