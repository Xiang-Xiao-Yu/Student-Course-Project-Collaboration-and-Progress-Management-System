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
  authorId: 'user-1',
  content: '已完成接口联调',
  createdAt: new Date('2026-10-27T09:00:00.000Z'),
  id: 'comment-1',
  targetType: 'TASK',
  updatedAt: new Date('2026-10-27T09:00:00.000Z'),
};

function createService(): {
  access: { requirePermission: ReturnType<typeof vi.fn> };
  avatarStorage: { toDataUrl: ReturnType<typeof vi.fn> };
  repository: {
    createComment: ReturnType<typeof vi.fn>;
    deleteComment: ReturnType<typeof vi.fn>;
    listComments: ReturnType<typeof vi.fn>;
    targetExists: ReturnType<typeof vi.fn>;
    updateComment: ReturnType<typeof vi.fn>;
  };
  service: CommentsService;
} {
  const access = { requirePermission: vi.fn() };
  const avatarStorage = {
    toDataUrl: vi.fn(async (_userId: string, avatarUrl: string | null) => avatarUrl),
  };
  const repository = {
    createComment: vi.fn(),
    deleteComment: vi.fn(),
    listComments: vi.fn(),
    targetExists: vi.fn(),
    updateComment: vi.fn(),
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

  it('creates a comment after validating the project target', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.targetExists.mockResolvedValue(true);
    repository.createComment.mockResolvedValue(taskComment);

    await expect(
      service.createComment('user-1', 'project-1', {
        content: '已完成接口联调',
        targetId: 'task-1',
        targetType: 'TASK',
      }),
    ).resolves.toMatchObject({ content: '已完成接口联调', targetType: 'TASK' });
    expect(access.requirePermission).toHaveBeenCalledWith('project-1', 'user-1', 'COMMENT_CREATE');
    expect(repository.createComment).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      'TASK',
      'task-1',
      '已完成接口联调',
    );
  });

  it('rejects creating a comment on a missing target', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.targetExists.mockResolvedValue(false);

    await expect(
      service.createComment('user-1', 'project-1', {
        content: '评论',
        targetId: 'missing',
        targetType: 'TASK',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMENT_TARGET_NOT_FOUND' },
      status: HttpStatus.NOT_FOUND,
    });
    expect(repository.createComment).not.toHaveBeenCalled();
  });

  it('updates and deletes a comment through the repository', async () => {
    const { access, repository, service } = createService();

    access.requirePermission.mockResolvedValue(undefined);
    repository.updateComment.mockResolvedValue(taskComment);
    repository.deleteComment.mockResolvedValue(undefined);

    await expect(
      service.updateComment('user-1', 'project-1', 'comment-1', { content: '新内容' }),
    ).resolves.toMatchObject({ content: '已完成接口联调' });
    expect(repository.updateComment).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      'comment-1',
      '新内容',
    );

    await expect(service.deleteComment('user-1', 'project-1', 'comment-1')).resolves.toEqual({
      deleted: true,
    });
    expect(repository.deleteComment).toHaveBeenCalledWith('project-1', 'user-1', 'comment-1');
  });
});
