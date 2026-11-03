import type { RequirementPriority, RequirementStatus } from './requirement-api';

export interface RequirementFormValues {
  readonly acceptanceCriteria: string;
  readonly description: string;
  readonly priority: RequirementPriority;
  readonly status: RequirementStatus;
  readonly title: string;
}

export interface RequirementFormErrors {
  readonly acceptanceCriteria?: string;
  readonly description?: string;
  readonly priority?: string;
  readonly status?: string;
  readonly title?: string;
}

const priorities: readonly RequirementPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
const statuses: readonly RequirementStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'PENDING_ACCEPTANCE',
  'COMPLETED',
  'REJECTED',
];

export function validateRequirementForm(values: RequirementFormValues): RequirementFormErrors {
  const errors: {
    acceptanceCriteria?: string;
    description?: string;
    priority?: string;
    status?: string;
    title?: string;
  } = {};
  const title = values.title.trim();
  const acceptanceCriteria = values.acceptanceCriteria.trim();

  if (!title) {
    errors.title = '请输入需求标题。';
  } else if (title.length > 100) {
    errors.title = '需求标题不能超过 100 个字符。';
  }

  if (values.description.length > 5000) {
    errors.description = '需求描述不能超过 5000 个字符。';
  }

  if (!acceptanceCriteria) {
    errors.acceptanceCriteria = '请填写至少一条验收标准。';
  } else if (acceptanceCriteria.length > 5000) {
    errors.acceptanceCriteria = '验收标准不能超过 5000 个字符。';
  }

  if (!priorities.includes(values.priority)) {
    errors.priority = '请选择有效的需求优先级。';
  }

  if (!statuses.includes(values.status)) {
    errors.status = '请选择有效的需求状态。';
  }

  return errors;
}

export function hasRequirementFormErrors(errors: RequirementFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function hasUnsavedRequirementChanges(
  original: RequirementFormValues,
  current: RequirementFormValues,
): boolean {
  return (
    original.title !== current.title ||
    original.description !== current.description ||
    original.acceptanceCriteria !== current.acceptanceCriteria ||
    original.priority !== current.priority ||
    original.status !== current.status
  );
}
