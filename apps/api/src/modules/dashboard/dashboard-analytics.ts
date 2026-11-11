import {
  addDays,
  businessDayKey,
  differenceInDays,
  enumerateDayKeys,
} from '../../common/time/business-calendar';
import type { TaskStatus } from '../tasks/task.constants';
import type {
  DashboardBurndownPoint,
  DashboardCompletionTrendPoint,
} from './interfaces/dashboard-response';

const COMPLETION_TREND_DAYS = 14;
const BURNDOWN_MAX_DAYS = 366;
const UPCOMING_TASK_DAYS = 7;

export interface DashboardChartTask {
  completedAt: Date | null;
  createdAt: Date;
  id: string;
}

export interface DashboardChartStatusEvent {
  afterValue: string | null;
  beforeValue: string | null;
  createdAt: Date;
  targetId: string;
}

export interface DashboardChartData {
  burndown: DashboardBurndownPoint[];
  completionTrend: DashboardCompletionTrendPoint[];
}

function addCount(map: Map<string, number>, day: string, delta: number): void {
  map.set(day, (map.get(day) ?? 0) + delta);
}

function parseStatus(value: string | null): TaskStatus | null {
  if (value === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'status' in parsed &&
      typeof parsed.status === 'string'
    ) {
      return parsed.status as TaskStatus;
    }
  } catch {
    return null;
  }

  return null;
}

export function buildDashboardChartData(
  tasks: DashboardChartTask[],
  statusEvents: DashboardChartStatusEvent[],
  projectStartDate: Date | null,
  projectEndDate: Date | null,
  now: Date,
): DashboardChartData {
  const eventsByTask = new Map<string, DashboardChartStatusEvent[]>();
  const totalCompletionCounts = new Map<string, number>();
  const remainingDeltas = new Map<string, number>();

  for (const event of statusEvents) {
    const events = eventsByTask.get(event.targetId);
    if (events) {
      events.push(event);
    } else {
      eventsByTask.set(event.targetId, [event]);
    }
  }

  for (const task of tasks) {
    addCount(remainingDeltas, businessDayKey(task.createdAt), 1);
    const events = eventsByTask.get(task.id) ?? [];
    let hasCompletionEvent = false;

    for (const event of events) {
      const beforeStatus = parseStatus(event.beforeValue);
      const afterStatus = parseStatus(event.afterValue);
      if (beforeStatus !== 'COMPLETED' && afterStatus === 'COMPLETED') {
        hasCompletionEvent = true;
        addCount(totalCompletionCounts, businessDayKey(event.createdAt), 1);
        addCount(remainingDeltas, businessDayKey(event.createdAt), -1);
      } else if (beforeStatus === 'COMPLETED' && afterStatus !== 'COMPLETED') {
        addCount(remainingDeltas, businessDayKey(event.createdAt), 1);
      }
    }

    if (!hasCompletionEvent && task.completedAt !== null) {
      const completionDay = businessDayKey(task.completedAt);
      addCount(totalCompletionCounts, completionDay, 1);
      addCount(remainingDeltas, completionDay, -1);
    }
  }

  return {
    burndown: buildBurndown(
      tasks,
      remainingDeltas,
      totalCompletionCounts,
      projectStartDate,
      projectEndDate,
      now,
    ),
    completionTrend: buildCompletionTrend(totalCompletionCounts, now),
  };
}

function buildCompletionTrend(
  completionCounts: Map<string, number>,
  now: Date,
): DashboardCompletionTrendPoint[] {
  const todayKey = businessDayKey(now);
  const startKey = businessDayKey(addDays(now, -(COMPLETION_TREND_DAYS - 1)));
  let cumulativeCompleted = 0;

  for (const [day, count] of completionCounts) {
    if (day < startKey) {
      cumulativeCompleted += count;
    }
  }

  return enumerateDayKeys(startKey, todayKey, COMPLETION_TREND_DAYS).map((day) => {
    const completed = completionCounts.get(day) ?? 0;
    cumulativeCompleted += completed;
    return {
      completed,
      cumulativeCompleted,
      date: day,
    };
  });
}

function buildBurndown(
  tasks: DashboardChartTask[],
  remainingDeltas: Map<string, number>,
  completionCounts: Map<string, number>,
  projectStartDate: Date | null,
  projectEndDate: Date | null,
  now: Date,
): DashboardBurndownPoint[] {
  const todayKey = businessDayKey(now);
  const earliestTaskDate = tasks.reduce<Date | null>(
    (earliest, task) =>
      earliest === null || task.createdAt < earliest ? task.createdAt : earliest,
    null,
  );
  const projectStartKey = businessDayKey(
    projectStartDate ?? earliestTaskDate ?? addDays(now, -(COMPLETION_TREND_DAYS - 1)),
  );
  const startKey = projectStartKey > todayKey ? todayKey : projectStartKey;
  const plannedEndKey = businessDayKey(projectEndDate ?? addDays(now, UPCOMING_TASK_DAYS));
  const plannedDuration = Math.max(1, differenceInDays(startKey, plannedEndKey));
  let remainingTasks = 0;

  for (const [day, delta] of remainingDeltas) {
    if (day < startKey) {
      remainingTasks += delta;
    }
  }

  return enumerateDayKeys(startKey, todayKey, BURNDOWN_MAX_DAYS).map((day, index) => {
    remainingTasks = Math.max(0, remainingTasks + (remainingDeltas.get(day) ?? 0));
    const idealRemainingTasks = Math.max(
      0,
      Math.round(tasks.length * (1 - Math.min(1, index / plannedDuration)) * 100) / 100,
    );

    return {
      completedTasks: completionCounts.get(day) ?? 0,
      date: day,
      idealRemainingTasks,
      remainingTasks,
    };
  });
}
