import { describe, expect, it, vi } from 'vitest';

import { completeServerLogout } from './session-logout';

describe('server logout request', () => {
  it('clears local session after the server accepts logout', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const clearSession = vi.fn();
    const reportFailure = vi.fn();

    await completeServerLogout(request, clearSession, reportFailure);

    expect(request).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalledOnce();
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it('keeps the local session and reports the error when logout fails', async () => {
    const failure = new Error('network unavailable');
    const request = vi.fn().mockRejectedValue(failure);
    const clearSession = vi.fn();
    const reportFailure = vi.fn();

    await completeServerLogout(request, clearSession, reportFailure);

    expect(clearSession).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledWith(failure);
  });
});
