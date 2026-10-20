import { describe, expect, it } from 'vitest';

import { getTaskPriorityLabel, getTaskStatusLabel } from './task-presentation';

describe('task presentation', () => {
  it('maps BACKLOG to Chinese', () => {
    expect(getTaskStatusLabel('BACKLOG')).toBe('待规划');
  });

  it('maps the complete task status set', () => {
    expect(getTaskStatusLabel('TODO')).toBe('待开始');
    expect(getTaskStatusLabel('IN_PROGRESS')).toBe('进行中');
    expect(getTaskStatusLabel('PENDING_REVIEW')).toBe('待审核');
    expect(getTaskStatusLabel('COMPLETED')).toBe('已完成');
    expect(getTaskStatusLabel('BLOCKED')).toBe('已阻塞');
  });

  it('falls back safely for unknown status and priority values', () => {
    expect(getTaskStatusLabel('UNKNOWN')).toBe('UNKNOWN');
    expect(getTaskPriorityLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});
