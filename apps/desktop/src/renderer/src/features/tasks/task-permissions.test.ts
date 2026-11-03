import { describe, expect, it } from 'vitest';

import { canEditTaskDetails, canReassignTask } from './task-permissions';

describe('P3 task permissions', () => {
  it('负责人和管理员可以完整编辑任意任务', () => {
    expect(canEditTaskDetails('OWNER', 'member-1', 'owner-1')).toBe(true);
    expect(canEditTaskDetails('ADMIN', 'member-1', 'admin-1')).toBe(true);
  });

  it('普通成员只能完整编辑自己负责的任务', () => {
    expect(canEditTaskDetails('MEMBER', 'member-1', 'member-1')).toBe(true);
    expect(canEditTaskDetails('MEMBER', 'member-2', 'member-1')).toBe(false);
    expect(canEditTaskDetails('MEMBER', null, 'member-1')).toBe(false);
  });

  it('观察者不能完整编辑或调整负责人', () => {
    expect(canEditTaskDetails('OBSERVER', 'observer-1', 'observer-1')).toBe(false);
    expect(canReassignTask('OBSERVER')).toBe(false);
    expect(canReassignTask('MEMBER')).toBe(true);
  });
});
