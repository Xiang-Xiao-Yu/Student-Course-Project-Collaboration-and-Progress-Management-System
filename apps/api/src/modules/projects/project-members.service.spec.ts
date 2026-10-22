import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectAccessService } from './project-access.service';
import { ProjectMembersService } from './project-members.service';
import type { ProjectsRepository } from './repositories/projects.repository';

const ownerMember = {
  id: 'member-owner',
  joinedAt: new Date('2026-10-21T10:00:00.000Z'),
  role: 'OWNER',
  user: {
    avatarUrl: null,
    id: 'owner-1',
    nickname: '项目负责人',
    username: 'owner',
  },
};

const normalMember = {
  ...ownerMember,
  id: 'member-user',
  role: 'MEMBER',
  user: {
    avatarUrl: null,
    id: 'user-1',
    nickname: '普通成员',
    username: 'member',
  },
};

function createService(): {
  access: { requirePermission: ReturnType<typeof vi.fn> };
  repository: {
    addMember: ReturnType<typeof vi.fn>;
    findMemberByUserId: ReturnType<typeof vi.fn>;
    findUserByUsername: ReturnType<typeof vi.fn>;
    listMembers: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
    transferOwnership: ReturnType<typeof vi.fn>;
  };
  service: ProjectMembersService;
} {
  const access = { requirePermission: vi.fn() };
  const repository = {
    addMember: vi.fn(),
    findMemberByUserId: vi.fn(),
    findUserByUsername: vi.fn(),
    listMembers: vi.fn(),
    removeMember: vi.fn(),
    transferOwnership: vi.fn(),
  };
  const service = new ProjectMembersService(
    access as unknown as ProjectAccessService,
    repository as unknown as ProjectsRepository,
  );

  return { access, repository, service };
}

function ownerAccess(): {
  isPlatformAdmin: boolean;
  project: {
    id: string;
    name: string;
    ownerId: string;
    status: string;
  };
  role: string;
} {
  return {
    isPlatformAdmin: false,
    project: {
      id: 'project-1',
      name: '课程项目',
      ownerId: 'owner-1',
      status: 'ACTIVE',
    },
    role: 'OWNER',
  };
}

describe('ProjectMembersService', () => {
  it('invites an existing user as a member', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(ownerAccess());
    repository.findUserByUsername.mockResolvedValue(normalMember.user);
    repository.findMemberByUserId.mockResolvedValue(null);
    repository.addMember.mockResolvedValue(normalMember);

    await expect(
      service.inviteMember('owner-1', 'project-1', {
        role: 'MEMBER',
        username: 'member',
      }),
    ).resolves.toMatchObject({
      role: 'MEMBER',
      userId: 'user-1',
    });
  });

  it('rejects inviting an existing project member', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(ownerAccess());
    repository.findUserByUsername.mockResolvedValue(normalMember.user);
    repository.findMemberByUserId.mockResolvedValue(normalMember);

    await expect(
      service.inviteMember('owner-1', 'project-1', {
        role: 'OBSERVER',
        username: 'member',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });

  it('transfers ownership through a role update', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(ownerAccess());
    repository.findMemberByUserId.mockResolvedValue(normalMember);
    repository.transferOwnership.mockResolvedValue({
      ...normalMember,
      role: 'OWNER',
    });

    await expect(
      service.updateMemberRole('owner-1', 'project-1', 'user-1', {
        role: 'OWNER',
      }),
    ).resolves.toMatchObject({ role: 'OWNER', userId: 'user-1' });
    expect(repository.transferOwnership).toHaveBeenCalledWith(
      'project-1',
      'owner-1',
      'owner-1',
      'user-1',
    );
  });

  it('rejects removing the project owner', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(ownerAccess());
    repository.findMemberByUserId.mockResolvedValue(ownerMember);

    await expect(service.removeMember('owner-1', 'project-1', 'owner-1')).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    expect(repository.removeMember).not.toHaveBeenCalled();
  });

  it('removes a normal member while preserving repository history semantics', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(ownerAccess());
    repository.findMemberByUserId.mockResolvedValue(normalMember);
    repository.removeMember.mockResolvedValue(undefined);

    await expect(service.removeMember('owner-1', 'project-1', 'user-1')).resolves.toEqual({
      removed: true,
    });
    expect(repository.removeMember).toHaveBeenCalledWith(
      'project-1',
      'owner-1',
      'user-1',
      'MEMBER',
    );
  });
});
