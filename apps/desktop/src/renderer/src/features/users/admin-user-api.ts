import type { ApiClient } from '../../lib/api/client';

export interface AdminUserDto {
  readonly id: string;
  readonly username: string;
  readonly nickname: string;
  readonly status: string;
  readonly isPlatformAdmin: boolean;
  readonly updatedAt: string;
}

export function listAdminUsers(api: Pick<ApiClient, 'get'>): Promise<AdminUserDto[]> {
  return api.get<AdminUserDto[]>('/users/admin');
}

export function disableUser(
  api: Pick<ApiClient, 'post'>,
  user: Pick<AdminUserDto, 'id' | 'username'>,
): Promise<AdminUserDto> {
  return api.post<AdminUserDto, { confirmUsername: string }>(
    `/users/${encodeURIComponent(user.id)}/disable`,
    { confirmUsername: user.username },
  );
}
