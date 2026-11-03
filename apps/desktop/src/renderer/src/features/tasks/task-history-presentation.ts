import type { TaskActivityDto } from './task-history-api';
import { getTaskPriorityLabel, getTaskStatusLabel } from './task-presentation';

const actionLabels: Readonly<Record<string, string>> = {
  TASK_CREATED: '创建任务',
  TASK_DELETED: '删除任务',
  TASK_REVIEW_REJECTED: '审核不通过',
  TASK_REVIEW_RESUBMITTED: '重新提交审核',
  TASK_STATUS_CHANGED: '更新任务状态',
  TASK_UPDATED: '更新任务信息',
};

interface ActivityField {
  readonly key: string;
  readonly label: string;
}

const activityFields: readonly ActivityField[] = [
  { key: 'title', label: '标题' },
  { key: 'description', label: '描述' },
  { key: 'assigneeId', label: '负责人' },
  { key: 'requirementId', label: '关联需求' },
  { key: 'priority', label: '优先级' },
  { key: 'dueDate', label: '截止日期' },
  { key: 'estimatedHours', label: '预估工时' },
  { key: 'tagNames', label: '标签' },
  { key: 'status', label: '状态' },
  { key: 'completionNote', label: '完成说明' },
  { key: 'rejectionReason', label: '审核不通过原因' },
  { key: 'reopenReason', label: '重新打开原因' },
  { key: 'completedAt', label: '完成时间' },
];

function readStringProperty(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === 'string' && property.trim() ? property : null;
}

function readSnapshot(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function formatDateValue(value: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] ?? value;
}

function formatActivityValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '未设置';
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join('、') : '未设置';
  }

  if (key === 'status') {
    return getTaskStatusLabel(String(value));
  }

  if (key === 'priority') {
    return getTaskPriorityLabel(String(value));
  }

  if (key === 'estimatedHours') {
    return `${String(value)} 小时`;
  }

  if (key === 'dueDate' || key === 'completedAt') {
    return formatDateValue(String(value));
  }

  return String(value);
}

function normalizeComparableValue(value: unknown): unknown {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return Array.isArray(value) && value.length === 0 ? null : value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeComparableValue(left)) ===
    JSON.stringify(normalizeComparableValue(right))
  );
}

function formatSnapshot(snapshot: Record<string, unknown>): string {
  return activityFields
    .filter(({ key }) => snapshot[key] !== null && snapshot[key] !== undefined)
    .map(({ key, label }) => `${label}：${formatActivityValue(key, snapshot[key])}`)
    .join('；');
}

function formatChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string {
  return activityFields
    .filter(({ key }) => !valuesEqual(before[key], after[key]))
    .map(
      ({ key, label }) =>
        `${label}：${formatActivityValue(key, before[key])} → ${formatActivityValue(
          key,
          after[key],
        )}`,
    )
    .join('；');
}

export function getTaskActivityLabel(action: string): string {
  return actionLabels[action] ?? '更新任务';
}

export function getTaskActivityDetail(activity: TaskActivityDto): string | null {
  const before = readSnapshot(activity.beforeValue);
  const after = readSnapshot(activity.afterValue);

  if (activity.action === 'TASK_CREATED') {
    const detail = after ? formatSnapshot(after) : '';

    return detail ? `创建内容：${detail}` : null;
  }

  if (activity.action === 'TASK_DELETED') {
    const detail = before ? formatSnapshot(before) : '';

    return detail ? `删除前内容：${detail}` : null;
  }

  if (before && after) {
    const detail = formatChangedFields(before, after);

    return detail || null;
  }

  if (activity.action === 'TASK_REVIEW_REJECTED') {
    const reason = readStringProperty(activity.afterValue, 'rejectionReason');

    return reason ? `审核不通过原因：${reason}` : null;
  }

  if (activity.action === 'TASK_STATUS_CHANGED') {
    const beforeStatus = readStringProperty(activity.beforeValue, 'status');
    const afterStatus = readStringProperty(activity.afterValue, 'status');

    return beforeStatus && afterStatus
      ? `状态：${getTaskStatusLabel(beforeStatus)} → ${getTaskStatusLabel(afterStatus)}`
      : null;
  }

  return null;
}
