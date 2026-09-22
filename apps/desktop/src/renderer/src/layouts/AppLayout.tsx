import { useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';

import { buildProjectPath, navigationGroups } from '../app/navigation';
import { useSession } from '../features/auth/session';

function getProjectLabel(projectId: string): string {
  return projectId === 'demo-project' ? '示例项目' : projectId;
}

export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { projectId = 'demo-project' } = useParams<{ projectId: string }>();
  const projectLabel = getProjectLabel(projectId);
  const { session, signOut } = useSession();

  return (
    <div className={`app-shell${isMenuOpen ? ' sidebar-open' : ''}`}>
      <aside className="sidebar" id="app-sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            课
          </span>
          <div>
            <strong>课程项目协作台</strong>
            <span>协作与进度管理</span>
          </div>
        </div>

        <div className="workspace-card">
          <span>当前项目</span>
          <strong>{projectLabel}</strong>
        </div>

        <nav className="sidebar-nav" aria-label="项目导航">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group__label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                  key={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  to={buildProjectPath(projectId, item.path)}
                >
                  <span className="nav-link__marker" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-note">
          <span>工作模式</span>
          <strong>本机桌面端</strong>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar__start">
            <button
              aria-controls="app-sidebar"
              aria-expanded={isMenuOpen}
              aria-label="打开导航"
              className="menu-toggle"
              onClick={() => setIsMenuOpen(true)}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>

            <div className="breadcrumb">
              <span>项目工作区</span>
              <strong>{projectLabel}</strong>
            </div>
          </div>

          <div className="topbar__account">
            <div className="user-chip">
              <span className="user-chip__avatar" aria-hidden="true">
                {session?.user.displayName.slice(0, 1) ?? '项'}
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
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <button
        aria-label="关闭导航"
        className="sidebar-scrim"
        onClick={() => setIsMenuOpen(false)}
        type="button"
      />
    </div>
  );
}
