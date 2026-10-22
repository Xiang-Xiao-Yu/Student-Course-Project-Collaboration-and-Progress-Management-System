import { Link, NavLink, Outlet } from 'react-router-dom';

import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../features/auth/session';

export function AccountLayout() {
  const { session, signOut, signOutError } = useSession();

  return (
    <div className="account-shell">
      <header className="account-topbar">
        <Link className="account-brand" to="/projects">
          <span className="brand-mark" aria-hidden="true">
            课
          </span>
          <span>
            <strong>课程项目协作台</strong>
            <small>{session?.user.displayName ?? '个人中心'}</small>
          </span>
        </Link>

        <nav aria-label="账户导航" className="account-nav">
          <NavLink
            className={({ isActive }) => `account-link${isActive ? ' is-active' : ''}`}
            to="/account/profile"
          >
            个人资料
          </NavLink>
          <NavLink
            className={({ isActive }) => `account-link${isActive ? ' is-active' : ''}`}
            to="/account/tasks"
          >
            我的任务
          </NavLink>
          <Link className="account-link" to="/projects">
            项目中心
          </Link>
        </nav>

        <button className="sign-out-button" onClick={() => void signOut()} type="button">
          退出
        </button>
      </header>

      <main className="account-content">
        {signOutError ? <ErrorNotice message={signOutError} /> : null}
        <Outlet />
      </main>
    </div>
  );
}
