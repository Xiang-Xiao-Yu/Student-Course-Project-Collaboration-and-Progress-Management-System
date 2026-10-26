import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AvatarStorageService } from '../users/avatar-storage.service';
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

const uploadedMember = {
  ...normalMember,
  user: {
    ...normalMember.user,
    avatarUrl: 'uploaded:00000000-0000-4000-8000-000000000000.png',
  },
};

const memberAvatarDataUrl = 'data:image/png;base64,AA==';

function createService(): {
  access: { requirePermission: ReturnType<typeof vi.fn> };
  avatarStorage: { toDataUrl: ReturnType<typeof vi.fn> };
  repository: {
    addMember: ReturnType<typeof vi.fn>;
    findMemberByUserId: ReturnType<typeof vi.fn>;
    findUserByUsername: ReturnType<typeof vi.fn>;
    listMembers: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
    transferOwnership: ReturnType<typeof vi.fn>;
    updateMemberRole: ReturnType<typeof vi.fn>;
  };
  service: ProjectMembersService;
} {
  const access = { requirePermission: vi.fn() };
  const avatarStorage = {
    toDataUrl: vi.fn(async (_userId: string, avatarUrl: string | null) => avatarUrl),
  };
  const repository = {
    addMember: vi.fn(),
    findMemberByUserId: vi.fn(),
    findUserByUsername: vi.fn(),
    listMembers: vi.fn(),
    removeMember: vi.fn(),
    transferOwnership: vi.fn(),
    updateMemberRole: vi.fn(),
  };
  const service = new ProjectMembersService(
    access as unknown as ProjectAccessService,
    repository as unknown as ProjectsRepository,
    avatarStorage as unknown as AvatarStorageService,
  );

  return { access, avatarStorage, repository, service };
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
  it('resolves uploaded avatars for list, invite, and role-update responses', async () => {
    const { access, avatarStorage, repository, service } = createService();
    const updatedMember = { ...uploadedMember, role: 'OBSERVER' };

    access.requirePermission.mockResolvedValue(ownerAccess());
    repository.listMembers.mockResolvedValue([uploadedMember]);
    repository.findUserByUsername.mockResolvedValue(uploadedMember.user);
    repository.findMemberByUserId.mockResolvedValueOnce(null).mockResolvedValueOnce(normalMember);
    repository.addMember.mockResolvedValue(uploadedMember);
    repository.updateMemberRole.mockResolvedValue(updatedMember);
    avatarStorage.toDataUrl.mockResolvedValue(memberAvatarDataUrl);

    await expect(service.listMembers('owner-1', 'project-1')).resolves.toMatchObject([
      { avatarUrl: memberAvatarDataUrl, userId: 'user-1' },
    ]);
    await expect(
      service.inviteMember('owner-1', 'project-1', { role: 'MEMBER', username: 'member' }),
    ).resolves.toMatchObject({ avatarUrl: memberAvatarDataUrl, userId: 'user-1' });
    await expect(
      service.updateMemberRole('owner-1', 'project-1', 'user-1', { role: 'OBSERVER' }),
    ).resolves.toMatchObject({ avatarUrl: memberAvatarDataUrl, userId: 'user-1' });

    expect(avatarStorage.toDataUrl).toHaveBeenNthCalledWith(
      1,
      'user-1',
      uploadedMember.user.avatarUrl,
    );
    expect(avatarStorage.toDataUrl).toHaveBeenCalledTimes(3);
  });

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

  it('converts uploaded member avatars to displayable data URLs', async () => {
    const { access, avatarStorage, repository, service } = createService();
    const uploadedMember = {
      ...normalMember,
      user: {
        ...normalMember.user,
        avatarUrl: 'uploaded:avatar.png',
      },
    };

    access.requirePermission.mockResolvedValue(ownerAccess());
    repository.listMembers.mockResolvedValue([uploadedMember]);
    avatarStorage.toDataUrl.mockResolvedValue('data:image/png;base64,AAAA');

    await expect(service.listMembers('owner-1', 'project-1')).resolves.toMatchObject([
      {
        avatarUrl: 'data:image/png;base64,AAAA',
        userId: 'user-1',
      },
    ]);
    expect(avatarStorage.toDataUrl).toHaveBeenCalledWith('user-1', 'uploaded:avatar.png');
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

  it('maps a stale ownership transfer to a stable 409 business error', async () => {
    const { access, repository, service } = createService();
    const conflict = Object.assign(new Error('stale owner snapshot'), {
      code: 'PROJECT_OWNER_TRANSFER_CONFLICT',
    });

    access.requirePermission.mockResolvedValue(ownerAccess());
    repository.findMemberByUserId.mockResolvedValue(normalMember);
    repository.transferOwnership.mockRejectedValue(conflict);

    await expect(
      service.updateMemberRole('owner-1', 'project-1', 'user-1', { role: 'OWNER' }),
    ).rejects.toMatchObject({
      response: { code: 'PROJECT_OWNER_TRANSFER_CONFLICT' },
      status: HttpStatus.CONFLICT,
    });
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
