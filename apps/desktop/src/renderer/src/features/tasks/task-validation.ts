import type { CreateTaskInput, TaskDto, TaskPriority, UpdateTaskInput } from './task-api';

export interface TaskFormValues {
  readonly assigneeId: string;
  readonly description: string;
  readonly dueDate: string;
  readonly estimatedHours: string;
  readonly priority: TaskPriority;
  readonly requirementId: string;
  readonly tagNames: readonly string[];
  readonly title: string;
}

export interface TaskFormErrors {
  readonly assigneeId?: string;
  readonly description?: string;
  readonly dueDate?: string;
  readonly estimatedHours?: string;
  readonly priority?: string;
  readonly requirementId?: string;
  readonly tagNames?: string;
  readonly title?: string;
}

const priorities: readonly TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];

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

export function normalizeTaskTags(tags: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of tags) {
    const tag = value.trim();

    if (tag && !seen.has(tag)) {
      normalized.push(tag);
      seen.add(tag);
    }
  }

  return normalized;
}

export function validateTaskForm(values: TaskFormValues): TaskFormErrors {
  const errors: {
    assigneeId?: string;
    description?: string;
    dueDate?: string;
    estimatedHours?: string;
    priority?: string;
    requirementId?: string;
    tagNames?: string;
    title?: string;
  } = {};
  const title = values.title.trim();
  const tags = normalizeTaskTags(values.tagNames);

  if (!title) {
    errors.title = '请输入任务标题。';
  } else if (title.length > 100) {
    errors.title = '任务标题不能超过 100 个字符。';
  }

  if (values.description.length > 5000) {
    errors.description = '任务描述不能超过 5000 个字符。';
  }

  if (!priorities.includes(values.priority)) {
    errors.priority = '请选择有效的任务优先级。';
  }

  if (values.dueDate && !isValidDateInput(values.dueDate)) {
    errors.dueDate = '请输入有效的截止日期。';
  }

  if (values.estimatedHours) {
    if (!/^\d+(\.\d{1,2})?$/.test(values.estimatedHours)) {
      errors.estimatedHours = '预估工时最多保留两位小数。';
    } else {
      const hours = Number(values.estimatedHours);

      if (!Number.isFinite(hours) || hours < 0 || hours > 10_000) {
        errors.estimatedHours = '预估工时必须在 0 到 10000 之间。';
      }
    }
  }

  if (tags.length > 20) {
    errors.tagNames = '任务标签最多 20 个。';
  } else if (tags.some((tag) => tag.length > 50)) {
    errors.tagNames = '每个任务标签不能超过 50 个字符。';
  }

  return errors;
}

export function hasTaskFormErrors(errors: TaskFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function taskToForm(task: TaskDto): TaskFormValues {
  return {
    assigneeId: task.assigneeId ?? '',
    description: task.description ?? '',
    dueDate: task.dueDate?.slice(0, 10) ?? '',
    estimatedHours: task.estimatedHours === null ? '' : String(task.estimatedHours),
    priority: task.priority,
    requirementId: task.requirementId ?? '',
    tagNames: [...task.tagNames],
    title: task.title,
  };
}

export function hasUnsavedTaskChanges(original: TaskFormValues, current: TaskFormValues): boolean {
  const tagsChanged =
    original.tagNames.length !== current.tagNames.length ||
    original.tagNames.some((tag, index) => tag !== current.tagNames[index]);

  return (
    original.assigneeId !== current.assigneeId ||
    original.description !== current.description ||
    original.dueDate !== current.dueDate ||
    original.estimatedHours !== current.estimatedHours ||
    original.priority !== current.priority ||
    original.requirementId !== current.requirementId ||
    tagsChanged ||
    original.title !== current.title
  );
}

export function formToCreateTaskInput(values: TaskFormValues): CreateTaskInput {
  const tags = normalizeTaskTags(values.tagNames);
  const description = values.description.trim();
  const estimatedHours = values.estimatedHours ? Number(values.estimatedHours) : undefined;

  return {
    ...(values.assigneeId ? { assigneeId: values.assigneeId } : {}),
    ...(description ? { description } : {}),
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    ...(estimatedHours === undefined ? {} : { estimatedHours }),
    priority: values.priority,
    ...(values.requirementId ? { requirementId: values.requirementId } : {}),
    ...(tags.length > 0 ? { tagNames: tags } : {}),
    title: values.title.trim(),
  };
}

export function formToUpdateTaskInput(values: TaskFormValues): UpdateTaskInput {
  const createInput = formToCreateTaskInput(values);

  return {
    ...createInput,
    description: values.description.trim(),
    tagNames: normalizeTaskTags(values.tagNames),
  };
}
