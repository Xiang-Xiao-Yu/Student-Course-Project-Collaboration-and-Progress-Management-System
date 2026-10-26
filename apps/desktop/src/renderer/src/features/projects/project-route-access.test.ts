import { describe, expect, it } from 'vitest';

import type { ProjectDto } from './project-api';
import { getProjectRouteAccessState } from './project-route-access';

function projectRecord(id: string): ProjectDto {
  return {
    accessRole: 'OWNER',
    createdAt: '2026-10-25T00:00:00.000Z',
    description: null,
    endDate: null,
    id,
    name: '课程项目',
    ownerId: 'owner-1',
    startDate: null,
    status: 'ACTIVE',
    updatedAt: '2026-10-25T00:00:00.000Z',
  };
}

describe('project route access gate', () => {
  it('blocks a child route while the first access check is idle or loading', () => {
    expect(getProjectRouteAccessState('project-a', { status: 'idle' })).toBe('loading');
    expect(
      getProjectRouteAccessState('project-a', { projectId: 'project-a', status: 'loading' }),
    ).toBe('loading');
  });

  it('does not reuse an access result from a different project id', () => {
    expect(
      getProjectRouteAccessState('project-b', {
        project: projectRecord('project-a'),
        status: 'ready',
      }),
    ).toBe('loading');
    expect(
      getProjectRouteAccessState('project-b', {
        message: 'denied',
        projectId: 'project-a',
        status: 'error',
      }),
    ).toBe('loading');
  });

  it('renders a project child only for the matching authorized project', () => {
    expect(
      getProjectRouteAccessState('project-a', {
        project: projectRecord('project-a'),
        status: 'ready',
      }),
    ).toBe('ready');
  });

  it('shows an access error only for the current project route', () => {
    expect(
      getProjectRouteAccessState('project-a', {
        message: 'denied',
        projectId: 'project-a',
        status: 'error',
      }),
    ).toBe('error');
  });

  it('keeps the all-projects page independent from project access state', () => {
    expect(getProjectRouteAccessState(undefined, { status: 'idle' })).toBe('project-center');
  });
});
