import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';

import { buildProjectPath, navigationGroups } from '../app/navigation';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { useSession } from '../features/auth/session';
import type { ProjectDto } from '../features/projects/project-api';
import { getProject } from '../features/projects/project-api';
import { canManageProject, getProjectRoleLabel } from '../features/projects/project-presentation';
import { getUserFacingError } from '../lib/api/errors';

type ProjectLoadState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly project: ProjectDto; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [projectLoadState, setProjectLoadState] = useState<ProjectLoadState>({ status: 'idle' });
  const [projectRetryVersion, setProjectRetryVersion] = useState(0);
  const { projectId } = useParams<{ projectId: string }>();
  const { api, avatarUrl, session, signOut, signOutError } = useSession();

  useEffect(() => {
    if (!projectId) {
      setProjectLoadState({ status: 'idle' });
      return;
    }

    let isCancelled = false;

    setProjectLoadState({ status: 'loading' });
    void getProject(api, projectId)
      .then((nextProject) => {
        if (!isCancelled) {
          setProjectLoadState({ project: nextProject, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setProjectLoadState({
            message: getUserFacingError(error),
            status: 'error',
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api, projectId, projectRetryVersion]);

  const project = projectLoadState.status === 'ready' ? projectLoadState.project : null;
  const projectLabel =
    project?.name ??
    (projectId
      ? projectLoadState.status === 'error'
        ? '项目不可访问'
        : '项目工作区'
      : '全部项目');
  const visibleNavigationGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.managerOnly || canManageProject(project?.accessRole),
      ),
    }))
    .filter((group) => group.items.length > 0);

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
          <span>{projectId ? '当前项目' : '项目范围'}</span>
          <strong>{projectLabel}</strong>
          {projectId ? (
            <small>
              {project
                ? getProjectRoleLabel(project.accessRole)
                : projectLoadState.status === 'error'
                  ? '无法访问项目'
                  : '正在读取项目权限'}
            </small>
          ) : null}
          <Link className="workspace-card__link" to="/projects">
            {projectId ? '切换项目' : '项目列表'}
          </Link>
        </div>

        {projectId && projectLoadState.status === 'ready' ? (
          <nav className="sidebar-nav" aria-label="项目导航">
            {visibleNavigationGroups.map((group) => (
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
        ) : (
          <nav className="sidebar-nav" aria-label="项目导航">
            <div className="nav-group">
              <span className="nav-group__label">工作区</span>
              <NavLink
                className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                end
                onClick={() => setIsMenuOpen(false)}
                to="/projects"
              >
                <span className="nav-link__marker" aria-hidden="true" />
                <span>项目中心</span>
              </NavLink>
            </div>
          </nav>
        )}

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
              <span>{projectId ? '项目工作区' : '工作区'}</span>
              <strong>{projectLabel}</strong>
            </div>
          </div>

          <div className="topbar__account">
            <Link className="account-link" to="/account/tasks">
              我的任务
            </Link>
            <Link className="account-link" to="/account/profile">
              个人资料
            </Link>
            <div className="user-chip">
              <span className="user-chip__avatar">
                {avatarUrl && avatarUrl !== failedAvatarUrl ? (
                  <img
                    alt="当前账号头像"
                    onError={() => setFailedAvatarUrl(avatarUrl)}
                    src={avatarUrl}
                  />
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
        </header>

        <main className="content">
          {signOutError ? <ErrorNotice message={signOutError} /> : null}
          {projectId && projectLoadState.status === 'loading' ? (
            <LoadingState label="正在确认项目访问权限" />
          ) : projectId && projectLoadState.status === 'error' ? (
            <ErrorState
              actionLabel="重试"
              message={projectLoadState.message}
              onAction={() => setProjectRetryVersion((version) => version + 1)}
              title="无法访问项目"
            />
          ) : (
            <Outlet />
          )}
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
