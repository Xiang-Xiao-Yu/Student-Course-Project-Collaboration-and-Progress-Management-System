import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useSession } from './session';

interface RequireSessionProps {
  readonly children: ReactNode;
}

export function RequireSession({ children }: RequireSessionProps) {
  const { status } = useSession();
  const location = useLocation();

  if (status !== 'authenticated') {
    return (
      <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to="/login" />
    );
  }

  return children;
}
