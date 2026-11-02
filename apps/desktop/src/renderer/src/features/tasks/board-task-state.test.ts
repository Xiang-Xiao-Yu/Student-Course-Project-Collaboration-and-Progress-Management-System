import { describe, expect, it } from 'vitest';

import { applyBoardTaskMutation } from './board-task-state';
import type { TaskDto } from './task-api';

function task(id: string, status: TaskDto['status']): TaskDto {
  return {
    assigneeId: null,
    completedAt: null,
    completionNote: null,
    createdAt: '2026-11-03T00:00:00.000Z',
    createdById: 'owner-1',
    description: null,
    dueDate: null,
    estimatedHours: null,
    id,
    priority: 'MEDIUM',
    projectId: 'project-1',
    rejectionReason: null,
    requirementId: null,
    status,
    tagNames: [],
    title: id,
    updatedAt: '2026-11-03T00:00:00.000Z',
  };
}

describe('P3 board concurrent mutations', () => {
  it('创建任务与状态更新以任意响应顺序应用后结果一致', () => {
    const original = task('task-a', 'BACKLOG');
    const updated = task('task-a', 'IN_PROGRESS');
    const created = task('task-b', 'BACKLOG');

    const createThenUpdate = applyBoardTaskMutation(
      applyBoardTaskMutation([original], { task: created, type: 'created' }),
      { task: updated, type: 'updated' },
    );
    const updateThenCreate = applyBoardTaskMutation(
      applyBoardTaskMutation([original], { task: updated, type: 'updated' }),
      { task: created, type: 'created' },
    );

    expect(createThenUpdate).toEqual([updated, created]);
    expect(updateThenCreate).toEqual(createThenUpdate);
  });

  it('删除与更新按任意响应顺序不会复活已删除任务', () => {
    const original = task('task-a', 'BACKLOG');
    const updated = task('task-a', 'IN_PROGRESS');

    const updateThenDelete = applyBoardTaskMutation(
      applyBoardTaskMutation([original], { task: updated, type: 'updated' }),
      { taskId: original.id, type: 'deleted' },
    );
    const deleteThenUpdate = applyBoardTaskMutation(
      applyBoardTaskMutation([original], { taskId: original.id, type: 'deleted' }),
      { task: updated, type: 'updated' },
    );

    expect(updateThenDelete).toEqual([]);
    expect(deleteThenUpdate).toEqual([]);
  });
});
