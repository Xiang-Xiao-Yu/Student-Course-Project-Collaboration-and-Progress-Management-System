import { RouterProvider, createHashRouter } from 'react-router-dom';

import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { SessionProvider } from '../features/auth/session';
import { appRoutes } from './routes';

const router = createHashRouter(appRoutes);

export function App() {
  return (
    <AppErrorBoundary>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </AppErrorBoundary>
  );
}
