import type { ProjectDashboard } from './dashboard-api';

const activityLabels: Readonly<Record<string, string>> = {
  ACCEPTANCE_CREATED: '创建阶段验收',
  ACCEPTANCE_UPDATED: '更新阶段验收',
  COMMENT_CREATED: '发布评论',
  COMMENT_DELETED: '删除评论',
  COMMENT_UPDATED: '更新评论',
  ITERATION_CREATED: '创建迭代',
  ITERATION_STATUS_UPDATED: '更新迭代状态',
  ITERATION_TASK_ADDED: '将任务加入迭代',
  ITERATION_TASK_REMOVED: '将任务移出迭代',
  ITERATION_UPDATED: '更新迭代',
  MEETING_ACTION_CONVERTED: '将行动项转为任务',
  MEETING_ACTION_CREATED: '创建行动项',
  MEETING_ACTION_UPDATED: '更新行动项',
  MEETING_CREATED: '创建会议',
  MEETING_UPDATED: '更新会议',
  MEMBER_JOINED: '邀请项目成员',
  MEMBER_REMOVED: '移除项目成员',
  MEMBER_ROLE_UPDATED: '调整成员角色',
  PROJECT_ARCHIVED: '归档项目',
  PROJECT_CREATED: '创建项目',
  PROJECT_DELETED: '删除项目',
  PROJECT_STATUS_UPDATED: '更新项目状态',
  PROJECT_UPDATED: '更新项目',
  REQUIREMENT_CREATED: '创建需求',
  REQUIREMENT_DELETED: '删除需求',
  REQUIREMENT_STATUS_UPDATED: '更新需求状态',
  REQUIREMENT_UPDATED: '更新需求',
  TASK_CREATED: '创建任务',
  TASK_DELETED: '删除任务',
  TASK_REOPENED: '重新打开任务',
  TASK_STATUS_UPDATED: '更新任务状态',
  TASK_UPDATED: '更新任务',
};

export function formatCompletionRate(rate: number): string {
  const normalized = Number.isFinite(rate) ? Math.max(0, Math.min(1, rate)) : 0;
  return `${Math.round(normalized * 10000) / 100}%`;
}

export function formatDashboardDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '时间无效';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function getDashboardActivityLabel(action: string): string {
  return activityLabels[action] ?? action.replaceAll('_', ' ');
}

export function isDashboardEmpty(dashboard: ProjectDashboard): boolean {
  return (
    dashboard.summary.totalTasks === 0 &&
    dashboard.summary.totalRequirements === 0 &&
    dashboard.iterationCompletion.length === 0
  );
}
