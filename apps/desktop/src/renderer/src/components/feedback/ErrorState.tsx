interface ErrorStateProps {
  readonly actionLabel?: string;
  readonly message: string;
  readonly onAction?: () => void;
  readonly title?: string;
}

export function ErrorState({
  actionLabel,
  message,
  onAction,
  title = '操作未完成',
}: ErrorStateProps) {
  return (
    <section className="error-state" role="alert">
      <span className="error-state__mark" aria-hidden="true">
        !
      </span>
      <strong>{title}</strong>
      <p>{message}</p>
      {actionLabel && onAction ? (
        <button className="secondary-button" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
