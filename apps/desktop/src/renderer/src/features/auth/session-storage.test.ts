import { describe, expect, it } from 'vitest';

import {
  clearStoredSession,
  createMemoryStorage,
  createMockSession,
  readStoredSession,
  writeStoredSession,
} from './session-storage';

describe('session storage', () => {
  it('正常场景可以保存和读取会话', () => {
    const storage = createMemoryStorage();
    const session = createMockSession(1_000);

    writeStoredSession(storage, session);

    expect(readStoredSession(storage, 1_001)).toEqual(session);
  });

  it('边界场景会在过期时删除会话', () => {
    const storage = createMemoryStorage();
    const session = createMockSession(1_000);

    writeStoredSession(storage, session);

    expect(readStoredSession(storage, session.expiresAt)).toBeNull();
    expect(storage.getItem('scpc.auth.session')).toBeNull();
  });

  it('失败场景对损坏数据返回空会话并清理存储', () => {
    const storage = createMemoryStorage('{not-json');

    expect(readStoredSession(storage)).toBeNull();
    expect(storage.getItem('scpc.auth.session')).toBeNull();
  });

  it('可以显式清理会话', () => {
    const storage = createMemoryStorage();

    writeStoredSession(storage, createMockSession());
    clearStoredSession(storage);

    expect(storage.getItem('scpc.auth.session')).toBeNull();
  });
});
