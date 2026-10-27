import type { TaskTransitionDialogMode, TaskTransitionValues } from './task-status-flow';

interface TaskStatusTransitionDialogProps {
  readonly error: string | null;
  readonly isPending: boolean;
  readonly mode: TaskTransitionDialogMode;
  readonly onCancel: () => void;
  readonly onChange: (values: TaskTransitionValues) => void;
  readonly onConfirm: () => void;
  readonly targetStatusLabel: string;
  readonly taskTitle: string;
  readonly values: TaskTransitionValues;
}

export function TaskStatusTransitionDialog({
  error,
  isPending,
  mode,
  onCancel,
  onChange,
  onConfirm,
  targetStatusLabel,
  taskTitle,
  values,
}: TaskStatusTransitionDialogProps) {
  const isCompletion = mode === 'completion';

  return (
    <div className="confirm-backdrop">
      <section
        aria-labelledby="task-status-dialog-title"
        aria-modal="true"
        className="confirm-dialog task-status-dialog"
        role="dialog"
      >
        <h2 id="task-status-dialog-title">
          {isCompletion ? `提交到“${targetStatusLabel}”` : '重新打开任务'}
        </h2>
        <p>{taskTitle}</p>
        <label className="form-field confirm-dialog__field">
          <span>{isCompletion ? '完成说明' : '重新打开原因'}</span>
          <textarea
            disabled={isPending}
            maxLength={isCompletion ? 5000 : 2000}
            onChange={(event) =>
              onChange({
                ...values,
                ...(isCompletion
                  ? { completionNote: event.target.value }
                  : { reopenReason: event.target.value }),
              })
            }
            rows={4}
            value={isCompletion ? values.completionNote : values.reopenReason}
          />
          {error ? <small>{error}</small> : null}
        </label>
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
            className="primary-button confirm-primary"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? '正在提交...' : isCompletion ? '确认提交' : '确认重新打开'}
          </button>
        </div>
      </section>
    </div>
  );
}
