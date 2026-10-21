import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import { ApiClient } from '../../lib/api/client';
import { getUserFacingError } from '../../lib/api/errors';
import { getDesktopRuntimeConfig } from '../../lib/runtime';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  RegisterResponseDto,
  UpdateProfileInput,
  UserProfileDto,
} from './auth-api';
import {
  changeCurrentUserPassword,
  createSessionAfterPasswordChange,
  getCurrentUserProfile,
  registerUser,
  signInWithPassword,
  signOutCurrentUser,
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
} from './auth-api';
import { completeServerLogout } from './session-logout';
import { shouldClearSessionForUnauthorized } from './session-unauthorized';
import type { AuthSession } from './session-storage';
import {
  clearStoredSession,
  getBrowserSessionStorage,
  readStoredSession,
  writeStoredSession,
} from './session-storage';

export type SessionEndReason = 'expired' | 'signed-out' | null;

interface SessionContextValue {
  readonly api: ApiClient;
  readonly avatarUrl: string | null;
  readonly changePassword: (input: ChangePasswordInput) => Promise<void>;
  readonly reason: SessionEndReason;
  readonly signOutError: string | null;
  readonly session: AuthSession | null;
  readonly status: 'anonymous' | 'authenticated';
  readonly registerAccount: (input: RegisterInput) => Promise<RegisterResponseDto>;
  readonly signIn: (input: LoginInput) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly updateProfile: (input: UpdateProfileInput) => Promise<UserProfileDto>;
  readonly uploadAvatar: (file: File) => Promise<UserProfileDto>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const storage = useMemo(() => getBrowserSessionStorage(), []);
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession(storage));
  const [reason, setReason] = useState<SessionEndReason>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<{ userId: string; url: string | null } | null>(null);
  const avatarRevision = useRef(0);
  const sessionRef = useRef<AuthSession | null>(session);

  const clearSession = useCallback(
    (nextReason: SessionEndReason) => {
      sessionRef.current = null;
      setSession(null);
      setAvatar(null);
      avatarRevision.current += 1;
      setReason(nextReason);
      setSignOutError(null);
      clearStoredSession(storage);
    },
    [storage],
  );

  const api = useMemo(
    () =>
      new ApiClient({
        baseUrl: getDesktopRuntimeConfig().apiBaseUrl,
        getAccessToken: () => sessionRef.current?.accessToken ?? null,
        onUnauthorized: (requestAccessToken) => {
          if (
            shouldClearSessionForUnauthorized(
              sessionRef.current?.accessToken ?? null,
              requestAccessToken,
            )
          ) {
            clearSession('expired');
          }
        },
      }),
    [clearSession],
  );

  const signIn = useCallback(
    async (input: LoginInput) => {
      const nextSession = await signInWithPassword(api, input);

      sessionRef.current = nextSession;
      setSession(nextSession);
      setAvatar(null);
      avatarRevision.current += 1;
      setReason(null);
      setSignOutError(null);
      writeStoredSession(storage, nextSession);
    },
    [api, storage],
  );

  const registerAccount = useCallback((input: RegisterInput) => registerUser(api, input), [api]);

  const updateProfile = useCallback(
    async (input: UpdateProfileInput) => {
      const profile = await updateCurrentUserProfile(api, input);
      const currentSession = sessionRef.current;

      if (currentSession?.user.id === profile.id) {
        avatarRevision.current += 1;
        setAvatar({ userId: profile.id, url: profile.avatarUrl });
        const nextSession: AuthSession = {
          ...currentSession,
          user: {
            ...currentSession.user,
            displayName: profile.nickname,
            username: profile.username,
          },
        };

        sessionRef.current = nextSession;
        setSession(nextSession);
        writeStoredSession(storage, nextSession);
      }

      return profile;
    },
    [api, storage],
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      const profile = await uploadCurrentUserAvatar(api, file);

      if (sessionRef.current?.user.id === profile.id) {
        avatarRevision.current += 1;
        setAvatar({ userId: profile.id, url: profile.avatarUrl });
      }

      return profile;
    },
    [api],
  );

  const changePassword = useCallback(
    async (input: ChangePasswordInput) => {
      const response = await changeCurrentUserPassword(api, input);
      const currentSession = sessionRef.current;

      if (currentSession) {
        const nextSession = createSessionAfterPasswordChange(currentSession, response);

        sessionRef.current = nextSession;
        setSession(nextSession);
        writeStoredSession(storage, nextSession);
      }
    },
    [api, storage],
  );

  const signOut = useCallback(async () => {
    setSignOutError(null);

    if (!sessionRef.current) {
      clearSession('signed-out');
      return;
    }

    await completeServerLogout(
      () => signOutCurrentUser(api),
      () => clearSession('signed-out'),
      (error) => {
        if (sessionRef.current) {
          setSignOutError(`退出未完成：${getUserFacingError(error)}`);
        }
      },
    );
  }, [api, clearSession]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const avatarUserId = session?.user.id;
  const avatarAccessToken = session?.accessToken;

  useEffect(() => {
    if (!avatarUserId || !avatarAccessToken) {
      return;
    }

    let isCancelled = false;
    const revision = avatarRevision.current;
    void getCurrentUserProfile(api)
      .then((profile) => {
        if (
          !isCancelled &&
          revision === avatarRevision.current &&
          sessionRef.current?.user.id === profile.id
        ) {
          setAvatar({ userId: profile.id, url: profile.avatarUrl });
        }
      })
      .catch(() => {
        // Keep the initials fallback if this optional header request fails.
      });

    return () => {
      isCancelled = true;
    };
  }, [api, avatarAccessToken, avatarUserId]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const remainingTime = session.expiresAt - Date.now();

    if (remainingTime <= 0) {
      clearSession('expired');
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      clearSession('expired');
    }, remainingTime);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [clearSession, session]);

  const value = useMemo<SessionContextValue>(
    () => ({
      api,
      avatarUrl: avatar?.userId === session?.user.id ? (avatar?.url ?? null) : null,
      changePassword,
      reason,
      registerAccount,
      session,
      signOutError,
      signIn,
      status: session ? 'authenticated' : 'anonymous',
      signOut,
      updateProfile,
      uploadAvatar,
    }),
    [
      api,
      avatar,
      changePassword,
      reason,
      registerAccount,
      session,
      signOutError,
      signIn,
      signOut,
      updateProfile,
      uploadAvatar,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }

  return context;
}
