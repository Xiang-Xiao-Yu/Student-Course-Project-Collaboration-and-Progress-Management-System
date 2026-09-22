import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../features/auth/session';
import { getUserFacingError } from '../lib/api/errors';

interface LoginLocationState {
  readonly from?: string;
}

export function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { reason, session, signInWithMock } = useSession();
  const location = useLocation();
  const locationState = location.state as LoginLocationState | null;
  const destination = locationState?.from ?? '/projects/demo-project/overview';

  if (session) {
    return <Navigate replace to={destination} />;
  }

  async function handleSignIn(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await signInWithMock();
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
          <h1>进入项目工作区</h1>
          <p>登录后查看项目进度、任务和阶段验收。</p>
        </div>

        {sessionMessage ? <div className="session-notice">{sessionMessage}</div> : null}
        {errorMessage ? <ErrorNotice message={errorMessage} /> : null}

        <button
          className="primary-button"
          disabled={isSubmitting}
          onClick={() => void handleSignIn()}
          type="button"
        >
          {isSubmitting ? '正在进入...' : '进入演示项目'}
        </button>
      </section>
    </main>
  );
}
