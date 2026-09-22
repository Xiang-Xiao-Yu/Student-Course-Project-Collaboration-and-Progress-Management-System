import { RouterProvider, createHashRouter } from 'react-router-dom';

import { SessionProvider } from '../features/auth/session';
import { appRoutes } from './routes';

const router = createHashRouter(appRoutes);

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
