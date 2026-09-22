import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';

const metrics = [
  { label: '任务总数', value: '0', tone: 'blue' },
  { label: '进行中', value: '0', tone: 'teal' },
  { label: '逾期任务', value: '0', tone: 'amber' },
  { label: '整体完成率', value: '0%', tone: 'slate' },
] as const;

export function OverviewPage() {
  return (
    <div className="page-stack">
      <PageHeader title="项目概览" description="查看项目整体进度和近期动态。" />

      <section className="metric-grid" aria-label="项目指标">
        {metrics.map((metric) => (
          <article className={`metric-card metric-card--${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>当前迭代</h2>
              <p>任务完成情况会显示在这里。</p>
            </div>
          </div>
          <EmptyState title="暂无进行中的迭代" description="创建迭代后即可查看进度和完成率。" />
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>最近动态</h2>
              <p>项目操作记录会显示在这里。</p>
            </div>
          </div>
          <EmptyState title="暂无操作记录" description="项目产生业务操作后，这里会显示最近动态。" />
        </section>
      </div>
    </div>
  );
}
