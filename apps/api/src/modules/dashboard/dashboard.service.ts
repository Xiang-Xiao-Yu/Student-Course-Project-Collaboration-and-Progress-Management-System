import { Injectable } from '@nestjs/common';

import { addDays, businessDayKey } from '../../common/time/business-calendar';
import { ProjectAccessService } from '../projects/project-access.service';
import { TASK_STATUSES, type TaskPriority, type TaskStatus } from '../tasks/task.constants';
import { AvatarStorageService } from '../users/avatar-storage.service';
import { buildDashboardChartData } from './dashboard-analytics';
import type {
  DashboardActivityItem,
  DashboardResponse,
  DashboardUpcomingTaskItem,
} from './interfaces/dashboard-response';
import { DashboardRepository, type DashboardTaskRecord } from './repositories/dashboard.repository';

const UPCOMING_TASK_DAYS = 7;

function ratio(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 10000) / 10000;
}

function parseActivityValue(value: string | null): unknown {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly projectAccessService: ProjectAccessService,
    private readonly avatarStorage: AvatarStorageService,
  ) {}

  async getDashboard(userId: string, projectId: string): Promise<DashboardResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'DASHBOARD_VIEW',
    );
    const snapshot = await this.dashboardRepository.getSnapshot(projectId);
    const now = new Date();
    const todayKey = businessDayKey(now);
    const completedTasks = snapshot.tasks.filter((task) => task.status === 'COMPLETED').length;
    const completedRequirements = snapshot.requirements.filter(
      (requirement) => requirement.status === 'COMPLETED',
    ).length;
    const taskCompletionRate = ratio(completedTasks, snapshot.tasks.length);
    const requirementCompletionRate = ratio(completedRequirements, snapshot.requirements.length);

    const taskStatusCounts = new Map<TaskStatus, number>(
      TASK_STATUSES.map((status) => [status, 0]),
    );
    const memberStats = new Map<
      string,
      {
        blockedTasks: number;
        completedTasks: number;
        inProgressTasks: number;
        overdueTasks: number;
        totalTasks: number;
      }
    >(
      snapshot.members.map((member) => [
        member.user.id,
        {
          blockedTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          overdueTasks: 0,
          totalTasks: 0,
        },
      ]),
    );
    let overdueTaskCount = 0;

    for (const task of snapshot.tasks) {
      const status = task.status as TaskStatus;
      taskStatusCounts.set(status, (taskStatusCounts.get(status) ?? 0) + 1);
      const overdue = this.isOverdue(task, todayKey);
      if (overdue) {
        overdueTaskCount += 1;
      }
      if (task.assigneeId) {
        const stats = memberStats.get(task.assigneeId);
        if (stats) {
          stats.totalTasks += 1;
          if (status === 'BLOCKED') stats.blockedTasks += 1;
          if (status === 'COMPLETED') stats.completedTasks += 1;
          if (status === 'IN_PROGRESS') stats.inProgressTasks += 1;
          if (overdue) stats.overdueTasks += 1;
        }
      }
    }

    const memberTaskDistribution = await Promise.all(
      snapshot.members.map(async (member) => {
        const stats = memberStats.get(member.user.id) ?? {
          blockedTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          overdueTasks: 0,
          totalTasks: 0,
        };

        return {
          avatarUrl: await this.avatarStorage.toDataUrl(member.user.id, member.user.avatarUrl),
          ...stats,
          nickname: member.user.nickname,
          userId: member.user.id,
          username: member.user.username,
        };
      }),
    );

    const iterationStats = new Map<string, { completedTasks: number; totalTasks: number }>();
    for (const task of snapshot.tasks) {
      if (!task.iterationId) {
        continue;
      }

      const stats = iterationStats.get(task.iterationId) ?? {
        completedTasks: 0,
        totalTasks: 0,
      };
      stats.totalTasks += 1;
      if (task.status === 'COMPLETED') {
        stats.completedTasks += 1;
      }
      iterationStats.set(task.iterationId, stats);
    }

    const iterationCompletion = snapshot.iterations.map((iteration) => {
      const stats = iterationStats.get(iteration.id) ?? { completedTasks: 0, totalTasks: 0 };

      return {
        completedTasks: stats.completedTasks,
        completionRate: ratio(stats.completedTasks, stats.totalTasks),
        id: iteration.id,
        name: iteration.name,
        status: iteration.status,
        totalTasks: stats.totalTasks,
      };
    });

    const upcomingEndKey = businessDayKey(addDays(now, UPCOMING_TASK_DAYS));
    const upcomingTasks: DashboardUpcomingTaskItem[] = snapshot.tasks
      .filter((task) => {
        if (!task.dueDate || task.status === 'COMPLETED') {
          return false;
        }

        const dueDay = businessDayKey(task.dueDate);
        return dueDay >= todayKey && dueDay <= upcomingEndKey;
      })
      .sort((left, right) => (left.dueDate?.getTime() ?? 0) - (right.dueDate?.getTime() ?? 0))
      .slice(0, 10)
      .map((task) => ({
        assignee: task.assignee,
        dueDate: task.dueDate?.toISOString() ?? '',
        id: task.id,
        priority: task.priority as TaskPriority,
        status: task.status as TaskStatus,
        title: task.title,
      }));

    const recentActivities: DashboardActivityItem[] = snapshot.activities.map((activity) => ({
      action: activity.action,
      actor: activity.actor,
      afterValue: parseActivityValue(activity.afterValue),
      beforeValue: parseActivityValue(activity.beforeValue),
      createdAt: activity.createdAt.toISOString(),
      id: activity.id,
      targetId: activity.targetId,
      targetType: activity.targetType,
    }));
    const chartData = buildDashboardChartData(
      snapshot.tasks,
      snapshot.taskStatusEvents,
      access.project.startDate,
      access.project.endDate,
      now,
    );

    return {
      asOf: now.toISOString(),
      burndown: chartData.burndown,
      completionTrend: chartData.completionTrend,
      iterationCompletion,
      memberTaskDistribution,
      project: {
        endDate: access.project.endDate?.toISOString() ?? null,
        id: access.project.id,
        name: access.project.name,
        requirementCompletionRate,
        startDate: access.project.startDate?.toISOString() ?? null,
        status: access.project.status,
        taskCompletionRate,
      },
      recentActivities,
      summary: {
        blockedTasks: taskStatusCounts.get('BLOCKED') ?? 0,
        completedRequirements,
        completedTasks,
        inProgressTasks: taskStatusCounts.get('IN_PROGRESS') ?? 0,
        overdueTasks: overdueTaskCount,
        pendingReviewTasks: taskStatusCounts.get('PENDING_REVIEW') ?? 0,
        requirementCompletionRate,
        taskCompletionRate,
        totalRequirements: snapshot.requirements.length,
        totalTasks: snapshot.tasks.length,
      },
      taskStatusDistribution: TASK_STATUSES.map((status) => ({
        count: taskStatusCounts.get(status) ?? 0,
        status,
      })),
      upcomingTaskDays: UPCOMING_TASK_DAYS,
      upcomingTasks,
    };
  }

  private isOverdue(task: DashboardTaskRecord, todayKey: string): boolean {
    return (
      task.status !== 'COMPLETED' &&
      task.dueDate !== null &&
      businessDayKey(task.dueDate) < todayKey
    );
  }
}
