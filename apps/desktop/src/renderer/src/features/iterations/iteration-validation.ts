import type {
  CreateIterationInput,
  IterationDetailDto,
  UpdateIterationInput,
} from './iteration-api';

export interface IterationFormValues {
  readonly endDate: string;
  readonly goal: string;
  readonly name: string;
  readonly startDate: string;
}

export interface IterationFormErrors {
  readonly endDate?: string;
  readonly goal?: string;
  readonly name?: string;
  readonly startDate?: string;
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

export function validateIterationForm(values: IterationFormValues): IterationFormErrors {
  const errors: {
    endDate?: string;
    goal?: string;
    name?: string;
    startDate?: string;
  } = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = '请输入迭代名称。';
  } else if (name.length > 100) {
    errors.name = '迭代名称不能超过 100 个字符。';
  }

  if (values.goal.length > 1000) {
    errors.goal = '迭代目标不能超过 1000 个字符。';
  }

  if (!isValidDateInput(values.startDate)) {
    errors.startDate = '请输入有效的开始日期。';
  }

  if (!isValidDateInput(values.endDate)) {
    errors.endDate = '请输入有效的结束日期。';
  } else if (isValidDateInput(values.startDate) && values.endDate < values.startDate) {
    errors.endDate = '迭代结束日期不能早于开始日期。';
  }

  return errors;
}

export function hasIterationFormErrors(errors: IterationFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function iterationToForm(iteration: IterationDetailDto): IterationFormValues {
  return {
    endDate: iteration.endDate.slice(0, 10),
    goal: iteration.goal ?? '',
    name: iteration.name,
    startDate: iteration.startDate.slice(0, 10),
  };
}

export function hasUnsavedIterationChanges(
  original: IterationFormValues,
  current: IterationFormValues,
): boolean {
  return (
    original.endDate !== current.endDate ||
    original.goal !== current.goal ||
    original.name !== current.name ||
    original.startDate !== current.startDate
  );
}

export function formToCreateIterationInput(values: IterationFormValues): CreateIterationInput {
  const goal = values.goal.trim();

  return {
    endDate: values.endDate,
    ...(goal ? { goal } : {}),
    name: values.name.trim(),
    startDate: values.startDate,
  };
}

export function formToUpdateIterationInput(values: IterationFormValues): UpdateIterationInput {
  return {
    ...formToCreateIterationInput(values),
    goal: values.goal.trim(),
  };
}
