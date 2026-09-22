import { RouterProvider, createHashRouter } from 'react-router-dom';

import { appRoutes } from './routes';

const router = createHashRouter(appRoutes);

export function App() {
  return <RouterProvider router={router} />;
}
