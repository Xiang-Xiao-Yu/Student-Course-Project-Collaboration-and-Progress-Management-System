import { describe, expect, it } from 'vitest';

import {
  formToCreateTaskInput,
  hasTaskFormErrors,
  hasUnsavedTaskChanges,
  parseTaskTags,
  validateTaskForm,
} from './task-validation';

const validTask = {
  assigneeId: 'member-1',
  description: '实现任务看板',
  dueDate: '2026-11-15',
  estimatedHours: '4.5',
  priority: 'HIGH' as const,
  requirementId: 'requirement-1',
  tagNames: 'backend, urgent',
  title: '任务看板',
};

describe('P3 task validation', () => {
  it('正常场景接受完整任务数据并规范化标签', () => {
    expect(validateTaskForm(validTask)).toEqual({});
    expect(parseTaskTags('backend, urgent， frontend')).toEqual(['backend', 'urgent', 'frontend']);
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
      tagNames: 'x'.repeat(51),
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
});
