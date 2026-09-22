import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { SectionPage } from '../pages/SectionPage';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Navigate to="/projects/demo-project/overview" replace />,
  },
  {
    path: '/projects/:projectId',
    element: <AppLayout />,
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
