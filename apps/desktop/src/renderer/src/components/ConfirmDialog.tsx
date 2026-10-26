interface ConfirmDialogProps {
  readonly confirmLabel: string;
  readonly isPending?: boolean;
  readonly message: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly tone?: 'danger' | 'primary';
}

export function ConfirmDialog({
  confirmLabel,
  isPending = false,
  message,
  onCancel,
  onConfirm,
  title,
  tone = 'primary',
}: ConfirmDialogProps) {
  return (
    <div className="confirm-backdrop">
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-dialog__actions">
          <button
            className="secondary-button"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className={tone === 'danger' ? 'danger-button' : 'primary-button confirm-primary'}
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? '正在处理...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
