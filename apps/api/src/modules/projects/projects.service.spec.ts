import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectAccessService } from './project-access.service';
import type { ProjectsRepository } from './repositories/projects.repository';
import { ProjectsService } from './projects.service';

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
  access: {
    requirePermission: ReturnType<typeof vi.fn>;
  };
  repository: {
    createProject: ReturnType<typeof vi.fn>;
    deleteProject: ReturnType<typeof vi.fn>;
    findProjectById: ReturnType<typeof vi.fn>;
    findUserAccess: ReturnType<typeof vi.fn>;
    listProjectsForUser: ReturnType<typeof vi.fn>;
    updateProject: ReturnType<typeof vi.fn>;
    updateProjectStatus: ReturnType<typeof vi.fn>;
  };
  service: ProjectsService;
} {
  const access = {
    requirePermission: vi.fn(),
  };
  const repository = {
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    findProjectById: vi.fn(),
    findUserAccess: vi.fn(),
    listProjectsForUser: vi.fn(),
    updateProject: vi.fn(),
    updateProjectStatus: vi.fn(),
  };
  const service = new ProjectsService(
    access as unknown as ProjectAccessService,
    repository as unknown as ProjectsRepository,
  );

  return { access, repository, service };
}

describe('ProjectsService', () => {
  it('creates a project with an owner response', async () => {
    const { repository, service } = createService();

    repository.createProject.mockResolvedValue(project);

    await expect(
      service.createProject('owner-1', {
        endDate: '2026-12-31',
        name: '课程项目',
        startDate: '2026-10-01',
      }),
    ).resolves.toMatchObject({
      accessRole: 'OWNER',
      id: 'project-1',
    });
  });

  it('rejects an invalid project date range', async () => {
    const { service } = createService();

    await expect(
      service.createProject('owner-1', {
        endDate: '2026-09-01',
        name: '课程项目',
        startDate: '2026-10-01',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });

  it('rejects updates to an archived project', async () => {
    const { access, service } = createService();

    access.requirePermission.mockResolvedValue({
      isPlatformAdmin: false,
      project: { ...project, status: 'ARCHIVED' },
      role: 'OWNER',
    });

    await expect(
      service.updateProject('owner-1', 'project-1', { name: '新名称' }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });

  it('keeps audit afterValue consistent with an explicit description update', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue({
      isPlatformAdmin: false,
      project: { ...project, description: '旧描述' },
      role: 'OWNER',
    });
    repository.updateProject.mockResolvedValue({
      ...project,
      description: '',
    });

    await service.updateProject('owner-1', 'project-1', { description: '' });

    expect(repository.updateProject).toHaveBeenCalledWith(
      'project-1',
      'owner-1',
      { description: '' },
      expect.objectContaining({ description: '旧描述' }),
      expect.objectContaining({ description: '' }),
    );
  });

  it('enforces valid project status transitions', async () => {
    const { access, service } = createService();

    access.requirePermission.mockResolvedValue({
      isPlatformAdmin: false,
      project,
      role: 'OWNER',
    });

    await expect(
      service.updateStatus('owner-1', 'project-1', { status: 'ARCHIVED' }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });

  it('requires the exact project name for deletion', async () => {
    const { access, service } = createService();

    access.requirePermission.mockResolvedValue({
      isPlatformAdmin: false,
      project,
      role: 'OWNER',
    });

    await expect(
      service.deleteProject('owner-1', 'project-1', {
        confirmName: '错误名称',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });
});
