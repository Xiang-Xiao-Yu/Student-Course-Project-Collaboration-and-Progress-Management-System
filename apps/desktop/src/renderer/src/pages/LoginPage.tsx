import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../features/auth/session';
import type { AuthFormErrors } from '../features/auth/auth-validation';
import { hasFormErrors, validateLoginForm } from '../features/auth/auth-validation';
import { getUserFacingError } from '../lib/api/errors';

interface LoginLocationState {
  readonly from?: string;
  readonly registered?: boolean;
}

export function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<AuthFormErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const { reason, session, signIn } = useSession();
  const location = useLocation();
  const locationState = location.state as LoginLocationState | null;
  const destination = locationState?.from ?? '/projects/demo-project/overview';

  if (session) {
    return <Navigate replace to={destination} />;
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateLoginForm({ password, username });

    setErrors(nextErrors);

    if (hasFormErrors(nextErrors)) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await signIn({ password, username: username.trim() });
    } catch (error) {
      setErrorMessage(getUserFacingError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const sessionMessage =
    reason === 'expired'
      ? '登录状态已失效，请重新进入项目。'
      : reason === 'signed-out'
        ? '已退出当前工作区。'
        : null;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <span className="brand-mark" aria-hidden="true">
            课
          </span>
          <div>
            <strong>课程项目协作台</strong>
            <span>协作与进度管理</span>
          </div>
        </div>

        <div className="auth-copy">
          <h1>登录</h1>
          <p>使用账号进入课程项目工作区。</p>
        </div>

        {locationState?.registered ? (
          <div className="session-notice">注册成功，请使用新账号登录。</div>
        ) : null}
        {sessionMessage ? <div className="session-notice">{sessionMessage}</div> : null}
        {errorMessage ? <ErrorNotice message={errorMessage} /> : null}

        <form className="auth-form" onSubmit={(event) => void handleSignIn(event)}>
          <label className="form-field">
            <span>用户名</span>
            <input
              autoComplete="username"
              maxLength={64}
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
            {errors.username ? <small>{errors.username}</small> : null}
          </label>

          <label className="form-field">
            <span>密码</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
            {errors.password ? <small>{errors.password}</small> : null}
          </label>

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? '正在登录...' : '登录'}
          </button>
        </form>

        <p className="auth-switch">
          还没有账号？<Link to="/register">注册</Link>
        </p>
      </section>
    </main>
  );
}
