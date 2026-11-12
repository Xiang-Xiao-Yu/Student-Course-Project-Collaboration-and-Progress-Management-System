import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentUserProfile } from '../auth/auth-api';
import { useSession } from '../auth/session';

export function AdminUsersLink({ className = 'secondary-link' }: { readonly className?: string }) {
  const { api, session } = useSession();
  const userId = session?.user.id;
  const [administratorId, setAdministratorId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setAdministratorId(null);
    if (userId)
      void getCurrentUserProfile(api)
        .then((profile) => {
          if (!cancelled && profile.id === userId && profile.isPlatformAdmin === true)
            setAdministratorId(userId);
        })
        .catch(() => {
          /* Hide this optional shortcut if access cannot be confirmed. */
        });
    return () => {
      cancelled = true;
    };
  }, [api, userId]);
  return userId && administratorId === userId ? (
    <Link className={className} to="/account/users">
      用户管理
    </Link>
  ) : null;
}
