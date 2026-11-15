import { Link, Outlet } from 'react-router-dom';

import { AccountControls } from './AccountControls';
import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../features/auth/session';

export function AccountLayout() {
  const { signOutError } = useSession();

  return (
    <div className="account-shell">
      <header className="account-topbar">
        <Link className="account-brand" to="/projects">
          <span className="brand-mark" aria-hidden="true">
            课
          </span>
          <span>
            <strong>课程项目协作台</strong>
          </span>
        </Link>

        <AccountControls />
      </header>

      <main className="account-content">
        {signOutError ? <ErrorNotice message={signOutError} /> : null}
        <Outlet />
      </main>
    </div>
  );
}
