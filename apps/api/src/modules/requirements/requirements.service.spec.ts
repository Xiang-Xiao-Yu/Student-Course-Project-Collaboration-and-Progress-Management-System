import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectAccessService } from '../projects/project-access.service';
import type { RequirementsRepository } from './repositories/requirements.repository';
import { RequirementsService } from './requirements.service';

const requirement = {
  acceptanceCriteria: '必须可验收',
  createdAt: new Date('2026-10-26T10:00:00.000Z'),
  creatorId: 'user-1',
  description: null,
  id: 'requirement-1',
  number: 'REQ-001',
  priority: 'MEDIUM',
  projectId: 'project-1',
  status: 'DRAFT',
  tasks: [],
  title: '示例需求',
  updatedAt: new Date('2026-10-26T10:00:00.000Z'),
};

function createService(): {
  access: { requirePermission: ReturnType<typeof vi.fn> };
  repository: {
    createRequirement: ReturnType<typeof vi.fn>;
    deleteRequirement: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    listByProject: ReturnType<typeof vi.fn>;
    updateRequirement: ReturnType<typeof vi.fn>;
  };
  service: RequirementsService;
} {
  const access = { requirePermission: vi.fn() };
  const repository = {
    createRequirement: vi.fn(),
    deleteRequirement: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn(),
    updateRequirement: vi.fn(),
  };
  const service = new RequirementsService(
    access as unknown as ProjectAccessService,
    repository as unknown as RequirementsRepository,
  );

  return { access, repository, service };
}

function projectAccess(status = 'ACTIVE'): {
  isPlatformAdmin: boolean;
  project: { status: string };
  role: string;
} {
  return {
    isPlatformAdmin: false,
    project: { status },
    role: 'MEMBER',
  };
}

describe('RequirementsService', () => {
  it('creates a requirement in an active project', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess());
    repository.createRequirement.mockResolvedValue(requirement);

    await expect(
      service.createRequirement('user-1', 'project-1', {
        acceptanceCriteria: '必须可验收',
        priority: 'MEDIUM',
        title: '示例需求',
      }),
    ).resolves.toMatchObject({
      id: 'requirement-1',
      number: 'REQ-001',
      status: 'DRAFT',
    });
  });

  it('blocks new requirements while the project is paused', async () => {
    const { access, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess('PAUSED'));

    await expect(
      service.createRequirement('user-1', 'project-1', {
        acceptanceCriteria: '必须可验收',
        priority: 'MEDIUM',
        title: '示例需求',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });

  it('rejects an invalid requirement status transition', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess());
    repository.findById.mockResolvedValue(requirement);

    await expect(
      service.updateRequirement('user-1', 'project-1', 'requirement-1', {
        status: 'COMPLETED',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
    expect(repository.updateRequirement).not.toHaveBeenCalled();
  });

  it('returns not found for a requirement from another project', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(projectAccess());
    repository.findById.mockResolvedValue(null);

    await expect(service.getRequirement('user-1', 'project-1', 'missing')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });
});
