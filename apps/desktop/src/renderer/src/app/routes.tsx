import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';

import { RequireSession } from '../features/auth/RequireSession';
import { AccountLayout } from '../layouts/AccountLayout';
import { AppLayout } from '../layouts/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { MyTasksPage } from '../pages/MyTasksPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RegisterPage } from '../pages/RegisterPage';
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
    element: <Navigate to="/projects/demo-project/overview" replace />,
  },
  {
    path: '/projects/:projectId',
    element: (
      <RequireSession>
        <AppLayout />
      </RequireSession>
    ),
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
        element: <SectionPage section="requirements" />,
      },
      {
        path: 'board',
        element: <SectionPage section="board" />,
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
        element: <SectionPage section="members" />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];
