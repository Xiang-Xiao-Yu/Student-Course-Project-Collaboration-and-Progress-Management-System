import type { ApiClient } from '../../lib/api/client';
import type { AuthSession } from './session-storage';

const DEFAULT_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

export interface LoginInput {
  readonly password: string;
  readonly username: string;
}

export interface RegisterInput {
  readonly nickname: string;
  readonly password: string;
  readonly username: string;
}

export interface AuthenticatedUserDto {
  readonly id: string;
  readonly nickname: string;
  readonly username: string;
}

export interface LoginResponseDto {
  readonly accessToken: string;
  readonly expiresIn: string;
  readonly tokenType: 'Bearer';
  readonly user: AuthenticatedUserDto;
}

export interface RegisterResponseDto {
  readonly createdAt: string;
  readonly id: string;
  readonly nickname: string;
  readonly username: string;
}

export interface UserProfileDto {
  readonly avatarUrl: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly nickname: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly username: string;
}

export interface UserTaskDto {
  readonly dueDate: string | null;
  readonly id: string;
  readonly priority: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly title: string;
  readonly updatedAt: string;
}

export function parseSessionDuration(expiresIn: string, now = Date.now()): number {
  const match = /^(\d+)([smhd])$/i.exec(expiresIn.trim());

  if (!match) {
    return now + DEFAULT_SESSION_DURATION_MS;
  }

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const unitMs: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };
  const multiplier = unit ? unitMs[unit] : undefined;

  return multiplier ? now + amount * multiplier : now + DEFAULT_SESSION_DURATION_MS;
}

export async function signInWithPassword(
  api: Pick<ApiClient, 'post'>,
  input: LoginInput,
): Promise<AuthSession> {
  const response = await api.post<LoginResponseDto, LoginInput>('/auth/login', input);

  return {
    accessToken: response.accessToken,
    expiresAt: parseSessionDuration(response.expiresIn),
    user: {
      displayName: response.user.nickname,
      id: response.user.id,
      username: response.user.username,
    },
  };
}

export function registerUser(
  api: Pick<ApiClient, 'post'>,
  input: RegisterInput,
): Promise<RegisterResponseDto> {
  return api.post<RegisterResponseDto, RegisterInput>('/auth/register', input);
}

export async function signOutCurrentUser(api: Pick<ApiClient, 'post'>): Promise<void> {
  await api.post('/auth/logout');
}

export function getCurrentUserProfile(api: Pick<ApiClient, 'get'>): Promise<UserProfileDto> {
  return api.get<UserProfileDto>('/users/me');
}

export function getCurrentUserTasks(api: Pick<ApiClient, 'get'>): Promise<UserTaskDto[]> {
  return api.get<UserTaskDto[]>('/users/me/tasks');
}
