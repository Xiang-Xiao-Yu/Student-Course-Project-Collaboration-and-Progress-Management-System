import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectAccessService } from '../projects/project-access.service';
import type { AvatarStorageService } from '../users/avatar-storage.service';
import { CommentsService } from './comments.service';
import type { CommentsRepository } from './repositories/comments.repository';

const taskComment = {
  author: {
    avatarUrl: 'uploaded:00000000-0000-4000-8000-000000000000.png',
    id: 'user-1',
    nickname: '示例成员',
    username: 'member',
  },
  content: '已完成接口联调',
  createdAt: new Date('2026-10-27T09:00:00.000Z'),
  id: 'comment-1',
  updatedAt: new Date('2026-10-27T09:00:00.000Z'),
};

function createService(): {
  access: { requirePermission: ReturnType<typeof vi.fn> };
  avatarStorage: { toDataUrl: ReturnType<typeof vi.fn> };
  repository: {
    listComments: ReturnType<typeof vi.fn>;
    targetExists: ReturnType<typeof vi.fn>;
  };
  service: CommentsService;
} {
  const access = { requirePermission: vi.fn() };
  const avatarStorage = {
    toDataUrl: vi.fn(async (_userId: string, avatarUrl: string | null) => avatarUrl),
  };
  const repository = {
    listComments: vi.fn(),
    targetExists: vi.fn(),
  };
  const service = new CommentsService(
    repository as unknown as CommentsRepository,
    access as unknown as ProjectAccessService,
    avatarStorage as unknown as AvatarStorageService,
  );

  return { access, avatarStorage, repository, service };
}

describe('CommentsService', () => {
  it('returns task comments in repository order with displayable author avatars', async () => {
    const { access, avatarStorage, repository, service } = createService();
    const avatarUrl = 'data:image/png;base64,AA==';

    access.requirePermission.mockResolvedValue(undefined);
    repository.targetExists.mockResolvedValue(true);
    repository.listComments.mockResolvedValue([taskComment]);
    avatarStorage.toDataUrl.mockResolvedValue(avatarUrl);

    await expect(service.listComments('user-1', 'project-1', 'TASK', 'task-1')).resolves.toEqual([
      {
        author: {
          avatarUrl,
          id: 'user-1',
          nickname: '示例成员',
          username: 'member',
        },
        content: '已完成接口联调',
        createdAt: '2026-10-27T09:00:00.000Z',
        id: 'comment-1',
        targetType: 'TASK',
        updatedAt: '2026-10-27T09:00:00.000Z',
      },
    ]);
    expect(access.requirePermission).toHaveBeenCalledWith('project-1', 'user-1', 'PROJECT_VIEW');
    expect(repository.targetExists).toHaveBeenCalledWith('project-1', 'TASK', 'task-1');
    expect(avatarStorage.toDataUrl).toHaveBeenCalledWith('user-1', taskComment.author.avatarUrl);
  });

  it('returns an empty list when the target has no comments', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.targetExists.mockResolvedValue(true);
    repository.listComments.mockResolvedValue([]);

    await expect(service.listComments('user-1', 'project-1', 'TASK', 'task-1')).resolves.toEqual(
      [],
    );
  });

  it('does not expose comments when the target does not belong to the project', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.targetExists.mockResolvedValue(false);

    await expect(
      service.listComments('user-1', 'project-1', 'TASK', 'foreign-task'),
    ).rejects.toMatchObject({
      response: { code: 'COMMENT_TARGET_NOT_FOUND' },
      status: HttpStatus.NOT_FOUND,
    });
    expect(repository.listComments).not.toHaveBeenCalled();
  });
});
