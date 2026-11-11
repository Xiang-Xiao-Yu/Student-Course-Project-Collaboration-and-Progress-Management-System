import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { buildProjectPath } from '../app/navigation';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type { ProjectDashboard } from '../features/dashboard/dashboard-api';
import {
  exportProjectProgressReport,
  getProjectDashboard,
} from '../features/dashboard/dashboard-api';
import { DashboardContent } from '../features/dashboard/DashboardContent';
import type { ProjectDto } from '../features/projects/project-api';
import { getProject } from '../features/projects/project-api';
import { canManageProject, getProjectRoleLabel } from '../features/projects/project-presentation';
import { exportTasksCsv } from '../features/tasks/task-api';
import type { ApiDownload } from '../lib/api/client';
import { getUserFacingError } from '../lib/api/errors';
import { saveDownload } from '../lib/download';

type ReportsState =
  | { readonly status: 'loading' }
  | {
      readonly dashboard: ProjectDashboard;
      readonly project: ProjectDto;
      readonly status: 'ready';
    }
  | { readonly message: string; readonly status: 'error' };

type ExportKind = 'progress' | 'tasks';

export function ReportsPage() {
  const { api } = useSession();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<ReportsState>({ status: 'loading' });

  useEffect(() => {
    if (!projectId) {
      setState({ message: '没有可加载的项目。', status: 'error' });
      return;
    }

    let isCancelled = false;

    setState({ status: 'loading' });
    void Promise.all([getProject(api, projectId), getProjectDashboard(api, projectId)])
      .then(([project, dashboard]) => {
        if (!isCancelled) {
          setState({ dashboard, project, status: 'ready' });
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
  }, [api, projectId, retryVersion]);

  async function handleExport(kind: ExportKind, action: () => Promise<ApiDownload>): Promise<void> {
    if (exporting) {
      return;
    }

    setExporting(kind);
    setExportError(null);
    setExportMessage(null);

    try {
      const download = await action();
      saveDownload(download);
      setExportMessage(kind === 'tasks' ? '任务 CSV 已导出。' : '项目进度报告已导出。');
    } catch (error) {
      setExportError(getUserFacingError(error));
    } finally {
      setExporting(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="统计与导出" description="查看统计图表并导出项目进度。" />
        <LoadingState label="正在加载项目统计" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="统计与导出" description="查看统计图表并导出项目进度。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="统计数据加载失败"
        />
      </div>
    );
  }

  const canExport = canManageProject(state.project.accessRole);

  return (
    <div className="page-stack p6-page">
      <div className="page-heading-with-action">
        <PageHeader title="统计与导出" description="查看项目统计图表并导出基础进度资料。" />
        <Link className="secondary-link" to={buildProjectPath(state.project.id, 'board')}>
          前往任务看板
        </Link>
      </div>

      <div className="read-only-inline">
        当前角色：{getProjectRoleLabel(state.project.accessRole)}
        {!canExport ? ' · 当前角色可查看统计，导出仅项目负责人或管理员可用' : ''}
      </div>
      {exportError ? <ErrorNotice message={exportError} /> : null}
      {exportMessage ? <div className="success-notice">{exportMessage}</div> : null}

      {canExport ? (
        <section className="panel report-export-panel">
          <div className="panel__header">
            <div>
              <h2>导出项目资料</h2>
              <p>导出内容使用当前服务端数据，不包含附件或高级报表。</p>
            </div>
          </div>
          <div className="report-export-actions">
            <button
              className="secondary-button"
              disabled={exporting !== null}
              onClick={() =>
                void handleExport('tasks', () => exportTasksCsv(api, state.project.id))
              }
              type="button"
            >
              {exporting === 'tasks' ? '正在导出...' : '导出任务 CSV'}
            </button>
            <button
              className="primary-button"
              disabled={exporting !== null}
              onClick={() =>
                void handleExport('progress', () =>
                  exportProjectProgressReport(api, state.project.id),
                )
              }
              type="button"
            >
              {exporting === 'progress' ? '正在导出...' : '导出项目进度报告'}
            </button>
          </div>
        </section>
      ) : null}

      <DashboardContent dashboard={state.dashboard} projectId={state.project.id} />
    </div>
  );
}
