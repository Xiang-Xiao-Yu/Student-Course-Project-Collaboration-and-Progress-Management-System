import type { UserProfileDto } from './auth-api';

export function hasUnsavedProfileChanges(
  profile: Pick<UserProfileDto, 'nickname'>,
  nickname: string,
): boolean {
  return profile.nickname !== nickname.trim();
}

export function hasUnsavedPasswordChanges(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): boolean {
  return Boolean(currentPassword || newPassword || confirmPassword);
}
