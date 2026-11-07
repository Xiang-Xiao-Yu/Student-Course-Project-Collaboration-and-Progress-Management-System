import { describe, expect, it, vi } from 'vitest';

import {
  canTransitionTaskStatus,
  formatTaskDueDate,
  getTaskPriorityLabel,
  getTaskStatusActionLabel,
  getTaskStatusLabel,
  getTaskStatusTransitions,
} from './task-presentation';

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

  it('exposes legal P3 task transitions and action labels', () => {
    expect(getTaskStatusTransitions('TODO')).toEqual(['IN_PROGRESS', 'BLOCKED']);
    expect(canTransitionTaskStatus('PENDING_REVIEW', 'COMPLETED')).toBe(true);
    expect(canTransitionTaskStatus('PENDING_REVIEW', 'IN_PROGRESS')).toBe(false);
    expect(getTaskStatusActionLabel('COMPLETED', 'IN_PROGRESS')).toBe('重新打开任务');
  });

  it('任务截止日期在非上海系统时区仍按上海日历日显示', () => {
    vi.stubEnv('TZ', 'UTC');
    try {
      expect(formatTaskDueDate('2026-11-06T20:00:00.000Z')).toBe('2026年11月7日');
      expect(formatTaskDueDate(null)).toBe('未设置');
      expect(formatTaskDueDate('invalid')).toBe('日期无效');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
