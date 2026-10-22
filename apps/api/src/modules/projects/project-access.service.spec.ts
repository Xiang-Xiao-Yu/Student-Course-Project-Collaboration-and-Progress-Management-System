import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ProjectAccessService } from './project-access.service';
import type { ProjectsRepository } from './repositories/projects.repository';

const project = {
  createdAt: new Date('2026-10-21T10:00:00.000Z'),
  description: null,
  endDate: null,
  id: 'project-1',
  name: '课程项目',
  ownerId: 'owner-1',
  startDate: null,
  status: 'ACTIVE',
  updatedAt: new Date('2026-10-21T10:00:00.000Z'),
};

function createService(): {
  repository: {
    findMembershipRole: ReturnType<typeof vi.fn>;
    findProjectById: ReturnType<typeof vi.fn>;
    findUserAccess: ReturnType<typeof vi.fn>;
  };
  service: ProjectAccessService;
} {
  const repository = {
    findMembershipRole: vi.fn(),
    findProjectById: vi.fn(),
    findUserAccess: vi.fn(),
  };
  const service = new ProjectAccessService(repository as unknown as ProjectsRepository);

  return { repository, service };
}

describe('ProjectAccessService', () => {
  it('allows a platform admin to access any project', async () => {
    const { repository, service } = createService();

    repository.findUserAccess.mockResolvedValue({ isPlatformAdmin: true });
    repository.findProjectById.mockResolvedValue(project);

    await expect(
      service.requirePermission('project-1', 'admin-1', 'PROJECT_UPDATE'),
    ).resolves.toMatchObject({
      isPlatformAdmin: true,
      role: null,
    });
    expect(repository.findMembershipRole).not.toHaveBeenCalled();
  });

  it('allows an owner to update and a member only to view', async () => {
    const { repository, service } = createService();

    repository.findUserAccess.mockResolvedValue({ isPlatformAdmin: false });
    repository.findProjectById.mockResolvedValue(project);
    repository.findMembershipRole
      .mockResolvedValueOnce('OWNER')
      .mockResolvedValueOnce('MEMBER')
      .mockResolvedValueOnce('MEMBER');

    await expect(
      service.requirePermission('project-1', 'owner-1', 'PROJECT_UPDATE'),
    ).resolves.toMatchObject({ role: 'OWNER' });
    await expect(
      service.requirePermission('project-1', 'member-1', 'PROJECT_VIEW'),
    ).resolves.toMatchObject({ role: 'MEMBER' });
    await expect(
      service.requirePermission('project-1', 'member-1', 'PROJECT_UPDATE'),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('hides projects from non-members with a not-found response', async () => {
    const { repository, service } = createService();

    repository.findUserAccess.mockResolvedValue({ isPlatformAdmin: false });
    repository.findProjectById.mockResolvedValue(project);
    repository.findMembershipRole.mockResolvedValue(null);

    await expect(
      service.requirePermission('project-1', 'outsider-1', 'PROJECT_VIEW'),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it('keeps observers read-only', async () => {
    const { repository, service } = createService();

    repository.findUserAccess.mockResolvedValue({ isPlatformAdmin: false });
    repository.findProjectById.mockResolvedValue(project);
    repository.findMembershipRole.mockResolvedValue('OBSERVER');

    await expect(
      service.requirePermission('project-1', 'observer-1', 'PROJECT_VIEW'),
    ).resolves.toMatchObject({ role: 'OBSERVER' });
    await expect(
      service.requirePermission('project-1', 'observer-1', 'MEMBER_INVITE'),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });
});
