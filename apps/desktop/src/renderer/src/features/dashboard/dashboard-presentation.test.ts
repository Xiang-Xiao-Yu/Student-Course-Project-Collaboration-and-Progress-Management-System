import { describe, expect, it } from 'vitest';

import type { ProjectDashboard } from './dashboard-api';
import {
  formatCompletionRate,
  getDashboardActivityLabel,
  getDashboardSectionVisibility,
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
  it('服务端实际动作及未知动作显示中文，不泄露内部动作编码', () => {
    for (const action of [
      'ACCEPTANCE_RESULT_RECORDED',
      'ITERATION_CLOSED',
      'ITERATION_DELETED',
      'ITERATION_STATUS_CHANGED',
      'MEETING_ACTION_STATUS_CHANGED',
      'PROJECT_MEMBER_ADDED',
      'PROJECT_MEMBER_REMOVED',
      'PROJECT_MEMBER_ROLE_CHANGED',
      'PROJECT_OWNER_TRANSFERRED',
      'PROJECT_STATUS_CHANGED',
      'REQUIREMENT_STATUS_CHANGED',
      'TASK_REVIEW_REJECTED',
      'TASK_REVIEW_RESUBMITTED',
      'TASK_STATUS_CHANGED',
    ]) {
      expect(getDashboardActivityLabel(action)).toMatch(/[\u4e00-\u9fff]/);
      expect(getDashboardActivityLabel(action)).not.toMatch(/[A-Z_]/);
    }
    expect(getDashboardActivityLabel('FUTURE_INTERNAL_ACTION')).toBe('更新项目记录');
  });
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

  it('任务删除后仍保留历史趋势和近期活动', () => {
    const historical = dashboard({
      burndown: [
        {
          completedTasks: 1,
          date: '2026-11-10',
          idealRemainingTasks: 1,
          remainingTasks: 0,
        },
      ],
      completionTrend: [
        {
          completed: 1,
          cumulativeCompleted: 1,
          date: '2026-11-10',
        },
      ],
      recentActivities: [
        {
          action: 'TASK_DELETED',
          actor: null,
          afterValue: null,
          beforeValue: null,
          createdAt: '2026-11-10T00:00:00.000Z',
          id: 'activity-1',
          targetId: 'task-1',
          targetType: 'TASK',
        },
      ],
    });

    expect(getDashboardSectionVisibility(historical)).toMatchObject({
      hasBurndownHistory: true,
      hasCompletionHistory: true,
      hasTaskStatus: false,
    });
    expect(isDashboardEmpty(historical)).toBe(false);
  });
});
