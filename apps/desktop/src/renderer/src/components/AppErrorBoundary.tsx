import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { ErrorState } from './feedback/ErrorState';

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('Renderer error boundary', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="standalone-state">
        <div className="standalone-state__panel">
          <ErrorState
            actionLabel="重新加载"
            message="应用遇到问题，请重新加载后重试。"
            onAction={() => window.location.reload()}
            title="页面加载失败"
          />
        </div>
      </main>
    );
  }
}
