import type { TaskPriority, TaskStatus } from '../../tasks/task.constants';

export interface DashboardProjectResponse {
  endDate: string | null;
  id: string;
  name: string;
  requirementCompletionRate: number;
  startDate: string | null;
  status: string;
  taskCompletionRate: number;
}

export interface DashboardSummaryResponse {
  blockedTasks: number;
  completedRequirements: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  pendingReviewTasks: number;
  requirementCompletionRate: number;
  taskCompletionRate: number;
  totalRequirements: number;
  totalTasks: number;
}

export interface DashboardTaskStatusDistributionItem {
  count: number;
  status: TaskStatus;
}

export interface DashboardMemberTaskItem {
  avatarUrl: string | null;
  blockedTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  nickname: string;
  overdueTasks: number;
  totalTasks: number;
  userId: string;
  username: string;
}

export interface DashboardIterationCompletionItem {
  completedTasks: number;
  completionRate: number;
  id: string;
  name: string;
  status: string;
  totalTasks: number;
}

export interface DashboardActivityItem {
  action: string;
  actor: {
    id: string;
    nickname: string;
    username: string;
  } | null;
  afterValue: unknown;
  beforeValue: unknown;
  createdAt: string;
  id: string;
  targetId: string;
  targetType: string;
}

export interface DashboardUpcomingTaskItem {
  assignee: {
    id: string;
    nickname: string;
    username: string;
  } | null;
  dueDate: string;
  id: string;
  priority: TaskPriority;
  status: TaskStatus;
  title: string;
}

export interface DashboardCompletionTrendPoint {
  completed: number;
  cumulativeCompleted: number;
  date: string;
}

export interface DashboardBurndownPoint {
  completedTasks: number;
  date: string;
  idealRemainingTasks: number;
  remainingTasks: number;
}

export interface DashboardResponse {
  asOf: string;
  burndown: DashboardBurndownPoint[];
  completionTrend: DashboardCompletionTrendPoint[];
  iterationCompletion: DashboardIterationCompletionItem[];
  memberTaskDistribution: DashboardMemberTaskItem[];
  project: DashboardProjectResponse;
  recentActivities: DashboardActivityItem[];
  summary: DashboardSummaryResponse;
  taskStatusDistribution: DashboardTaskStatusDistributionItem[];
  upcomingTaskDays: number;
  upcomingTasks: DashboardUpcomingTaskItem[];
}
