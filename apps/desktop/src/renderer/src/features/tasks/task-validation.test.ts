import { describe, expect, it } from 'vitest';

import {
  formToCreateTaskInput,
  formToUpdateTaskInput,
  hasTaskFormErrors,
  hasUnsavedTaskChanges,
  taskToForm,
  validateTaskForm,
} from './task-validation';

const validTask = {
  assigneeId: 'member-1',
  description: '实现任务看板',
  dueDate: '2026-11-15',
  estimatedHours: '4.5',
  priority: 'HIGH' as const,
  requirementId: 'requirement-1',
  tagNames: ['backend', 'urgent'],
  title: '任务看板',
};

describe('P3 task validation', () => {
  it('正常场景接受完整任务数据并规范化标签', () => {
    expect(validateTaskForm(validTask)).toEqual({});
    expect(formToCreateTaskInput(validTask)).toMatchObject({
      estimatedHours: 4.5,
      tagNames: ['backend', 'urgent'],
    });
  });

  it('边界场景拒绝无效日期、工时和标签', () => {
    const errors = validateTaskForm({
      ...validTask,
      dueDate: '2026-02-30',
      estimatedHours: '1.234',
      tagNames: ['x'.repeat(51)],
    });

    expect(errors.dueDate).toBe('请输入有效的截止日期。');
    expect(errors.estimatedHours).toBe('预估工时最多保留两位小数。');
    expect(errors.tagNames).toBe('每个任务标签不能超过 50 个字符。');
    expect(hasTaskFormErrors(errors)).toBe(true);
  });

  it('失败场景拒绝空标题并识别未保存修改', () => {
    const errors = validateTaskForm({ ...validTask, title: ' ' });

    expect(errors.title).toBe('请输入任务标题。');
    expect(hasUnsavedTaskChanges(validTask, { ...validTask, title: '新标题' })).toBe(true);
  });

  it('边界场景只改标题时保留含逗号的单个标签', () => {
    const task = {
      assigneeId: null,
      completedAt: null,
      completionNote: null,
      createdAt: '2026-11-03T00:00:00.000Z',
      createdById: 'owner-1',
      description: null,
      dueDate: null,
      estimatedHours: null,
      id: 'task-1',
      priority: 'MEDIUM' as const,
      projectId: 'project-1',
      rejectionReason: null,
      requirementId: null,
      status: 'BACKLOG' as const,
      tagNames: ['api,v2'],
      title: '旧标题',
      updatedAt: '2026-11-03T00:00:00.000Z',
    };
    const form = taskToForm(task);
    const input = formToUpdateTaskInput({ ...form, title: '新标题' });

    expect(form.tagNames).toEqual(['api,v2']);
    expect(input.tagNames).toEqual(['api,v2']);
  });

  it('含时区的截止时间编辑回填保持上海日历日', () => {
    const task = {
      assigneeId: null,
      completedAt: null,
      completionNote: null,
      createdAt: '2026-11-03T00:00:00.000Z',
      createdById: 'owner-1',
      description: null,
      dueDate: '2026-11-06T20:00:00.000Z',
      estimatedHours: null,
      id: 'task-1',
      priority: 'MEDIUM' as const,
      projectId: 'project-1',
      rejectionReason: null,
      requirementId: null,
      status: 'BACKLOG' as const,
      tagNames: [],
      title: '截止时间测试',
      updatedAt: '2026-11-03T00:00:00.000Z',
    };
    const form = taskToForm(task);

    expect(form.dueDate).toBe('2026-11-07');
    expect(formToUpdateTaskInput({ ...form, title: '更新标题' }).dueDate).toBe('2026-11-07');
  });
});
