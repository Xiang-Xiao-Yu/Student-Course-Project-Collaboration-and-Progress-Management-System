import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../../common/errors/app.exception';
import type { AvatarStorageService } from './avatar-storage.service';
import type { UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';

function createService(): {
  repository: {
    findAssignedTasks: ReturnType<typeof vi.fn>;
    findProfileById: ReturnType<typeof vi.fn>;
    updateAvatar: ReturnType<typeof vi.fn>;
    updateProfile: ReturnType<typeof vi.fn>;
  };
  avatarStorage: {
    remove: ReturnType<typeof vi.fn>;
    store: ReturnType<typeof vi.fn>;
    toDataUrl: ReturnType<typeof vi.fn>;
  };
  service: UsersService;
} {
  const repository = {
    findAssignedTasks: vi.fn(),
    findProfileById: vi.fn(),
    updateAvatar: vi.fn(),
    updateProfile: vi.fn(),
  };
  const avatarStorage = {
    remove: vi.fn(async () => undefined),
    store: vi.fn(),
    toDataUrl: vi.fn(async (_userId: string, avatarUrl: string | null) => avatarUrl),
  };
  const service = new UsersService(
    repository as unknown as UsersRepository,
    avatarStorage as unknown as AvatarStorageService,
  );

  return { avatarStorage, repository, service };
}

describe('UsersService', () => {
  it('returns the current user profile', async () => {
    const { repository, service } = createService();

    repository.findProfileById.mockResolvedValue({
      avatarUrl: null,
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      id: 'user-1',
      nickname: '示例用户',
      status: 'ACTIVE',
      updatedAt: new Date('2026-10-13T11:00:00.000Z'),
      username: 'student01',
    });

    await expect(service.getProfile('user-1')).resolves.toEqual({
      avatarUrl: null,
      createdAt: '2026-10-13T10:00:00.000Z',
      id: 'user-1',
      nickname: '示例用户',
      status: 'ACTIVE',
      updatedAt: '2026-10-13T11:00:00.000Z',
      username: 'student01',
    });
  });

  it('rejects a missing session user', async () => {
    const { repository, service } = createService();

    repository.findProfileById.mockResolvedValue(null);

    await expect(service.getProfile('missing-user')).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('maps assigned tasks and keeps an empty task list valid', async () => {
    const { repository, service } = createService();

    repository.findAssignedTasks.mockResolvedValue([
      {
        dueDate: new Date('2026-10-20T00:00:00.000Z'),
        id: 'task-1',
        priority: 'HIGH',
        project: { name: '课程项目' },
        projectId: 'project-1',
        status: 'IN_PROGRESS',
        title: '完成任务接口',
        updatedAt: new Date('2026-10-13T12:00:00.000Z'),
      },
    ]);

    await expect(service.getAssignedTasks('user-1')).resolves.toEqual([
      {
        dueDate: '2026-10-20T00:00:00.000Z',
        id: 'task-1',
        priority: 'HIGH',
        projectId: 'project-1',
        projectName: '课程项目',
        status: 'IN_PROGRESS',
        title: '完成任务接口',
        updatedAt: '2026-10-13T12:00:00.000Z',
      },
    ]);

    repository.findAssignedTasks.mockResolvedValue([]);
    await expect(service.getAssignedTasks('user-without-tasks')).resolves.toEqual([]);
  });
});

describe('UsersService.updateProfile', () => {
  it('updates nickname and avatar and returns the safe profile', async () => {
    const { repository, service } = createService();

    repository.updateProfile.mockResolvedValue({
      avatarUrl: 'https://example.com/avatar.png',
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      id: 'user-1',
      nickname: '新昵称',
      status: 'ACTIVE',
      updatedAt: new Date('2026-10-19T10:00:00.000Z'),
      username: 'student01',
    });

    await expect(
      service.updateProfile('user-1', {
        avatarUrl: 'https://example.com/avatar.png',
        nickname: '新昵称',
      }),
    ).resolves.toEqual({
      avatarUrl: 'https://example.com/avatar.png',
      createdAt: '2026-10-13T10:00:00.000Z',
      id: 'user-1',
      nickname: '新昵称',
      status: 'ACTIVE',
      updatedAt: '2026-10-19T10:00:00.000Z',
      username: 'student01',
    });
    expect(repository.updateProfile).toHaveBeenCalledWith('user-1', {
      avatarUrl: 'https://example.com/avatar.png',
      nickname: '新昵称',
    });
  });

  it('rejects an empty profile update', async () => {
    const { repository, service } = createService();

    await expect(service.updateProfile('user-1', {})).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(repository.updateProfile).not.toHaveBeenCalled();
  });

  it('rejects an update when the session user no longer exists', async () => {
    const { repository, service } = createService();

    repository.updateProfile.mockResolvedValue(null);

    await expect(
      service.updateProfile('missing-user', { nickname: '新昵称' }),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
  });
});

describe('UsersService.uploadAvatar', () => {
  const current = {
    avatarUrl: null,
    createdAt: new Date('2026-10-13T10:00:00.000Z'),
    id: 'user-1',
    nickname: '示例用户',
    status: 'ACTIVE',
    updatedAt: new Date('2026-10-13T11:00:00.000Z'),
    username: 'student01',
  };
  const uploaded = {
    ...current,
    avatarUrl: 'uploaded:550e8400-e29b-41d4-a716-446655440000.png',
  };
  const file = {
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimetype: 'image/png',
    size: 8,
  };

  it('stores the image, atomically updates the owner profile, and returns an image data URL', async () => {
    const { avatarStorage, repository, service } = createService();
    repository.findProfileById.mockResolvedValue(current);
    avatarStorage.store.mockResolvedValue(uploaded.avatarUrl);
    repository.updateAvatar.mockResolvedValue(uploaded);
    avatarStorage.toDataUrl.mockResolvedValue('data:image/png;base64,AA==');

    const profile = await service.uploadAvatar('user-1', file);

    expect(avatarStorage.store).toHaveBeenCalledWith('user-1', file);
    expect(repository.updateAvatar).toHaveBeenCalledWith('user-1', null, uploaded.avatarUrl);
    expect(avatarStorage.remove).not.toHaveBeenCalled();
    expect(profile.avatarUrl).toBe(`data:image/png;base64,${file.buffer.toString('base64')}`);
    expect(avatarStorage.toDataUrl).not.toHaveBeenCalled();
  });

  it('removes a previous server-owned image after a successful replacement', async () => {
    const previous = 'uploaded:11111111-1111-4111-8111-111111111111.jpg';
    const { avatarStorage, repository, service } = createService();
    repository.findProfileById.mockResolvedValue({ ...current, avatarUrl: previous });
    avatarStorage.store.mockResolvedValue(uploaded.avatarUrl);
    repository.updateAvatar.mockResolvedValue(uploaded);

    await service.uploadAvatar('user-1', file);

    expect(avatarStorage.remove).toHaveBeenCalledWith('user-1', previous);
  });

  it('preserves the current avatar and removes the new file when another update wins', async () => {
    const { avatarStorage, repository, service } = createService();
    repository.findProfileById.mockResolvedValue(current);
    avatarStorage.store.mockResolvedValue(uploaded.avatarUrl);
    repository.updateAvatar.mockResolvedValue(null);

    await expect(service.uploadAvatar('user-1', file)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'AVATAR_CHANGED_CONCURRENTLY' },
    });
    expect(avatarStorage.remove).toHaveBeenCalledWith('user-1', uploaded.avatarUrl);
  });

  it('requires both a selected image and a current user', async () => {
    const { repository, service } = createService();

    await expect(service.uploadAvatar('user-1', undefined)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    repository.findProfileById.mockResolvedValue(null);
    await expect(service.uploadAvatar('missing-user', file)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('keeps the original avatar when the conditional database update fails', async () => {
    const { avatarStorage, repository, service } = createService();
    repository.findProfileById.mockResolvedValue(current);
    avatarStorage.store.mockResolvedValue(uploaded.avatarUrl);
    repository.updateAvatar.mockRejectedValue(new Error('database failure'));

    await expect(service.uploadAvatar('user-1', file)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      response: { code: 'AVATAR_STORAGE_FAILED' },
    });
    expect(avatarStorage.remove).toHaveBeenCalledWith('user-1', uploaded.avatarUrl);
  });

  it('leaves the previous avatar untouched when file storage fails', async () => {
    const { avatarStorage, repository, service } = createService();
    repository.findProfileById.mockResolvedValue(uploaded);
    const failure = new AppException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'AVATAR_STORAGE_FAILED',
      '头像保存失败，请稍后重试',
    );
    avatarStorage.store.mockRejectedValue(failure);

    await expect(service.uploadAvatar('user-1', file)).rejects.toBe(failure);
    expect(repository.updateAvatar).not.toHaveBeenCalled();
    expect(avatarStorage.remove).not.toHaveBeenCalled();
  });
});
