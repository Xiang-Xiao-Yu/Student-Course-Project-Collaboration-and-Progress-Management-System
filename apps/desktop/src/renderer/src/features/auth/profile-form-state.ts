import type { UserProfileDto } from './auth-api';

export function hasUnsavedProfileChanges(
  profile: Pick<UserProfileDto, 'avatarUrl' | 'nickname'>,
  nickname: string,
  avatarUrl: string,
): boolean {
  return profile.nickname !== nickname.trim() || profile.avatarUrl !== (avatarUrl.trim() || null);
}

export function hasUnsavedPasswordChanges(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): boolean {
  return Boolean(currentPassword || newPassword || confirmPassword);
}
