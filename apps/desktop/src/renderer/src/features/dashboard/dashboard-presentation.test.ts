import { describe, expect, it } from 'vitest';

import type { ProjectDashboard } from './dashboard-api';
import {
  formatCompletionRate,
  getDashboardActivityLabel,
  isDashboardEmpty,
} from './dashboard-presentation';

function dashboard(overrides: Partial<ProjectDashboard> = {}): ProjectDashboard {
  return {
    asOf: '2026-11-11T00:00:00.000Z',
    burndown: [],
    completionTrend: [],
    iterationCompletion: [],
    memberTaskDistribution: [],
    project: {
      endDate: null,
      id: 'project-1',
      name: '课程项目',
      requirementCompletionRate: 0,
      startDate: null,
      status: 'ACTIVE',
      taskCompletionRate: 0,
    },
    recentActivities: [],
    summary: {
      blockedTasks: 0,
      completedRequirements: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      overdueTasks: 0,
      pendingReviewTasks: 0,
      requirementCompletionRate: 0,
      taskCompletionRate: 0,
      totalRequirements: 0,
      totalTasks: 0,
    },
    taskStatusDistribution: [],
    upcomingTaskDays: 7,
    upcomingTasks: [],
    ...overrides,
  };
}

describe('P6 dashboard presentation', () => {
  it('正常场景格式化完成率并映射活动名称', () => {
    expect(formatCompletionRate(0.625)).toBe('62.5%');
    expect(getDashboardActivityLabel('TASK_STATUS_UPDATED')).toBe('更新任务状态');
  });

  it('边界场景限制异常完成率范围', () => {
    expect(formatCompletionRate(-1)).toBe('0%');
    expect(formatCompletionRate(2)).toBe('100%');
  });

  it('失败或空项目显示空仪表盘状态', () => {
    expect(isDashboardEmpty(dashboard())).toBe(true);
    expect(
      isDashboardEmpty(
        dashboard({
          summary: {
            ...dashboard().summary,
            totalTasks: 1,
          },
        }),
      ),
    ).toBe(false);
  });
});
