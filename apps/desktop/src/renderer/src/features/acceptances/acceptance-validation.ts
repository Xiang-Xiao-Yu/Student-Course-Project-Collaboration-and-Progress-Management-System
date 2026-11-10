import type {
  AcceptanceDto,
  AcceptanceResult,
  CreateAcceptanceInput,
  UpdateAcceptanceInput,
} from './acceptance-api';

export interface AcceptanceFormValues {
  readonly acceptanceDate: string;
  readonly failureReason: string;
  readonly goal: string;
  readonly participantIds: readonly string[];
  readonly result: AcceptanceResult;
  readonly stageName: string;
  readonly standards: string;
}

export interface AcceptanceFormErrors {
  readonly acceptanceDate?: string;
  readonly failureReason?: string;
  readonly goal?: string;
  readonly participantIds?: string;
  readonly result?: string;
  readonly stageName?: string;
  readonly standards?: string;
}

function isValidDateInput(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function acceptanceToForm(acceptance: AcceptanceDto): AcceptanceFormValues {
  return {
    acceptanceDate: acceptance.acceptanceDate?.slice(0, 10) ?? '',
    failureReason: acceptance.failureReason ?? '',
    goal: acceptance.goal ?? '',
    participantIds: acceptance.participants.map((participant) => participant.userId),
    result: acceptance.result,
    stageName: acceptance.stageName,
    standards: acceptance.standards,
  };
}

export function validateAcceptanceForm(values: AcceptanceFormValues): AcceptanceFormErrors {
  const errors: {
    acceptanceDate?: string;
    failureReason?: string;
    goal?: string;
    participantIds?: string;
    result?: string;
    stageName?: string;
    standards?: string;
  } = {};
  const stageName = values.stageName.trim();
  const standards = values.standards.trim();

  if (!stageName) {
    errors.stageName = '请输入验收阶段名称。';
  } else if (stageName.length > 100) {
    errors.stageName = '验收阶段名称不能超过 100 个字符。';
  }

  if (values.goal.length > 1000) {
    errors.goal = '验收目标不能超过 1000 个字符。';
  }

  if (!standards) {
    errors.standards = '请输入验收标准。';
  } else if (standards.length > 5000) {
    errors.standards = '验收标准不能超过 5000 个字符。';
  }

  if (values.acceptanceDate && !isValidDateInput(values.acceptanceDate)) {
    errors.acceptanceDate = '请输入有效的验收日期。';
  }

  if (!['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED'].includes(values.result)) {
    errors.result = '请选择有效的验收结果。';
  }

  if (values.participantIds.length === 0) {
    errors.participantIds = '请至少选择一名参与人员。';
  }

  if (values.result === 'FAILED' && !values.failureReason.trim()) {
    errors.failureReason = '验收未通过时必须填写原因。';
  }

  if (values.failureReason.length > 5000) {
    errors.failureReason = '未通过原因不能超过 5000 个字符。';
  }

  return errors;
}

export function hasAcceptanceFormErrors(errors: AcceptanceFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function hasUnsavedAcceptanceChanges(
  original: AcceptanceFormValues,
  current: AcceptanceFormValues,
): boolean {
  return (
    original.acceptanceDate !== current.acceptanceDate ||
    original.failureReason !== current.failureReason ||
    original.goal !== current.goal ||
    original.participantIds.length !== current.participantIds.length ||
    original.participantIds.some((id, index) => id !== current.participantIds[index]) ||
    original.result !== current.result ||
    original.stageName !== current.stageName ||
    original.standards !== current.standards
  );
}

export function formToCreateAcceptanceInput(values: AcceptanceFormValues): CreateAcceptanceInput {
  const failureReason = values.result === 'FAILED' ? values.failureReason.trim() : '';
  const goal = values.goal.trim();

  return {
    ...(values.acceptanceDate ? { acceptanceDate: values.acceptanceDate } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(goal ? { goal } : {}),
    participantIds: [...values.participantIds],
    result: values.result,
    stageName: values.stageName.trim(),
    standards: values.standards.trim(),
  };
}

export function formToUpdateAcceptanceInput(values: AcceptanceFormValues): UpdateAcceptanceInput {
  return {
    ...formToCreateAcceptanceInput(values),
    failureReason: values.result === 'FAILED' ? values.failureReason.trim() : '',
    goal: values.goal.trim(),
  };
}
