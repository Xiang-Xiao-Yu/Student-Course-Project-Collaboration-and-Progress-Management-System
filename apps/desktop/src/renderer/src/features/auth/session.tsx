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
import { getDesktopRuntimeConfig } from '../../lib/runtime';
import type { AuthSession } from './session-storage';
import {
  clearStoredSession,
  createMockSession,
  getBrowserSessionStorage,
  readStoredSession,
  writeStoredSession,
} from './session-storage';

export type SessionEndReason = 'expired' | 'signed-out' | null;

interface SessionContextValue {
  readonly api: ApiClient;
  readonly reason: SessionEndReason;
  readonly session: AuthSession | null;
  readonly status: 'anonymous' | 'authenticated';
  readonly signInWithMock: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const storage = useMemo(() => getBrowserSessionStorage(), []);
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession(storage));
  const [reason, setReason] = useState<SessionEndReason>(null);
  const sessionRef = useRef<AuthSession | null>(session);

  const clearSession = useCallback(
    (nextReason: SessionEndReason) => {
      sessionRef.current = null;
      setSession(null);
      setReason(nextReason);
      clearStoredSession(storage);
    },
    [storage],
  );

  const api = useMemo(
    () =>
      new ApiClient({
        baseUrl: getDesktopRuntimeConfig().apiBaseUrl,
        getAccessToken: () => sessionRef.current?.accessToken ?? null,
        onUnauthorized: () => clearSession('expired'),
      }),
    [clearSession],
  );

  const signInWithMock = useCallback(async () => {
    const nextSession = createMockSession();

    sessionRef.current = nextSession;
    setSession(nextSession);
    setReason(null);
    writeStoredSession(storage, nextSession);
  }, [storage]);

  const signOut = useCallback(async () => {
    clearSession('signed-out');
  }, [clearSession]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
      reason,
      session,
      status: session ? 'authenticated' : 'anonymous',
      signInWithMock,
      signOut,
    }),
    [api, reason, session, signInWithMock, signOut],
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
