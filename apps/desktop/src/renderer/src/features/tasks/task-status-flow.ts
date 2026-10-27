import { canTransitionTaskStatus, getTaskStatusLabel } from './task-presentation';

export type TaskTransitionDialogMode = 'completion' | 'reopen';

export type TaskTransitionDecision =
  | {
      readonly initialValue: string;
      readonly mode: TaskTransitionDialogMode;
      readonly type: 'dialog';
    }
  | { readonly type: 'direct' }
  | { readonly message: string; readonly type: 'error' };

export interface TaskTransitionValues {
  readonly completionNote: string;
  readonly reopenReason: string;
}

export function decideTaskStatusTransition(
  currentStatus: string,
  targetStatus: string,
  existingCompletionNote: string | null,
  canReview: boolean,
): TaskTransitionDecision {
  if (currentStatus === targetStatus) {
    return { message: '任务已处于目标状态。', type: 'error' };
  }

  if (!canTransitionTaskStatus(currentStatus, targetStatus)) {
    return {
      message: `任务不能从“${getTaskStatusLabel(currentStatus)}”直接转为“${getTaskStatusLabel(
        targetStatus,
      )}”。`,
      type: 'error',
    };
  }

  if (targetStatus === 'PENDING_REVIEW') {
    return {
      initialValue: existingCompletionNote ?? '',
      mode: 'completion',
      type: 'dialog',
    };
  }

  if (targetStatus === 'COMPLETED') {
    if (!canReview) {
      return { message: '只有项目负责人或平台管理员可以审核通过任务。', type: 'error' };
    }

    return {
      initialValue: existingCompletionNote ?? '',
      mode: 'completion',
      type: 'dialog',
    };
  }

  if (currentStatus === 'COMPLETED' && targetStatus === 'IN_PROGRESS') {
    return { initialValue: '', mode: 'reopen', type: 'dialog' };
  }

  return { type: 'direct' };
}

export function validateTaskTransitionValues(
  mode: TaskTransitionDialogMode,
  values: TaskTransitionValues,
): string | null {
  if (mode === 'completion') {
    const note = values.completionNote.trim();

    if (!note) {
      return '请填写任务完成说明。';
    }

    if (note.length > 5000) {
      return '任务完成说明不能超过 5000 个字符。';
    }
  }

  if (mode === 'reopen') {
    const reason = values.reopenReason.trim();

    if (!reason) {
      return '请填写重新打开任务的原因。';
    }

    if (reason.length > 2000) {
      return '重新打开原因不能超过 2000 个字符。';
    }
  }

  return null;
}
