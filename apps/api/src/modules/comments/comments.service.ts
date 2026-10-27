import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { ProjectAccessService } from '../projects/project-access.service';
import { AvatarStorageService } from '../users/avatar-storage.service';
import type { CommentTargetType } from './comment.constants';
import type { CommentResponse } from './interfaces/comment-response';
import { CommentsRepository } from './repositories/comments.repository';

@Injectable()
export class CommentsService {
  constructor(
    private readonly commentsRepository: CommentsRepository,
    private readonly projectAccessService: ProjectAccessService,
    private readonly avatarStorage: AvatarStorageService,
  ) {}

  async listComments(
    userId: string,
    projectId: string,
    targetType: CommentTargetType,
    targetId: string,
  ): Promise<CommentResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_VIEW');
    const exists = await this.commentsRepository.targetExists(projectId, targetType, targetId);

    if (!exists) {
      throw new AppException(HttpStatus.NOT_FOUND, 'COMMENT_TARGET_NOT_FOUND', '评论目标不存在');
    }

    const comments = await this.commentsRepository.listComments(projectId, targetType, targetId);

    return Promise.all(
      comments.map(async (comment) => ({
        author: {
          ...comment.author,
          avatarUrl: await this.avatarStorage.toDataUrl(
            comment.author.id,
            comment.author.avatarUrl,
          ),
        },
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        id: comment.id,
        targetType,
        updatedAt: comment.updatedAt.toISOString(),
      })),
    );
  }
}
