import { Injectable } from '@nestjs/common';

import { createCsv } from '../../common/export/csv';
import { ProjectAccessService } from '../projects/project-access.service';
import { DashboardService } from './dashboard.service';

const PROJECT_STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: '进行中',
  ARCHIVED: '已归档',
  COMPLETED: '已完成',
  PAUSED: '已暂停',
  PLANNING: '规划中',
};

function percentage(value: number): string {
  return `${Math.round(value * 10000) / 100}%`;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async exportProgressReport(
    userId: string,
    projectId: string,
  ): Promise<{ content: string; filename: string }> {
    await this.projectAccessService.requirePermission(projectId, userId, 'REPORT_EXPORT');
    const dashboard = await this.dashboardService.getDashboard(userId, projectId);
    const rows: unknown[][] = [
      ['项目进度报告'],
      ['生成时间', dashboard.asOf],
      ['项目', dashboard.project.name],
      ['项目状态', PROJECT_STATUS_LABELS[dashboard.project.status] ?? dashboard.project.status],
      ['开始日期', dashboard.project.startDate ?? ''],
      ['结束日期', dashboard.project.endDate ?? ''],
      ['任务完成率', percentage(dashboard.project.taskCompletionRate)],
      ['需求完成率', percentage(dashboard.project.requirementCompletionRate)],
      [],
      ['任务概况'],
      ['任务总数', dashboard.summary.totalTasks],
      ['已完成任务', dashboard.summary.completedTasks],
      ['进行中任务', dashboard.summary.inProgressTasks],
      ['待审核任务', dashboard.summary.pendingReviewTasks],
      ['已阻塞任务', dashboard.summary.blockedTasks],
      ['逾期任务', dashboard.summary.overdueTasks],
      ['需求总数', dashboard.summary.totalRequirements],
      ['已完成需求', dashboard.summary.completedRequirements],
      [],
      ['任务状态分布'],
      ['状态', '数量'],
      ...dashboard.taskStatusDistribution.map((item) => [item.status, item.count]),
      [],
      ['成员任务分布'],
      ['成员', '任务总数', '已完成', '进行中', '阻塞', '逾期'],
      ...dashboard.memberTaskDistribution.map((item) => [
        `${item.nickname} (@${item.username})`,
        item.totalTasks,
        item.completedTasks,
        item.inProgressTasks,
        item.blockedTasks,
        item.overdueTasks,
      ]),
      [],
      ['迭代完成率'],
      ['迭代', '状态', '任务总数', '已完成', '完成率'],
      ...dashboard.iterationCompletion.map((item) => [
        item.name,
        item.status,
        item.totalTasks,
        item.completedTasks,
        percentage(item.completionRate),
      ]),
      [],
      ['近期操作'],
      ['时间', '操作', '对象类型', '对象 ID', '操作人'],
      ...dashboard.recentActivities.map((item) => [
        item.createdAt,
        item.action,
        item.targetType,
        item.targetId,
        item.actor ? `${item.actor.nickname} (@${item.actor.username})` : '系统',
      ]),
    ];

    return {
      content: createCsv(rows),
      filename: `progress-${projectId}.csv`,
    };
  }
}
