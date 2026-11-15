import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '../features/auth/session';
import { AdminUsersLink } from '../features/users/AdminUsersLink';

const links = [
  ['/projects', '项目中心'],
  ['/account/tasks', '我的任务'],
  ['/account/profile', '个人资料'],
] as const;

export function AccountControls() {
  const { session, avatarUrl, signOut } = useSession();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  return (
    <div className="topbar__account">
      <nav aria-label="账户导航" className="account-nav">
        {links.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `account-link${isActive ? ' is-active' : ''}`}
          >
            {label}
          </NavLink>
        ))}
        <AdminUsersLink className="account-link" />
      </nav>
      <div className="user-chip">
        <span className="user-chip__avatar">
          {avatarUrl && avatarUrl !== failedAvatarUrl ? (
            <img alt="当前账号头像" onError={() => setFailedAvatarUrl(avatarUrl)} src={avatarUrl} />
          ) : (
            <span aria-hidden="true">{session?.user.displayName.slice(0, 1) ?? '项'}</span>
          )}
        </span>
        <div>
          <strong>{session?.user.displayName ?? '项目成员'}</strong>
          <span>已登录</span>
        </div>
      </div>
      <button className="sign-out-button" onClick={() => void signOut()} type="button">
        退出
      </button>
    </div>
  );
}
