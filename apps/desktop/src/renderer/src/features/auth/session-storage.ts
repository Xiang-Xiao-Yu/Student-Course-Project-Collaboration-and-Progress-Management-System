const SESSION_STORAGE_KEY = 'scpc.auth.session';
const MOCK_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

export interface SessionUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly user: SessionUser;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSessionUser(value: unknown): value is SessionUser {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['username'] === 'string' &&
    typeof value['displayName'] === 'string'
  );
}

function isAuthSession(value: unknown): value is AuthSession {
  return (
    isRecord(value) &&
    typeof value['accessToken'] === 'string' &&
    typeof value['expiresAt'] === 'number' &&
    isSessionUser(value['user'])
  );
}

export function getBrowserSessionStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStoredSession(
  storage: KeyValueStorage | null,
  now = Date.now(),
): AuthSession | null {
  if (!storage) {
    return null;
  }

  const rawSession = storage.getItem(SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const session: unknown = JSON.parse(rawSession);

    if (!isAuthSession(session) || session.expiresAt <= now) {
      storage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    storage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function writeStoredSession(storage: KeyValueStorage | null, session: AuthSession): void {
  storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(storage: KeyValueStorage | null): void {
  storage?.removeItem(SESSION_STORAGE_KEY);
}

export function createMockSession(now = Date.now()): AuthSession {
  return {
    accessToken: 'mock-access-token',
    expiresAt: now + MOCK_SESSION_DURATION_MS,
    user: {
      id: 'user-demo',
      username: 'demo',
      displayName: '演示用户',
    },
  };
}

export function createMemoryStorage(initialValue: string | null = null): KeyValueStorage {
  let value = initialValue;

  return {
    getItem: () => value,
    setItem: (_key, nextValue) => {
      value = nextValue;
    },
    removeItem: () => {
      value = null;
    },
  };
}
