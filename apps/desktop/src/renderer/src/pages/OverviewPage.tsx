import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { buildProjectPath } from '../app/navigation';
import { useSession } from '../features/auth/session';
import type { ProjectDashboard } from '../features/dashboard/dashboard-api';
import { getProjectDashboard } from '../features/dashboard/dashboard-api';
import { DashboardContent } from '../features/dashboard/DashboardContent';
import { getUserFacingError } from '../lib/api/errors';

type OverviewState =
  | { readonly status: 'loading' }
  | { readonly dashboard: ProjectDashboard; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

export function OverviewPage() {
  const { api } = useSession();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<OverviewState>({ status: 'loading' });

  useEffect(() => {
    if (!projectId) {
      setState({ message: '没有可加载的项目。', status: 'error' });
      return;
    }

    let isCancelled = false;

    setState({ status: 'loading' });
    void getProjectDashboard(api, projectId)
      .then((dashboard) => {
        if (!isCancelled) {
          setState({ dashboard, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({ message: getUserFacingError(error), status: 'error' });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api, projectId, requestVersion]);

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="项目概览" description="查看项目整体进度和近期动态。" />
        <LoadingState label="正在加载项目统计" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="项目概览" description="查看项目整体进度和近期动态。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRequestVersion((version) => version + 1)}
          title="项目数据加载失败"
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-heading-with-action">
        <PageHeader title="项目概览" description="查看项目整体进度、风险、趋势和近期动态。" />
        <Link className="secondary-link" to={buildProjectPath(projectId, 'reports')}>
          统计与导出
        </Link>
      </div>
      <DashboardContent dashboard={state.dashboard} projectId={projectId} />
    </div>
  );
}
