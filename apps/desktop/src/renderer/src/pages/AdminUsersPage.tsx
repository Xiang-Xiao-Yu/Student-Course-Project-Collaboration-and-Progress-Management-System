import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import { disableUser, listAdminUsers } from '../features/users/admin-user-api';
import type { AdminUserDto } from '../features/users/admin-user-api';
import { getUserFacingError } from '../lib/api/errors';

type State =
  | { actorId: string; status: 'loading' }
  | { actorId: string; status: 'ready'; users: AdminUserDto[] }
  | { actorId: string; status: 'error'; message: string };

export function AdminUserRows({
  users,
  pending,
  onDisable,
}: {
  readonly users: readonly AdminUserDto[];
  readonly pending: boolean;
  readonly onDisable: (user: AdminUserDto) => void;
}) {
  return (
    <div className="admin-user-list">
      {users.map((user) => (
        <article className="admin-user-row" key={user.id}>
          <div>
            <strong>{user.nickname}</strong>
            <span>@{user.username}</span>
          </div>
          <span>{user.isPlatformAdmin ? '平台管理员' : '普通用户'}</span>
          <span>{user.status === 'DISABLED' ? '已禁用' : '正常'}</span>
          {user.isPlatformAdmin ? (
            <span>管理员账号受保护</span>
          ) : user.status === 'ACTIVE' ? (
            <button
              className="danger-button"
              disabled={pending}
              onClick={() => onDisable(user)}
              type="button"
            >
              禁用用户
            </button>
          ) : (
            <span>无法登录和访问项目</span>
          )}
        </article>
      ))}
    </div>
  );
}

export function AdminUsersPage() {
  const { api, session } = useSession();
  const actorId = session?.user.id ?? '';
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<State>({ actorId, status: 'loading' });
  const [selected, setSelected] = useState<{ actorId: string; user: AdminUserDto } | null>(null);
  const [pendingActor, setPendingActor] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ actorId: string; text: string; error: boolean } | null>(
    null,
  );
  const pending = pendingActor === actorId;
  const target = selected?.actorId === actorId ? selected.user : null;
  const currentNotice = notice?.actorId === actorId ? notice : null;

  useEffect(() => {
    let cancelled = false;
    setState({ actorId, status: 'loading' });
    setSelected(null);
    setNotice(null);
    void listAdminUsers(api)
      .then((users) => {
        if (!cancelled) setState({ actorId, status: 'ready', users });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ actorId, status: 'error', message: getUserFacingError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [api, actorId, retry]);

  async function confirmDisable() {
    if (!target || pending) return;
    setPendingActor(actorId);
    setNotice(null);
    try {
      const updated = await disableUser(api, target);
      setState((current) =>
        current.actorId === actorId && current.status === 'ready'
          ? {
              ...current,
              users: current.users.map((user) => (user.id === updated.id ? updated : user)),
            }
          : current,
      );
      setSelected((current) => (current?.actorId === actorId ? null : current));
      setNotice({ actorId, text: `用户 @${updated.username} 已禁用。`, error: false });
    } catch (error: unknown) {
      setNotice({ actorId, text: getUserFacingError(error), error: true });
    } finally {
      setPendingActor((current) => (current === actorId ? null : current));
    }
  }

  if (state.actorId !== actorId || state.status === 'loading')
    return <LoadingState label="正在加载用户列表" />;
  if (state.status === 'error')
    return (
      <ErrorState
        title="无法管理用户"
        message={state.message}
        actionLabel="重试"
        onAction={() => setRetry((value) => value + 1)}
      />
    );
  return (
    <div className="page-stack">
      <PageHeader
        title="用户管理"
        description="平台管理员可以禁用普通用户，禁用后历史项目资料仍然保留。"
      />
      {currentNotice ? (
        currentNotice.error ? (
          <ErrorNotice message={currentNotice.text} />
        ) : (
          <div className="success-notice">{currentNotice.text}</div>
        )
      ) : null}
      <section className="panel">
        <div className="panel__header">
          <h2>用户列表</h2>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => setRetry((value) => value + 1)}
            type="button"
          >
            刷新列表
          </button>
        </div>
        <AdminUserRows
          users={state.users}
          pending={pending}
          onDisable={(user) => {
            setNotice(null);
            setSelected({ actorId, user });
          }}
        />
      </section>
      {target ? (
        <ConfirmDialog
          title="禁用用户"
          confirmLabel="确认禁用"
          tone="danger"
          isPending={pending}
          message={`确认禁用 ${target.nickname}（@${target.username}）？禁用后将无法登录，已有会话立即失效，历史数据保留。${currentNotice?.error ? ` ${currentNotice.text}` : ''}`}
          onCancel={() => {
            setSelected(null);
            setNotice(null);
          }}
          onConfirm={() => void confirmDisable()}
        />
      ) : null}
    </div>
  );
}
