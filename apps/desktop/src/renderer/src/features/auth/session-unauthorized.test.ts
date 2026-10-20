import { describe, expect, it } from 'vitest';

import { shouldClearSessionForUnauthorized } from './session-unauthorized';

describe('unauthorized session cleanup', () => {
  it('clears the current session for a matching Token', () => {
    expect(shouldClearSessionForUnauthorized('current-token', 'current-token')).toBe(true);
  });

  it('keeps a refreshed session when an old request returns 401', () => {
    expect(shouldClearSessionForUnauthorized('new-token', 'old-token')).toBe(false);
  });

  it('does not clear a session for an unauthenticated request', () => {
    expect(shouldClearSessionForUnauthorized('current-token', null)).toBe(false);
  });
});
