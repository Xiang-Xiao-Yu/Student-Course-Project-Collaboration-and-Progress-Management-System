import type { ProjectDashboard } from './dashboard-api';

const activityLabels: Readonly<Record<string, string>> = {
  ACCEPTANCE_CREATED: '创建阶段验收',
  ACCEPTANCE_RESULT_RECORDED: '记录验收结果',
  ACCEPTANCE_UPDATED: '更新阶段验收',
  COMMENT_CREATED: '发布评论',
  COMMENT_DELETED: '删除评论',
  COMMENT_UPDATED: '更新评论',
  ITERATION_CREATED: '创建迭代',
  ITERATION_CLOSED: '关闭迭代',
  ITERATION_DELETED: '删除迭代',
  ITERATION_STATUS_CHANGED: '更新迭代状态',
  ITERATION_STATUS_UPDATED: '更新迭代状态',
  ITERATION_TASK_ADDED: '将任务加入迭代',
  ITERATION_TASK_REMOVED: '将任务移出迭代',
  ITERATION_UPDATED: '更新迭代',
  MEETING_ACTION_CONVERTED: '将行动项转为任务',
  MEETING_ACTION_CREATED: '创建行动项',
  MEETING_ACTION_UPDATED: '更新行动项',
  MEETING_ACTION_STATUS_CHANGED: '更新行动项状态',
  MEETING_CREATED: '创建会议',
  MEETING_UPDATED: '更新会议',
  MEMBER_JOINED: '邀请项目成员',
  MEMBER_REMOVED: '移除项目成员',
  MEMBER_ROLE_UPDATED: '调整成员角色',
  PROJECT_ARCHIVED: '归档项目',
  PROJECT_CREATED: '创建项目',
  PROJECT_MEMBER_ADDED: '邀请项目成员',
  PROJECT_MEMBER_REMOVED: '移除项目成员',
  PROJECT_MEMBER_ROLE_CHANGED: '调整成员角色',
  PROJECT_OWNER_TRANSFERRED: '移交项目负责人',
  PROJECT_STATUS_CHANGED: '更新项目状态',
  PROJECT_DELETED: '删除项目',
  PROJECT_STATUS_UPDATED: '更新项目状态',
  PROJECT_UPDATED: '更新项目',
  REQUIREMENT_CREATED: '创建需求',
  REQUIREMENT_STATUS_CHANGED: '更新需求状态',
  REQUIREMENT_DELETED: '删除需求',
  REQUIREMENT_STATUS_UPDATED: '更新需求状态',
  REQUIREMENT_UPDATED: '更新需求',
  TASK_CREATED: '创建任务',
  TASK_DELETED: '删除任务',
  TASK_REOPENED: '重新打开任务',
  TASK_REVIEW_REJECTED: '驳回任务审核',
  TASK_REVIEW_RESUBMITTED: '重新提交任务审核',
  TASK_STATUS_CHANGED: '更新任务状态',
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
  return activityLabels[action] ?? '更新项目记录';
}

export interface DashboardSectionVisibility {
  readonly hasBurndownHistory: boolean;
  readonly hasCompletionHistory: boolean;
  readonly hasIterationTasks: boolean;
  readonly hasMemberTasks: boolean;
  readonly hasTaskStatus: boolean;
}

export function getDashboardSectionVisibility(
  dashboard: ProjectDashboard,
): DashboardSectionVisibility {
  return {
    hasBurndownHistory: dashboard.burndown.some(
      (point) =>
        point.completedTasks > 0 || point.idealRemainingTasks > 0 || point.remainingTasks > 0,
    ),
    hasCompletionHistory: dashboard.completionTrend.some(
      (point) => point.completed > 0 || point.cumulativeCompleted > 0,
    ),
    hasIterationTasks: dashboard.iterationCompletion.some((iteration) => iteration.totalTasks > 0),
    hasMemberTasks: dashboard.memberTaskDistribution.some((member) => member.totalTasks > 0),
    hasTaskStatus: dashboard.summary.totalTasks > 0,
  };
}

export function isDashboardEmpty(dashboard: ProjectDashboard): boolean {
  const visibility = getDashboardSectionVisibility(dashboard);

  return (
    !visibility.hasTaskStatus &&
    !visibility.hasMemberTasks &&
    !visibility.hasIterationTasks &&
    !visibility.hasCompletionHistory &&
    !visibility.hasBurndownHistory &&
    dashboard.summary.totalRequirements === 0 &&
    dashboard.recentActivities.length === 0 &&
    dashboard.upcomingTasks.length === 0
  );
}
