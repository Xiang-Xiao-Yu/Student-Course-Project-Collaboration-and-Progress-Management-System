import type { MeetingActionStatus } from './meeting-api';

const actionStatusLabels: Readonly<Record<MeetingActionStatus, string>> = {
  CANCELED: '已取消',
  COMPLETED: '已完成',
  IN_PROGRESS: '进行中',
  PENDING: '待处理',
};

const actionStatusTransitions: Readonly<
  Record<MeetingActionStatus, readonly MeetingActionStatus[]>
> = {
  CANCELED: [],
  COMPLETED: [],
  IN_PROGRESS: ['COMPLETED', 'CANCELED'],
  PENDING: ['IN_PROGRESS', 'CANCELED'],
};

export function getMeetingActionStatusLabel(status: MeetingActionStatus): string {
  return actionStatusLabels[status];
}

export function getMeetingActionStatusTransitions(
  status: MeetingActionStatus,
): readonly MeetingActionStatus[] {
  return actionStatusTransitions[status];
}

export function formatMeetingDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '时间无效';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function isMeetingActionOverdue(
  dueDate: string | null,
  status: MeetingActionStatus,
  now = new Date(),
): boolean {
  if (!dueDate || status === 'COMPLETED' || status === 'CANCELED') {
    return false;
  }

  const dueDay = /^(\d{4}-\d{2}-\d{2})/.exec(dueDate)?.[1];
  const todayParts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).formatToParts(now);
  const year = todayParts.find((part) => part.type === 'year')?.value;
  const month = todayParts.find((part) => part.type === 'month')?.value;
  const day = todayParts.find((part) => part.type === 'day')?.value;
  const today = year && month && day ? `${year}-${month}-${day}` : null;

  return Boolean(dueDay && today && dueDay < today);
}

export function isMeetingActionDueDateBeforeProjectStart(
  dueDate: string | null,
  projectStartDate: string | null,
): boolean {
  if (!dueDate || !projectStartDate) {
    return false;
  }

  const dueDay = /^(\d{4}-\d{2}-\d{2})/.exec(dueDate)?.[1];
  const startDay = /^(\d{4}-\d{2}-\d{2})/.exec(projectStartDate)?.[1];

  return Boolean(dueDay && startDay && dueDay < startDay);
}
