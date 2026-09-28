interface UnsavedChangesDialogProps {
  readonly message?: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function UnsavedChangesDialog({
  message = '离开后当前未保存内容将丢失。',
  onCancel,
  onConfirm,
}: UnsavedChangesDialogProps) {
  return (
    <div className="confirm-backdrop">
      <section
        aria-labelledby="unsaved-changes-title"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
      >
        <h2 id="unsaved-changes-title">存在未保存内容</h2>
        <p>{message}</p>
        <div className="confirm-dialog__actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            继续编辑
          </button>
          <button className="danger-button" onClick={onConfirm} type="button">
            放弃更改
          </button>
        </div>
      </section>
    </div>
  );
}
