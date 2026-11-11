import type {
  CreateMeetingActionInput,
  CreateMeetingInput,
  MeetingDto,
  UpdateMeetingInput,
} from './meeting-api';
import type { MeetingActionStatus } from './meeting-api';

export interface MeetingFormValues {
  readonly agenda: string;
  readonly decisions: string;
  readonly minutes: string;
  readonly participantIds: readonly string[];
  readonly scheduledAt: string;
  readonly title: string;
}

export interface MeetingFormErrors {
  readonly agenda?: string;
  readonly decisions?: string;
  readonly minutes?: string;
  readonly participantIds?: string;
  readonly scheduledAt?: string;
  readonly title?: string;
}

export interface MeetingActionFormValues {
  readonly assigneeId: string;
  readonly dueDate: string;
  readonly status: MeetingActionStatus;
  readonly title: string;
}

export interface MeetingActionFormErrors {
  readonly assigneeId?: string;
  readonly dueDate?: string;
  readonly status?: string;
  readonly title?: string;
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

function isValidLocalDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const datePart = `${match[1]}-${match[2]}-${match[3]}`;
  const hours = Number(match[4]);
  const minutes = Number(match[5]);

  return isValidDateInput(datePart) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function meetingToForm(meeting: MeetingDto): MeetingFormValues {
  return {
    agenda: meeting.agenda ?? '',
    decisions: meeting.decisions ?? '',
    minutes: meeting.minutes ?? '',
    participantIds: meeting.participants.map((participant) => participant.userId),
    scheduledAt: toMeetingDateTimeInput(meeting.scheduledAt),
    title: meeting.title,
  };
}

export function toMeetingDateTimeInput(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part: number) => String(part).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function validateMeetingForm(
  values: MeetingFormValues,
  options: { readonly requireDetails?: boolean } = {},
): MeetingFormErrors {
  const errors: {
    agenda?: string;
    decisions?: string;
    minutes?: string;
    participantIds?: string;
    scheduledAt?: string;
    title?: string;
  } = {};
  const title = values.title.trim();

  if (!title) {
    errors.title = '请输入会议主题。';
  } else if (title.length > 100) {
    errors.title = '会议主题不能超过 100 个字符。';
  }

  if (!isValidLocalDateTime(values.scheduledAt)) {
    errors.scheduledAt = '请输入有效的会议时间。';
  }

  if (values.agenda.length > 5000) {
    errors.agenda = '会议议程不能超过 5000 个字符。';
  }

  if (values.minutes.length > 5000) {
    errors.minutes = '会议纪要不能超过 5000 个字符。';
  }

  if (values.decisions.length > 5000) {
    errors.decisions = '会议决定不能超过 5000 个字符。';
  }

  if (options.requireDetails && values.participantIds.length === 0) {
    errors.participantIds = '请至少选择一名参会人员。';
  }

  return errors;
}

export function validateMeetingActionForm(
  values: MeetingActionFormValues,
  projectStartDate?: string | null,
): MeetingActionFormErrors {
  const errors: {
    assigneeId?: string;
    dueDate?: string;
    status?: string;
    title?: string;
  } = {};
  const title = values.title.trim();

  if (!title) {
    errors.title = '请输入行动项标题。';
  } else if (title.length > 100) {
    errors.title = '行动项标题不能超过 100 个字符。';
  }

  if (values.dueDate && !isValidDateInput(values.dueDate)) {
    errors.dueDate = '请输入有效的截止日期。';
  } else if (values.dueDate && projectStartDate && values.dueDate < projectStartDate.slice(0, 10)) {
    errors.dueDate = '行动项截止日期不能早于项目开始日期。';
  }

  if (!['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'].includes(values.status)) {
    errors.status = '请选择有效的行动项状态。';
  }

  return errors;
}

export function hasMeetingFormErrors(errors: MeetingFormErrors | MeetingActionFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function hasUnsavedMeetingChanges(
  original: MeetingFormValues,
  current: MeetingFormValues,
): boolean {
  return (
    original.agenda !== current.agenda ||
    original.decisions !== current.decisions ||
    original.minutes !== current.minutes ||
    original.participantIds.length !== current.participantIds.length ||
    original.participantIds.some((id, index) => id !== current.participantIds[index]) ||
    original.scheduledAt !== current.scheduledAt ||
    original.title !== current.title
  );
}

export function formToCreateMeetingInput(values: MeetingFormValues): CreateMeetingInput {
  const agenda = values.agenda.trim();

  return {
    ...(agenda ? { agenda } : {}),
    participantIds: [...values.participantIds],
    scheduledAt: new Date(values.scheduledAt).toISOString(),
    title: values.title.trim(),
  };
}

export function formToUpdateMeetingInput(values: MeetingFormValues): UpdateMeetingInput {
  return {
    agenda: values.agenda.trim(),
    decisions: values.decisions.trim(),
    minutes: values.minutes.trim(),
    participantIds: [...values.participantIds],
    scheduledAt: new Date(values.scheduledAt).toISOString(),
    title: values.title.trim(),
  };
}

export function formToCreateMeetingActionInput(
  values: MeetingActionFormValues,
): CreateMeetingActionInput {
  return {
    ...(values.assigneeId ? { assigneeId: values.assigneeId } : {}),
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    title: values.title.trim(),
  };
}
