interface LoadingStateProps {
  readonly compact?: boolean;
  readonly label?: string;
}

export function LoadingState({ compact = false, label = '正在加载' }: LoadingStateProps) {
  return (
    <div
      aria-live="polite"
      className={`loading-state${compact ? ' loading-state--compact' : ''}`}
      role="status"
    >
      <span className="loading-state__spinner" aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  );
}
