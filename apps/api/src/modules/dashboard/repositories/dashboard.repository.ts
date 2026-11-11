import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

const dashboardUserSelect = {
  id: true,
  nickname: true,
  username: true,
} satisfies Prisma.UserSelect;

const dashboardTaskSelect = {
  assignee: { select: dashboardUserSelect },
  assigneeId: true,
  completedAt: true,
  createdAt: true,
  dueDate: true,
  id: true,
  iterationId: true,
  priority: true,
  status: true,
  title: true,
} satisfies Prisma.TaskSelect;

const dashboardActivitySelect = {
  action: true,
  actor: { select: dashboardUserSelect },
  afterValue: true,
  beforeValue: true,
  createdAt: true,
  id: true,
  targetId: true,
  targetType: true,
} satisfies Prisma.ActivityLogSelect;

type DashboardTaskRow = Prisma.TaskGetPayload<{ select: typeof dashboardTaskSelect }>;
type DashboardActivityRow = Prisma.ActivityLogGetPayload<{
  select: typeof dashboardActivitySelect;
}>;

export interface DashboardTaskRecord {
  assignee: {
    id: string;
    nickname: string;
    username: string;
  } | null;
  assigneeId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  dueDate: Date | null;
  id: string;
  iterationId: string | null;
  priority: string;
  status: string;
  title: string;
}

export interface DashboardMemberRecord {
  role: string;
  user: {
    avatarUrl: string | null;
    id: string;
    nickname: string;
    username: string;
  };
}

export interface DashboardRequirementRecord {
  status: string;
}

export interface DashboardIterationRecord {
  id: string;
  name: string;
  status: string;
}

export interface DashboardTaskStatusEventRecord {
  afterValue: string | null;
  beforeValue: string | null;
  createdAt: Date;
  targetId: string;
}

export interface DashboardActivityRecord {
  action: string;
  actor: {
    id: string;
    nickname: string;
    username: string;
  } | null;
  afterValue: string | null;
  beforeValue: string | null;
  createdAt: Date;
  id: string;
  targetId: string;
  targetType: string;
}

export interface DashboardSnapshot {
  activities: DashboardActivityRecord[];
  iterations: DashboardIterationRecord[];
  members: DashboardMemberRecord[];
  requirements: DashboardRequirementRecord[];
  tasks: DashboardTaskRecord[];
  taskStatusEvents: DashboardTaskStatusEventRecord[];
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(projectId: string): Promise<DashboardSnapshot> {
    const [tasks, requirements, iterations, members, activities, taskStatusEvents] =
      await this.prisma.$transaction([
        this.prisma.task.findMany({
          orderBy: [{ createdAt: 'asc' }],
          select: dashboardTaskSelect,
          where: { projectId },
        }),
        this.prisma.requirement.findMany({
          select: { status: true },
          where: { projectId },
        }),
        this.prisma.iteration.findMany({
          orderBy: [{ startDate: 'asc' }],
          select: {
            id: true,
            name: true,
            status: true,
          },
          where: { projectId },
        }),
        this.prisma.projectMember.findMany({
          orderBy: [{ joinedAt: 'asc' }],
          select: {
            role: true,
            user: {
              select: {
                avatarUrl: true,
                id: true,
                nickname: true,
                username: true,
              },
            },
          },
          where: { projectId },
        }),
        this.prisma.activityLog.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: dashboardActivitySelect,
          take: 10,
          where: { projectId },
        }),
        this.prisma.activityLog.findMany({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            afterValue: true,
            beforeValue: true,
            createdAt: true,
            targetId: true,
          },
          where: {
            action: 'TASK_STATUS_CHANGED',
            projectId,
            targetType: 'TASK',
          },
        }),
      ]);

    return {
      activities: activities.map((activity) => this.toActivity(activity)),
      iterations,
      members,
      requirements,
      tasks: tasks.map((task) => this.toTask(task)),
      taskStatusEvents,
    };
  }

  private toActivity(activity: DashboardActivityRow): DashboardActivityRecord {
    return {
      action: activity.action,
      actor: activity.actor,
      afterValue: activity.afterValue,
      beforeValue: activity.beforeValue,
      createdAt: activity.createdAt,
      id: activity.id,
      targetId: activity.targetId,
      targetType: activity.targetType,
    };
  }

  private toTask(task: DashboardTaskRow): DashboardTaskRecord {
    return task;
  }
}
