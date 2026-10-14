import { describe, expect, it, vi } from 'vitest';

import { requestServerLogout } from './session-logout';

describe('server logout request', () => {
  it('reports completion after the server accepts logout', async () => {
    const request = vi.fn().mockResolvedValue(undefined);

    await expect(requestServerLogout(request)).resolves.toEqual({ status: 'completed' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not report completion when the server request fails', async () => {
    const failure = new Error('network unavailable');
    const request = vi.fn().mockRejectedValue(failure);

    await expect(requestServerLogout(request)).resolves.toEqual({
      error: failure,
      status: 'failed',
    });
  });
});
