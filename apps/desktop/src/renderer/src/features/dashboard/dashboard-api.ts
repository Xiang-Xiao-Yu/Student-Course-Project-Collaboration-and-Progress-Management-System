import type { ApiClient, ApiDownload } from '../../lib/api/client';
import type { TaskPriority, TaskStatus } from '../tasks/task-api';

export interface DashboardProject {
  readonly endDate: string | null;
  readonly id: string;
  readonly name: string;
  readonly requirementCompletionRate: number;
  readonly startDate: string | null;
  readonly status: string;
  readonly taskCompletionRate: number;
}

export interface DashboardSummary {
  readonly blockedTasks: number;
  readonly completedRequirements: number;
  readonly completedTasks: number;
  readonly inProgressTasks: number;
  readonly overdueTasks: number;
  readonly pendingReviewTasks: number;
  readonly requirementCompletionRate: number;
  readonly taskCompletionRate: number;
  readonly totalRequirements: number;
  readonly totalTasks: number;
}

export interface DashboardTaskStatusItem {
  readonly count: number;
  readonly status: TaskStatus;
}

export interface DashboardMemberTaskItem {
  readonly avatarUrl: string | null;
  readonly blockedTasks: number;
  readonly completedTasks: number;
  readonly inProgressTasks: number;
  readonly nickname: string;
  readonly overdueTasks: number;
  readonly totalTasks: number;
  readonly userId: string;
  readonly username: string;
}

export interface DashboardIterationItem {
  readonly completedTasks: number;
  readonly completionRate: number;
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly totalTasks: number;
}

export interface DashboardActivityItem {
  readonly action: string;
  readonly actor: {
    readonly id: string;
    readonly nickname: string;
    readonly username: string;
  } | null;
  readonly afterValue: unknown;
  readonly beforeValue: unknown;
  readonly createdAt: string;
  readonly id: string;
  readonly targetId: string;
  readonly targetType: string;
}

export interface DashboardUpcomingTaskItem {
  readonly assignee: {
    readonly id: string;
    readonly nickname: string;
    readonly username: string;
  } | null;
  readonly dueDate: string;
  readonly id: string;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly title: string;
}

export interface DashboardCompletionTrendPoint {
  readonly completed: number;
  readonly cumulativeCompleted: number;
  readonly date: string;
}

export interface DashboardBurndownPoint {
  readonly completedTasks: number;
  readonly date: string;
  readonly idealRemainingTasks: number;
  readonly remainingTasks: number;
}

export interface ProjectDashboard {
  readonly asOf: string;
  readonly burndown: DashboardBurndownPoint[];
  readonly completionTrend: DashboardCompletionTrendPoint[];
  readonly iterationCompletion: DashboardIterationItem[];
  readonly memberTaskDistribution: DashboardMemberTaskItem[];
  readonly project: DashboardProject;
  readonly recentActivities: DashboardActivityItem[];
  readonly summary: DashboardSummary;
  readonly taskStatusDistribution: DashboardTaskStatusItem[];
  readonly upcomingTaskDays: number;
  readonly upcomingTasks: DashboardUpcomingTaskItem[];
}

function projectDashboardPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/dashboard`;
}

export function getProjectDashboard(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
): Promise<ProjectDashboard> {
  return api.get<ProjectDashboard>(projectDashboardPath(projectId));
}

export function exportProjectProgressReport(
  api: Pick<ApiClient, 'download'>,
  projectId: string,
): Promise<ApiDownload> {
  return api.download(`/projects/${encodeURIComponent(projectId)}/reports/progress`);
}
