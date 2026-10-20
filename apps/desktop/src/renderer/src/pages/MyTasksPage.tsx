import { useEffect, useState } from 'react';

import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/PageHeader';
import type { UserTaskDto } from '../features/auth/auth-api';
import { getCurrentUserTasks } from '../features/auth/auth-api';
import { useSession } from '../features/auth/session';
import { getTaskPriorityLabel, getTaskStatusLabel } from '../features/tasks/task-presentation';
import { getUserFacingError } from '../lib/api/errors';

type TasksState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly tasks: UserTaskDto[] }
  | { readonly message: string; readonly status: 'error' };

function formatDate(value: string | null): string {
  if (!value) {
    return '未设置';
  }

  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}

export function MyTasksPage() {
  const { api } = useSession();
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<TasksState>({ status: 'loading' });

  useEffect(() => {
    let isCancelled = false;

    setState({ status: 'loading' });
    void getCurrentUserTasks(api)
      .then((tasks) => {
        if (!isCancelled) {
          setState({ status: 'ready', tasks });
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
  }, [api, retryVersion]);

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="我的任务" description="查看当前账号负责的任务。" />
        <LoadingState label="正在加载个人任务" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="我的任务" description="查看当前账号负责的任务。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="个人任务加载失败"
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader title="我的任务" description="查看当前账号负责的任务。" />
      {state.tasks.length === 0 ? (
        <section className="panel panel--large">
          <EmptyState title="暂无负责任务" description="任务分配后会显示在这里。" />
        </section>
      ) : (
        <section className="task-list" aria-label="个人任务列表">
          {state.tasks.map((task) => (
            <article className="task-row" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.projectName}</span>
              </div>
              <div className="task-row__meta">
                <span className="tag">{getTaskStatusLabel(task.status)}</span>
                <span>优先级：{getTaskPriorityLabel(task.priority)}</span>
                <span>截止：{formatDate(task.dueDate)}</span>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
