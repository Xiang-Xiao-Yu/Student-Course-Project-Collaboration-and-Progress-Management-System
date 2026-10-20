import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import type { UserProfileDto } from '../features/auth/auth-api';
import { getCurrentUserProfile } from '../features/auth/auth-api';
import {
  hasUnsavedPasswordChanges,
  hasUnsavedProfileChanges,
} from '../features/auth/profile-form-state';
import type { PasswordFormErrors, ProfileFormErrors } from '../features/auth/auth-validation';
import {
  hasFormErrors,
  validatePasswordForm,
  validateProfileForm,
} from '../features/auth/auth-validation';
import { useSession } from '../features/auth/session';
import { getUserFacingError } from '../lib/api/errors';

type ProfileState =
  | { readonly status: 'loading' }
  | { readonly profile: UserProfileDto; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ProfilePage() {
  const { api, changePassword, updateProfile } = useSession();
  const [avatarUrl, setAvatarUrl] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<PasswordFormErrors>({});
  const [passwordMessage, setPasswordMessage] = useState<{
    readonly text: string;
    readonly type: 'error' | 'success';
  } | null>(null);
  const [profileErrors, setProfileErrors] = useState<ProfileFormErrors>({});
  const [profileMessage, setProfileMessage] = useState<{
    readonly text: string;
    readonly type: 'error' | 'success';
  } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  useEffect(() => {
    let isCancelled = false;

    setState({ status: 'loading' });
    void getCurrentUserProfile(api)
      .then((profile) => {
        if (!isCancelled) {
          setState({ profile, status: 'ready' });
          setAvatarUrl(profile.avatarUrl ?? '');
          setNickname(profile.nickname);
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({ message: getUserFacingError(error), status: 'error' });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api, retryVersion]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateProfileForm({ avatarUrl, nickname });

    setProfileErrors(nextErrors);
    setProfileMessage(null);

    if (hasFormErrors(nextErrors)) {
      return;
    }

    setIsSavingProfile(true);

    try {
      const profile = await updateProfile({
        avatarUrl: avatarUrl.trim() || null,
        nickname: nickname.trim(),
      });

      setState({ profile, status: 'ready' });
      setNickname(profile.nickname);
      setAvatarUrl(profile.avatarUrl ?? '');
      setProfileMessage({ text: '个人资料已更新。', type: 'success' });
    } catch (error) {
      setProfileMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validatePasswordForm({
      confirmPassword,
      currentPassword,
      newPassword,
    });

    setPasswordErrors(nextErrors);
    setPasswordMessage(null);

    if (hasFormErrors(nextErrors)) {
      return;
    }

    setIsChangingPassword(true);

    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({ text: '密码已更新，当前会话已刷新。', type: 'success' });
    } catch (error) {
      setPasswordMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsChangingPassword(false);
    }
  }

  const hasUnsavedChanges =
    state.status === 'ready' &&
    (hasUnsavedProfileChanges(state.profile, nickname, avatarUrl) ||
      hasUnsavedPasswordChanges(currentPassword, newPassword, confirmPassword));

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="个人资料" description="查看并维护当前账号信息。" />
        <LoadingState label="正在加载个人资料" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="个人资料" description="查看并维护当前账号信息。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="个人资料加载失败"
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <UnsavedChangesGuard
        message="个人资料或密码尚未保存，离开后修改将丢失。"
        when={hasUnsavedChanges}
      />
      <PageHeader title="个人资料" description="查看并维护当前账号信息。" />

      <div className="profile-sections">
        <section className="panel profile-panel">
          <div className="panel__header">
            <div>
              <h2>基本信息</h2>
              <p>
                {state.profile.username} · 注册于 {formatDate(state.profile.createdAt)}
              </p>
            </div>
            <span className="tag">{state.profile.status === 'ACTIVE' ? '正常' : '已禁用'}</span>
          </div>

          {profileMessage?.type === 'error' ? <ErrorNotice message={profileMessage.text} /> : null}
          {profileMessage?.type === 'success' ? (
            <div className="success-notice">{profileMessage.text}</div>
          ) : null}

          <form
            className="auth-form profile-form"
            onSubmit={(event) => void handleProfileSubmit(event)}
          >
            <label className="form-field">
              <span>昵称</span>
              <input
                maxLength={50}
                onChange={(event) => setNickname(event.target.value)}
                value={nickname}
              />
              {profileErrors.nickname ? <small>{profileErrors.nickname}</small> : null}
            </label>

            <label className="form-field">
              <span>头像地址</span>
              <input
                maxLength={2048}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://example.com/avatar.png"
                value={avatarUrl}
              />
              {profileErrors.avatarUrl ? <small>{profileErrors.avatarUrl}</small> : null}
            </label>

            <div className="form-actions">
              <button className="primary-button" disabled={isSavingProfile} type="submit">
                {isSavingProfile ? '正在保存...' : '保存资料'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel profile-panel">
          <div className="panel__header">
            <div>
              <h2>修改密码</h2>
              <p>修改成功后当前会话会自动更新。</p>
            </div>
          </div>

          {passwordMessage?.type === 'error' ? (
            <ErrorNotice message={passwordMessage.text} />
          ) : null}
          {passwordMessage?.type === 'success' ? (
            <div className="success-notice">{passwordMessage.text}</div>
          ) : null}

          <form
            className="auth-form profile-form"
            onSubmit={(event) => void handlePasswordSubmit(event)}
          >
            <label className="form-field">
              <span>当前密码</span>
              <input
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                value={currentPassword}
              />
              {passwordErrors.currentPassword ? (
                <small>{passwordErrors.currentPassword}</small>
              ) : null}
            </label>

            <label className="form-field">
              <span>新密码</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
              />
              {passwordErrors.newPassword ? <small>{passwordErrors.newPassword}</small> : null}
            </label>

            <label className="form-field">
              <span>确认新密码</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                value={confirmPassword}
              />
              {passwordErrors.confirmPassword ? (
                <small>{passwordErrors.confirmPassword}</small>
              ) : null}
            </label>

            <div className="form-actions">
              <button className="primary-button" disabled={isChangingPassword} type="submit">
                {isChangingPassword ? '正在更新密码...' : '更新密码'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
