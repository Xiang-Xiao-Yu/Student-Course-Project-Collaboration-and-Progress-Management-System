import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

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
  validateAvatarFile,
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

function getAvatarPreviewUrl(avatarUrl: string | null): string {
  return avatarUrl?.startsWith('data:image/') ? avatarUrl : '';
}

export function ProfilePage() {
  const { api, changePassword, updateProfile, uploadAvatar } = useSession();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarOperationRef = useRef(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isReadingAvatar, setIsReadingAvatar] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarFileName, setAvatarFileName] = useState<string | null>(null);
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
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');

  useEffect(() => {
    let isCancelled = false;

    setState({ status: 'loading' });
    void getCurrentUserProfile(api)
      .then((profile) => {
        if (!isCancelled) {
          setState({ profile, status: 'ready' });
          setAvatarPreviewUrl(getAvatarPreviewUrl(profile.avatarUrl));
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

    if (state.status !== 'ready' || isSavingProfile || avatarOperationRef.current) {
      return;
    }

    const nextErrors = validateProfileForm({ nickname });

    setProfileErrors(nextErrors);
    setProfileMessage(null);

    if (hasFormErrors(nextErrors)) {
      return;
    }

    setIsSavingProfile(true);

    try {
      const profile = await updateProfile({ nickname: nickname.trim() });

      setState({ profile, status: 'ready' });
      setNickname(profile.nickname);
      setAvatarPreviewUrl(getAvatarPreviewUrl(profile.avatarUrl));
      setProfileMessage({ text: '个人资料已更新。', type: 'success' });
    } catch (error) {
      setProfileMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsSavingProfile(false);
    }
  }

  function handleAvatarSelection(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';

    if (!file || state.status !== 'ready' || avatarOperationRef.current || isSavingProfile) {
      return;
    }

    const validationMessage = validateAvatarFile(file);

    if (validationMessage) {
      setAvatarFileName(null);
      setAvatarPreviewUrl(getAvatarPreviewUrl(state.profile.avatarUrl));
      setProfileMessage({ text: validationMessage, type: 'error' });
      return;
    }

    const reader = new FileReader();
    avatarOperationRef.current = true;
    setAvatarFileName(file.name);
    setProfileMessage(null);
    setIsReadingAvatar(true);
    const handleReadFailure = (message = '无法读取所选图片，请重新选择。') => {
      avatarOperationRef.current = false;
      setIsReadingAvatar(false);
      setAvatarFileName(null);
      setAvatarPreviewUrl(getAvatarPreviewUrl(state.profile.avatarUrl));
      setProfileMessage({ text: message, type: 'error' });
    };
    reader.onerror = () => handleReadFailure();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        handleReadFailure();
        return;
      }
      const previewUrl = reader.result;
      const image = new Image();
      image.onerror = () => handleReadFailure('图片内容已损坏或无法识别，请重新选择。');
      image.onload = () => {
        setIsReadingAvatar(false);
        setAvatarPreviewUrl(previewUrl);
        void uploadAvatarFile(file);
      };
      image.src = previewUrl;
    };
    reader.readAsDataURL(file);
  }

  async function uploadAvatarFile(file: File): Promise<void> {
    if (state.status !== 'ready') {
      avatarOperationRef.current = false;
      return;
    }

    const previousAvatarPreview = getAvatarPreviewUrl(state.profile.avatarUrl);
    setIsUploadingAvatar(true);
    setProfileMessage(null);

    try {
      const profile = await uploadAvatar(file);
      setState({ profile, status: 'ready' });
      setAvatarPreviewUrl(getAvatarPreviewUrl(profile.avatarUrl));
      setAvatarFileName(null);
      setProfileMessage({ text: '头像已更新。', type: 'success' });
    } catch (error) {
      setAvatarFileName(null);
      setAvatarPreviewUrl(previousAvatarPreview);
      setProfileMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      avatarOperationRef.current = false;
      setIsUploadingAvatar(false);
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
    (hasUnsavedProfileChanges(state.profile, nickname) ||
      isReadingAvatar ||
      isSavingProfile ||
      isUploadingAvatar ||
      hasUnsavedPasswordChanges(currentPassword, newPassword, confirmPassword));
  const isAvatarBusy = isUploadingAvatar || isSavingProfile || isReadingAvatar;

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
                disabled={isSavingProfile || isUploadingAvatar}
                maxLength={50}
                onChange={(event) => setNickname(event.target.value)}
                value={nickname}
              />
              {profileErrors.nickname ? <small>{profileErrors.nickname}</small> : null}
            </label>

            <div className="avatar-field">
              <span className="avatar-field__label" id="profile-avatar-label">
                头像
              </span>
              <div className="avatar-editor" role="group" aria-labelledby="profile-avatar-label">
                <div className="avatar-editor__preview">
                  {avatarPreviewUrl ? (
                    <img className="avatar-preview" src={avatarPreviewUrl} alt="头像预览" />
                  ) : (
                    <span className="avatar-editor__placeholder" aria-hidden="true">
                      {nickname.trim().slice(0, 1) || '我'}
                    </span>
                  )}
                  <button
                    className="avatar-editor__badge"
                    aria-label="选择头像文件"
                    title="选择图片并自动上传"
                    disabled={isAvatarBusy}
                    onClick={() => avatarInputRef.current?.click()}
                    type="button"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M8 6 9.5 4h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
                      <circle cx="12" cy="12" r="3.5" />
                    </svg>
                  </button>
                </div>
                <div className="avatar-editor__content">
                  <strong>个人头像</strong>
                  <p className="avatar-editor__hint">JPG、PNG 或 WebP · 不超过 10 MiB</p>
                  <div className="avatar-editor__actions">
                    <label className="avatar-picker" aria-disabled={isAvatarBusy}>
                      <span>{avatarPreviewUrl ? '更换图片' : '选择图片'}</span>
                      <input
                        ref={avatarInputRef}
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="选择头像图片"
                        disabled={isAvatarBusy}
                        onChange={handleAvatarSelection}
                        type="file"
                      />
                    </label>
                  </div>
                  <div className="avatar-editor__status" aria-live="polite">
                    {isReadingAvatar ? (
                      <span>正在读取图片...</span>
                    ) : avatarFileName ? (
                      <>
                        <span className="avatar-editor__uploading">上传中</span>
                        <span className="avatar-editor__filename" title={avatarFileName}>
                          {avatarFileName}
                        </span>
                      </>
                    ) : (
                      <span>
                        {avatarPreviewUrl ? '当前头像已保存，更换后自动上传' : '选择图片后自动上传'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button
                className="primary-button"
                disabled={isSavingProfile || isUploadingAvatar || isReadingAvatar}
                type="submit"
              >
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
