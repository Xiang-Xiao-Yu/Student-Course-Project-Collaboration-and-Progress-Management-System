import { useEffect, useState } from 'react';

import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/PageHeader';
import type { UserProfileDto } from '../features/auth/auth-api';
import { getCurrentUserProfile } from '../features/auth/auth-api';
import { useSession } from '../features/auth/session';
import { getUserFacingError } from '../lib/api/errors';

type ProfileState =
  | { readonly status: 'loading' }
  | { readonly profile: UserProfileDto; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ProfilePage() {
  const { api } = useSession();
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  useEffect(() => {
    let isCancelled = false;

    setState({ status: 'loading' });
    void getCurrentUserProfile(api)
      .then((profile) => {
        if (!isCancelled) {
          setState({ profile, status: 'ready' });
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
        <PageHeader title="个人资料" description="查看当前账号的基本信息。" />
        <LoadingState label="正在加载个人资料" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="个人资料" description="查看当前账号的基本信息。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="个人资料加载失败"
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader title="个人资料" description="查看当前账号的基本信息。" />
      <section className="panel profile-panel">
        <dl className="profile-list">
          <div>
            <dt>用户名</dt>
            <dd>{state.profile.username}</dd>
          </div>
          <div>
            <dt>昵称</dt>
            <dd>{state.profile.nickname}</dd>
          </div>
          <div>
            <dt>账号状态</dt>
            <dd>{state.profile.status === 'ACTIVE' ? '正常' : '已禁用'}</dd>
          </div>
          <div>
            <dt>注册时间</dt>
            <dd>{formatDate(state.profile.createdAt)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
