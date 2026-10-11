import { useEffect, useState } from 'react';

import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type { ApiHealthResult } from '../lib/api/health';
import { checkApiHealth } from '../lib/api/health';

const metrics = [
  { label: '任务总数', value: '0', tone: 'blue' },
  { label: '进行中', value: '0', tone: 'teal' },
  { label: '逾期任务', value: '0', tone: 'amber' },
  { label: '整体完成率', value: '0%', tone: 'slate' },
] as const;

type HealthPageState = ApiHealthResult | { readonly status: 'loading' };

export function OverviewPage() {
  const { api } = useSession();
  const [requestVersion, setRequestVersion] = useState(0);
  const [healthState, setHealthState] = useState<HealthPageState>({ status: 'loading' });

  useEffect(() => {
    let isCancelled = false;

    setHealthState({ status: 'loading' });
    void checkApiHealth(api).then((result) => {
      if (!isCancelled) {
        setHealthState(result);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [api, requestVersion]);

  if (healthState.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="项目概览" description="查看项目整体进度和近期动态。" />
        <LoadingState label="正在加载项目状态" />
      </div>
    );
  }

  if (healthState.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="项目概览" description="查看项目整体进度和近期动态。" />
        <ErrorState
          actionLabel="重试"
          message={healthState.message}
          onAction={() => setRequestVersion((version) => version + 1)}
          title="项目数据加载失败"
        />
      </div>
    );
  }

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
