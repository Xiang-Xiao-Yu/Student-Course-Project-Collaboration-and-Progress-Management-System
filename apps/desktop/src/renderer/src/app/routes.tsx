import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';

import { RequireSession } from '../features/auth/RequireSession';
import { AccountLayout } from '../layouts/AccountLayout';
import { AppLayout } from '../layouts/AppLayout';
import { BoardPage } from '../pages/BoardPage';
import { LoginPage } from '../pages/LoginPage';
import { MembersPage } from '../pages/MembersPage';
import { MyTasksPage } from '../pages/MyTasksPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProjectSettingsPage } from '../pages/ProjectSettingsPage';
import { RegisterPage } from '../pages/RegisterPage';
import { RequirementDetailPage } from '../pages/RequirementDetailPage';
import { RequirementsPage } from '../pages/RequirementsPage';
import { SectionPage } from '../pages/SectionPage';

export const appRoutes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/account',
    element: (
      <RequireSession>
        <AccountLayout />
      </RequireSession>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="profile" replace />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: 'tasks',
        element: <MyTasksPage />,
      },
    ],
  },
  {
    path: '/',
    element: <Navigate to="/projects" replace />,
  },
  {
    path: '/projects',
    element: (
      <RequireSession>
        <AppLayout />
      </RequireSession>
    ),
    children: [
      {
        index: true,
        element: <ProjectsPage />,
      },
      {
        path: ':projectId',
        children: [
          {
            index: true,
            element: <Navigate to="overview" replace />,
          },
          {
            path: 'overview',
            element: <OverviewPage />,
          },
          {
            path: 'requirements',
            element: <RequirementsPage />,
          },
          {
            path: 'requirements/:requirementId',
            element: <RequirementDetailPage />,
          },
          {
            path: 'board',
            element: <BoardPage />,
          },
          {
            path: 'iterations',
            element: <SectionPage section="iterations" />,
          },
          {
            path: 'meetings',
            element: <SectionPage section="meetings" />,
          },
          {
            path: 'acceptance',
            element: <SectionPage section="acceptance" />,
          },
          {
            path: 'reports',
            element: <SectionPage section="reports" />,
          },
          {
            path: 'members',
            element: <MembersPage />,
          },
          {
            path: 'settings',
            element: <ProjectSettingsPage />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];
