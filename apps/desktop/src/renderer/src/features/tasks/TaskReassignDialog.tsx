import type { ProjectMemberDto } from '../projects/project-api';

interface TaskReassignDialogProps {
  readonly assigneeId: string;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly members: readonly ProjectMemberDto[];
  readonly onCancel: () => void;
  readonly onChange: (assigneeId: string) => void;
  readonly onConfirm: () => void;
  readonly taskTitle: string;
}

export function TaskReassignDialog({
  assigneeId,
  error,
  isPending,
  members,
  onCancel,
  onChange,
  onConfirm,
  taskTitle,
}: TaskReassignDialogProps) {
  return (
    <div className="confirm-backdrop">
      <section
        aria-labelledby="task-reassign-title"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
      >
        <h2 id="task-reassign-title">调整任务负责人</h2>
        <p>{taskTitle}</p>
        <label className="form-field confirm-dialog__field">
          <span>新负责人</span>
          <select
            disabled={isPending}
            onChange={(event) => onChange(event.target.value)}
            value={assigneeId}
          >
            <option value="">请选择项目成员</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.nickname} (@{member.username})
              </option>
            ))}
          </select>
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
            {isPending ? '正在保存...' : '确认调整'}
          </button>
        </div>
      </section>
    </div>
  );
}
