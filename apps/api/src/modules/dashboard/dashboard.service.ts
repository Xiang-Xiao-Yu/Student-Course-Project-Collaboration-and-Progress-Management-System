import { Injectable } from '@nestjs/common';

import { ProjectAccessService } from '../projects/project-access.service';
import { TASK_STATUSES, type TaskPriority, type TaskStatus } from '../tasks/task.constants';
import { AvatarStorageService } from '../users/avatar-storage.service';
import type {
  DashboardActivityItem,
  DashboardBurndownPoint,
  DashboardCompletionTrendPoint,
  DashboardResponse,
  DashboardUpcomingTaskItem,
} from './interfaces/dashboard-response';
import { DashboardRepository, type DashboardTaskRecord } from './repositories/dashboard.repository';

const DASHBOARD_TIME_ZONE = 'Asia/Shanghai';
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const COMPLETION_TREND_DAYS = 14;
const UPCOMING_TASK_DAYS = 7;

function calendarDayKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(value);

  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MILLISECONDS);
}

function dayKeyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

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
    const todayKey = calendarDayKey(now);
    const completedTasks = snapshot.tasks.filter((task) => task.status === 'COMPLETED').length;
    const completedRequirements = snapshot.requirements.filter(
      (requirement) => requirement.status === 'COMPLETED',
    ).length;
    const taskCompletionRate = ratio(completedTasks, snapshot.tasks.length);
    const requirementCompletionRate = ratio(completedRequirements, snapshot.requirements.length);

    const taskStatusCounts = new Map<TaskStatus, number>(
      TASK_STATUSES.map((status) => [status, 0]),
    );
    for (const task of snapshot.tasks) {
      const status = task.status as TaskStatus;
      taskStatusCounts.set(status, (taskStatusCounts.get(status) ?? 0) + 1);
    }

    const memberTaskDistribution = await Promise.all(
      snapshot.members.map(async (member) => {
        const memberTasks = snapshot.tasks.filter((task) => task.assigneeId === member.user.id);

        return {
          avatarUrl: await this.avatarStorage.toDataUrl(member.user.id, member.user.avatarUrl),
          blockedTasks: memberTasks.filter((task) => task.status === 'BLOCKED').length,
          completedTasks: memberTasks.filter((task) => task.status === 'COMPLETED').length,
          inProgressTasks: memberTasks.filter((task) => task.status === 'IN_PROGRESS').length,
          nickname: member.user.nickname,
          overdueTasks: memberTasks.filter((task) => this.isOverdue(task, todayKey)).length,
          totalTasks: memberTasks.length,
          userId: member.user.id,
          username: member.user.username,
        };
      }),
    );

    const iterationCompletion = snapshot.iterations.map((iteration) => {
      const iterationCompletedTasks = iteration.tasks.filter(
        (task) => task.status === 'COMPLETED',
      ).length;

      return {
        completedTasks: iterationCompletedTasks,
        completionRate: ratio(iterationCompletedTasks, iteration.tasks.length),
        id: iteration.id,
        name: iteration.name,
        status: iteration.status,
        totalTasks: iteration.tasks.length,
      };
    });

    const upcomingEndKey = calendarDayKey(addDays(now, UPCOMING_TASK_DAYS));
    const upcomingTasks: DashboardUpcomingTaskItem[] = snapshot.tasks
      .filter((task) => {
        if (!task.dueDate || task.status === 'COMPLETED') {
          return false;
        }

        const dueDay = calendarDayKey(task.dueDate);
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

    return {
      asOf: now.toISOString(),
      burndown: this.buildBurndown(
        snapshot.tasks,
        access.project.startDate,
        access.project.endDate,
        now,
      ),
      completionTrend: this.buildCompletionTrend(snapshot.tasks, now),
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
        overdueTasks: snapshot.tasks.filter((task) => this.isOverdue(task, todayKey)).length,
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

  private buildCompletionTrend(
    tasks: DashboardTaskRecord[],
    now: Date,
  ): DashboardCompletionTrendPoint[] {
    const completedTasks = tasks.filter((task) => task.completedAt !== null);
    const start = addDays(now, -(COMPLETION_TREND_DAYS - 1));
    const points: DashboardCompletionTrendPoint[] = [];

    for (let index = 0; index < COMPLETION_TREND_DAYS; index += 1) {
      const day = calendarDayKey(addDays(start, index));
      const completed = completedTasks.filter(
        (task) => task.completedAt && calendarDayKey(task.completedAt) === day,
      ).length;
      const cumulativeCompleted = completedTasks.filter(
        (task) => task.completedAt && calendarDayKey(task.completedAt) <= day,
      ).length;

      points.push({ completed, cumulativeCompleted, date: day });
    }

    return points;
  }

  private buildBurndown(
    tasks: DashboardTaskRecord[],
    projectStartDate: Date | null,
    projectEndDate: Date | null,
    now: Date,
  ): DashboardBurndownPoint[] {
    const startDate =
      projectStartDate ??
      tasks.reduce<Date | null>(
        (earliest, task) =>
          earliest === null || task.createdAt < earliest ? task.createdAt : earliest,
        null,
      ) ??
      addDays(now, -(COMPLETION_TREND_DAYS - 1));
    const plannedEndDate = projectEndDate ?? addDays(now, UPCOMING_TASK_DAYS);
    const outputEndDate = plannedEndDate < now ? plannedEndDate : now;
    const outputStartDate = startDate > outputEndDate ? outputEndDate : startDate;
    const startKey = calendarDayKey(outputStartDate);
    const outputEndKey = calendarDayKey(outputEndDate);
    const durationDays = Math.max(
      1,
      Math.round(
        (dayKeyToDate(calendarDayKey(plannedEndDate)).getTime() -
          dayKeyToDate(startKey).getTime()) /
          DAY_MILLISECONDS,
      ),
    );
    const points: DashboardBurndownPoint[] = [];
    let current = dayKeyToDate(startKey);

    for (let index = 0; index < 366; index += 1) {
      const day = calendarDayKey(current);
      const completedTasks = tasks.filter(
        (task) => task.completedAt && calendarDayKey(task.completedAt) === day,
      ).length;
      const remainingTasks = tasks.filter((task) => {
        if (calendarDayKey(task.createdAt) > day) {
          return false;
        }

        return task.completedAt === null || calendarDayKey(task.completedAt) > day;
      }).length;
      const idealRemainingTasks =
        Math.round(tasks.length * (1 - Math.min(1, index / Math.max(1, durationDays))) * 100) / 100;

      points.push({
        completedTasks,
        date: day,
        idealRemainingTasks: Math.max(0, idealRemainingTasks),
        remainingTasks,
      });

      if (day >= outputEndKey) {
        break;
      }

      current = addDays(current, 1);
    }

    return points;
  }

  private isOverdue(task: DashboardTaskRecord, todayKey: string): boolean {
    return (
      task.status !== 'COMPLETED' &&
      task.dueDate !== null &&
      calendarDayKey(task.dueDate) < todayKey
    );
  }
}
