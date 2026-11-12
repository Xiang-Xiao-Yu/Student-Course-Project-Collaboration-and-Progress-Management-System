import { describe, expect, it, vi } from 'vitest';
import { disableUser, listAdminUsers } from './admin-user-api';

describe('administrator user API', () => {
  it('uses the authenticated administrator list endpoint', async () => {
    const api = { get: vi.fn().mockResolvedValue([]) };
    expect(await listAdminUsers(api)).toEqual([]);
    expect(api.get).toHaveBeenCalledWith('/users/admin');
  });
  it('encodes the user id and sends only the confirmation username', async () => {
    const api = { post: vi.fn().mockResolvedValue({ status: 'DISABLED' }) };
    await disableUser(api, { id: 'user/1', username: 'student' });
    expect(api.post).toHaveBeenCalledWith('/users/user%2F1/disable', {
      confirmUsername: 'student',
    });
  });
  it('propagates a failed disable so the caller can preserve the list and retry', async () => {
    const failure = new Error('network');
    await expect(
      disableUser({ post: vi.fn().mockRejectedValue(failure) }, { id: '1', username: 'student' }),
    ).rejects.toBe(failure);
  });
});
