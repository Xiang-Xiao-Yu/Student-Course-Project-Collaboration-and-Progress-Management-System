import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../features/auth/session';
import type { AuthFormErrors } from '../features/auth/auth-validation';
import { hasFormErrors, validateRegisterForm } from '../features/auth/auth-validation';
import { getUserFacingError } from '../lib/api/errors';

export function RegisterPage() {
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<AuthFormErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const navigate = useNavigate();
  const { registerAccount, session } = useSession();

  if (session) {
    return <Navigate replace to="/projects/demo-project/overview" />;
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateRegisterForm({
      confirmPassword,
      nickname,
      password,
      username,
    });

    setErrors(nextErrors);

    if (hasFormErrors(nextErrors)) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await registerAccount({
        nickname: nickname.trim(),
        password,
        username: username.trim(),
      });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (error) {
      setErrorMessage(getUserFacingError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

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
          <h1>注册</h1>
          <p>创建账号后即可加入项目团队。</p>
        </div>

        {errorMessage ? <ErrorNotice message={errorMessage} /> : null}

        <form className="auth-form" onSubmit={(event) => void handleRegister(event)}>
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
            <span>昵称</span>
            <input
              maxLength={50}
              onChange={(event) => setNickname(event.target.value)}
              value={nickname}
            />
            {errors.nickname ? <small>{errors.nickname}</small> : null}
          </label>

          <label className="form-field">
            <span>密码</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
            {errors.password ? <small>{errors.password}</small> : null}
          </label>

          <label className="form-field">
            <span>确认密码</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
            {errors.confirmPassword ? <small>{errors.confirmPassword}</small> : null}
          </label>

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? '正在注册...' : '注册'}
          </button>
        </form>

        <p className="auth-switch">
          已有账号？<Link to="/login">返回登录</Link>
        </p>
      </section>
    </main>
  );
}
