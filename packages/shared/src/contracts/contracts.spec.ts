import { describe, expect, it } from 'vitest';

import {
  API_BASE_PATH,
  API_ROUTE_CONTRACTS,
  REQUEST_VALIDATION_RULES,
  TASK_STATUS_TRANSITIONS,
  hasProjectPermission,
  isDateRangeValid,
  isTaskDueDateValid,
} from './index';

describe('shared P0 contracts', () => {
  it('keeps every API route under the versioned base path', () => {
    for (const route of Object.values(API_ROUTE_CONTRACTS)) {
      expect(route.path.startsWith(API_BASE_PATH)).toBe(true);
    }

    expect(API_ROUTE_CONTRACTS.health.access.type).toBe('PUBLIC');
    expect(API_ROUTE_CONTRACTS.projectsCreate.access.type).toBe('AUTHENTICATED');
    expect(API_ROUTE_CONTRACTS.tasksCreate.access).toEqual({
      permission: 'TASK_CREATE',
      type: 'PROJECT_PERMISSION',
    });
  });

  it('enforces read-only observer and member permissions', () => {
    expect(hasProjectPermission('OBSERVER', 'PROJECT_VIEW')).toBe(true);
    expect(hasProjectPermission('OBSERVER', 'TASK_CREATE')).toBe(false);
    expect(hasProjectPermission('MEMBER', 'TASK_CREATE')).toBe(true);
    expect(hasProjectPermission('MEMBER', 'PROJECT_DELETE')).toBe(false);
  });

  it('preserves the required task status transitions', () => {
    expect(TASK_STATUS_TRANSITIONS.TODO).toContain('IN_PROGRESS');
    expect(TASK_STATUS_TRANSITIONS.PENDING_REVIEW).toContain('COMPLETED');
    expect(TASK_STATUS_TRANSITIONS.COMPLETED).toContain('IN_PROGRESS');
  });

  it('validates dates and required length constraints', () => {
    expect(isDateRangeValid(new Date('2026-09-01'), new Date('2026-09-30'))).toBe(true);
    expect(isDateRangeValid(new Date('2026-10-01'), new Date('2026-09-30'))).toBe(false);
    expect(isTaskDueDateValid(new Date('2026-08-31'), new Date('2026-09-01'))).toBe(false);
    expect(REQUEST_VALIDATION_RULES.PASSWORD_MIN_LENGTH).toBe(8);
    expect(REQUEST_VALIDATION_RULES.REQUIREMENT_TITLE_MAX_LENGTH).toBe(100);
  });
});
