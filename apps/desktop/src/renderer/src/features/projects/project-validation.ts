import type { ProjectRole } from './project-api';

export interface ProjectFormValues {
  readonly description: string;
  readonly endDate: string;
  readonly name: string;
  readonly startDate: string;
}

export interface ProjectFormErrors {
  readonly description?: string;
  readonly endDate?: string;
  readonly name?: string;
  readonly startDate?: string;
}

export interface MemberInviteFormValues {
  readonly role: Exclude<ProjectRole, 'OWNER'>;
  readonly username: string;
}

export interface MemberInviteFormErrors {
  readonly role?: string;
  readonly username?: string;
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

export function validateProjectForm(values: ProjectFormValues): ProjectFormErrors {
  const errors: {
    description?: string;
    endDate?: string;
    name?: string;
    startDate?: string;
  } = {};
  const name = values.name.trim();

  if (name.length === 0) {
    errors.name = '请输入项目名称。';
  } else if (name.length > 100) {
    errors.name = '项目名称不能超过 100 个字符。';
  }

  if (values.description.length > 1000) {
    errors.description = '项目简介不能超过 1000 个字符。';
  }

  if (values.startDate && !isValidDateInput(values.startDate)) {
    errors.startDate = '请输入有效的开始日期。';
  }

  if (values.endDate && !isValidDateInput(values.endDate)) {
    errors.endDate = '请输入有效的结束日期。';
  }

  if (
    values.startDate &&
    values.endDate &&
    isValidDateInput(values.startDate) &&
    isValidDateInput(values.endDate) &&
    values.endDate < values.startDate
  ) {
    errors.endDate = '结束日期不能早于开始日期。';
  }

  return errors;
}

export function hasProjectFormErrors(errors: ProjectFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function validateDeleteConfirmation(
  projectName: string,
  confirmation: string,
): string | null {
  if (confirmation.trim() !== projectName) {
    return '输入的项目名称与当前项目不一致。';
  }

  return null;
}

export function validateMemberInviteForm(values: MemberInviteFormValues): MemberInviteFormErrors {
  const errors: { role?: string; username?: string } = {};
  const username = values.username.trim();

  if (username.length === 0) {
    errors.username = '请输入用户名。';
  } else if (username.length > 64) {
    errors.username = '用户名不能超过 64 个字符。';
  }

  if (values.role !== 'MEMBER' && values.role !== 'OBSERVER') {
    errors.role = '请选择成员角色。';
  }

  return errors;
}

export function hasMemberInviteFormErrors(errors: MemberInviteFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function hasUnsavedProjectChanges(
  original: ProjectFormValues,
  current: ProjectFormValues,
): boolean {
  return (
    original.name !== current.name ||
    original.description !== current.description ||
    original.startDate !== current.startDate ||
    original.endDate !== current.endDate
  );
}

export function canArchiveProject(hasUnsavedChanges: boolean): boolean {
  return !hasUnsavedChanges;
}
