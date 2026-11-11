import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import {
  buildDashboardChartData,
  type DashboardChartStatusEvent,
  type DashboardChartTask,
} from './dashboard-analytics';

const DAY = 24 * 60 * 60 * 1000;

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY);
}

function statusEvent(
  targetId: string,
  createdAt: Date,
  before: string,
  after: string,
): DashboardChartStatusEvent {
  return {
    action: 'TASK_STATUS_CHANGED',
    afterValue: JSON.stringify({ status: after }),
    beforeValue: JSON.stringify({ status: before }),
    createdAt,
    targetId,
  };
}

describe('dashboard chart analytics', () => {
  it('aggregates 10,000 tasks without repeated full scans or date formatter creation', () => {
    const now = new Date('2026-11-11T08:00:00.000Z');
    const tasks: DashboardChartTask[] = Array.from({ length: 10_000 }, (_, index) => ({
      completedAt: index % 2 === 0 ? addDays(now, -(index % 14)) : null,
      createdAt: addDays(now, -(index % 30)),
      id: `task-${index}`,
    }));
    const events: DashboardChartStatusEvent[] = tasks
      .slice(0, 1_000)
      .map((task, index) =>
        statusEvent(task.id, addDays(now, -(index % 14)), 'PENDING_REVIEW', 'COMPLETED'),
      );
    const startedAt = performance.now();
    const result = buildDashboardChartData(tasks, events, addDays(now, -30), now, now);
    const elapsed = performance.now() - startedAt;

    expect(result.completionTrend).toHaveLength(14);
    expect(result.burndown).toHaveLength(31);
    expect(elapsed).toBeLessThan(1_000);
  });

  it('preserves completion history after reopening a task', () => {
    const now = new Date('2026-11-11T08:00:00.000Z');
    const task: DashboardChartTask = {
      completedAt: null,
      createdAt: addDays(now, -3),
      id: 'reopened-task',
    };
    const result = buildDashboardChartData(
      [task],
      [
        statusEvent(task.id, addDays(now, -1), 'IN_PROGRESS', 'COMPLETED'),
        statusEvent(task.id, now, 'COMPLETED', 'IN_PROGRESS'),
      ],
      addDays(now, -4),
      addDays(now, -2),
      now,
    );
    const yesterday = result.burndown.at(-2);
    const today = result.burndown.at(-1);

    expect(yesterday).toMatchObject({ completedTasks: 1, remainingTasks: 0 });
    expect(today).toMatchObject({ remainingTasks: 1 });
    expect(result.completionTrend.at(-2)?.completed).toBe(1);
  });

  it('extends the actual burndown to today after the planned end date', () => {
    const now = new Date('2026-11-11T08:00:00.000Z');
    const task: DashboardChartTask = {
      completedAt: now,
      createdAt: addDays(now, -3),
      id: 'late-completed-task',
    };
    const result = buildDashboardChartData([task], [], addDays(now, -4), addDays(now, -2), now);

    expect(result.burndown.at(-1)).toMatchObject({
      completedTasks: 1,
      date: '2026-11-11',
      remainingTasks: 0,
    });
  });

  it.each(['COMPLETED', 'IN_PROGRESS', 'TODO'])(
    'retains historical work after deleting a %s task',
    (status) => {
      const now = new Date('2026-11-11T08:00:00.000Z');
      const completed = status !== 'TODO';
      const events = completed
        ? [statusEvent('deleted', addDays(now, -1), 'PENDING_REVIEW', 'COMPLETED')]
        : [];
      if (status === 'IN_PROGRESS') {
        events.push(statusEvent('deleted', now, 'COMPLETED', 'IN_PROGRESS'));
      }
      const deletion = {
        ...statusEvent('deleted', now, status, status),
        action: 'TASK_DELETED',
        beforeValue: JSON.stringify({
          id: 'deleted',
          createdAt: addDays(now, -3).toISOString(),
          completedAt: status === 'COMPLETED' ? addDays(now, -1).toISOString() : null,
          status,
        }),
      };
      const result = buildDashboardChartData(
        [{ id: 'live', createdAt: addDays(now, -3), completedAt: null }],
        [...events, deletion],
        addDays(now, -4),
        addDays(now, 1),
        now,
      );
      expect(result.burndown.at(-3)?.remainingTasks).toBe(2);
      expect(result.burndown.at(-2)).toMatchObject({
        completedTasks: completed ? 1 : 0,
        remainingTasks: completed ? 1 : 2,
      });
      expect(result.completionTrend.at(-2)?.completed).toBe(completed ? 1 : 0);
      expect(result.burndown.at(-1)?.remainingTasks).toBe(1);
    },
  );

  it('ignores corrupt deletion snapshots without changing live task statistics', () => {
    const now = new Date('2026-11-11T08:00:00.000Z');
    const task = { id: 'live', createdAt: addDays(now, -3), completedAt: null };
    const result = buildDashboardChartData(
      [task],
      [
        '{',
        'null',
        JSON.stringify({ id: 'broken', createdAt: 'invalid', completedAt: null, status: 'TODO' }),
      ].map((beforeValue) => ({
        action: 'TASK_DELETED',
        targetId: 'broken',
        createdAt: now,
        beforeValue,
        afterValue: null,
      })),
      addDays(now, -4),
      now,
      now,
    );
    expect(result.burndown.at(-1)?.remainingTasks).toBe(1);
    expect(result.completionTrend.at(-1)?.cumulativeCompleted).toBe(0);
  });
});
