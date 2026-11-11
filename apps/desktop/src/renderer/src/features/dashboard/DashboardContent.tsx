import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../../components/EmptyState';
import { buildTaskPath } from '../../app/navigation';
import { formatTaskDueDate, getTaskPriorityLabel } from '../tasks/task-presentation';
import type { ProjectDashboard } from './dashboard-api';
import { DashboardChart } from './DashboardChart';
import {
  buildBurndownOption,
  buildCompletionTrendOption,
  buildIterationOption,
  buildMemberTaskOption,
  buildTaskStatusOption,
} from './dashboard-options';
import {
  formatCompletionRate,
  formatDashboardDateTime,
  getDashboardActivityLabel,
  isDashboardEmpty,
} from './dashboard-presentation';

interface DashboardContentProps {
  readonly dashboard: ProjectDashboard;
  readonly projectId: string;
}

export function DashboardContent({ dashboard, projectId }: DashboardContentProps) {
  const statusOption = useMemo(
    () => buildTaskStatusOption(dashboard.taskStatusDistribution),
    [dashboard.taskStatusDistribution],
  );
  const memberOption = useMemo(
    () => buildMemberTaskOption(dashboard.memberTaskDistribution),
    [dashboard.memberTaskDistribution],
  );
  const iterationOption = useMemo(
    () => buildIterationOption(dashboard.iterationCompletion),
    [dashboard.iterationCompletion],
  );
  const trendOption = useMemo(
    () => buildCompletionTrendOption(dashboard.completionTrend),
    [dashboard.completionTrend],
  );
  const burndownOption = useMemo(
    () => buildBurndownOption(dashboard.burndown),
    [dashboard.burndown],
  );
  const hasMemberTasks = dashboard.memberTaskDistribution.some((member) => member.totalTasks > 0);

  if (isDashboardEmpty(dashboard)) {
    return (
      <section className="panel panel--large">
        <EmptyState
          description="创建需求、任务或迭代后，项目指标、趋势和成员分布会显示在这里。"
          title="暂无项目数据"
        />
      </section>
    );
  }

  return (
    <>
      <section className="metric-grid" aria-label="项目主要指标">
        <article className="metric-card metric-card--blue">
          <span>任务总数</span>
          <strong>{dashboard.summary.totalTasks}</strong>
        </article>
        <article className="metric-card metric-card--teal">
          <span>进行中任务</span>
          <strong>{dashboard.summary.inProgressTasks}</strong>
        </article>
        <article className="metric-card metric-card--amber">
          <span>逾期任务</span>
          <strong>{dashboard.summary.overdueTasks}</strong>
        </article>
        <article className="metric-card metric-card--slate">
          <span>任务完成率</span>
          <strong>{formatCompletionRate(dashboard.summary.taskCompletionRate)}</strong>
        </article>
      </section>

      <section className="dashboard-summary-strip" aria-label="项目补充指标">
        <div>
          <span>需求完成率</span>
          <strong>{formatCompletionRate(dashboard.summary.requirementCompletionRate)}</strong>
        </div>
        <div>
          <span>待审核</span>
          <strong>{dashboard.summary.pendingReviewTasks}</strong>
        </div>
        <div>
          <span>已阻塞</span>
          <strong>{dashboard.summary.blockedTasks}</strong>
        </div>
        <div>
          <span>已完成需求</span>
          <strong>
            {dashboard.summary.completedRequirements}/{dashboard.summary.totalRequirements}
          </strong>
        </div>
      </section>

      <div className="dashboard-chart-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>任务状态分布</h2>
              <p>查看各状态的任务数量与占比。</p>
            </div>
          </div>
          <DashboardChart ariaLabel="任务状态分布图" option={statusOption} />
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>成员任务分布</h2>
              <p>对比成员的完成、进行中、阻塞和逾期任务。</p>
            </div>
          </div>
          {hasMemberTasks ? (
            <DashboardChart
              ariaLabel="成员任务分布图"
              className="dashboard-chart--tall"
              option={memberOption}
            />
          ) : (
            <EmptyState description="邀请成员并分配任务后显示统计。" title="暂无成员任务" />
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>任务完成趋势</h2>
              <p>最近 14 天的当日完成与累计完成情况。</p>
            </div>
          </div>
          <DashboardChart ariaLabel="任务完成趋势图" option={trendOption} />
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>迭代完成率</h2>
              <p>按迭代比较任务完成比例。</p>
            </div>
          </div>
          {dashboard.iterationCompletion.length > 0 ? (
            <DashboardChart ariaLabel="迭代完成率图" option={iterationOption} />
          ) : (
            <EmptyState description="创建迭代并加入任务后显示完成率。" title="暂无迭代数据" />
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>项目燃尽</h2>
            <p>比较实际剩余任务与按计划计算的理想剩余任务。</p>
          </div>
        </div>
        <DashboardChart
          ariaLabel="项目燃尽图"
          className="dashboard-chart--wide"
          option={burndownOption}
        />
      </section>

      <div className="dashboard-lower-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>即将到期</h2>
              <p>未来 {dashboard.upcomingTaskDays} 天内需要关注的任务。</p>
            </div>
          </div>
          {dashboard.upcomingTasks.length === 0 ? (
            <EmptyState description="当前没有临近截止日期的未完成任务。" title="暂无即将到期任务" />
          ) : (
            <div className="dashboard-task-list">
              {dashboard.upcomingTasks.map((task) => (
                <article className="dashboard-task-row" key={task.id}>
                  <div>
                    <Link to={buildTaskPath(projectId, task.id)}>{task.title}</Link>
                    <span>
                      {task.assignee?.nickname ?? '未分配'} · {getTaskPriorityLabel(task.priority)}
                    </span>
                  </div>
                  <time dateTime={task.dueDate}>{formatTaskDueDate(task.dueDate)}</time>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>最近动态</h2>
              <p>项目最近发生的业务操作。</p>
            </div>
          </div>
          {dashboard.recentActivities.length === 0 ? (
            <EmptyState description="项目产生业务操作后显示最近动态。" title="暂无操作记录" />
          ) : (
            <div className="dashboard-activity-list">
              {dashboard.recentActivities.map((activity) => (
                <article className="dashboard-activity-row" key={activity.id}>
                  <span className="dashboard-activity-row__marker" aria-hidden="true" />
                  <div>
                    <strong>{getDashboardActivityLabel(activity.action)}</strong>
                    <p>
                      {activity.actor
                        ? `${activity.actor.nickname} (@${activity.actor.username})`
                        : '系统'}
                      {' · '}
                      {activity.targetType}
                    </p>
                    <time dateTime={activity.createdAt}>
                      {formatDashboardDateTime(activity.createdAt)}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
