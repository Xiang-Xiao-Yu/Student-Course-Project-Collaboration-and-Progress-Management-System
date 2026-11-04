import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { withProjectWrite } from '../../projects/project-write-access';
import type { CommentTargetType } from '../comment.constants';

const commentSelect = {
  author: {
    select: {
      avatarUrl: true,
      id: true,
      nickname: true,
      username: true,
    },
  },
  authorId: true,
  content: true,
  createdAt: true,
  id: true,
  targetType: true,
  updatedAt: true,
} satisfies Prisma.CommentSelect;

export interface CommentRecord {
  author: {
    avatarUrl: string | null;
    id: string;
    nickname: string;
    username: string;
  };
  authorId: string;
  content: string;
  createdAt: Date;
  id: string;
  targetType: string;
  updatedAt: Date;
}

@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async targetExists(
    projectId: string,
    targetType: CommentTargetType,
    targetId: string,
  ): Promise<boolean> {
    if (targetType === 'TASK') {
      return (
        (await this.prisma.task.count({
          where: { id: targetId, projectId },
        })) === 1
      );
    }

    if (targetType === 'REQUIREMENT') {
      return (
        (await this.prisma.requirement.count({
          where: { id: targetId, projectId },
        })) === 1
      );
    }

    return (
      (await this.prisma.meeting.count({
        where: { id: targetId, projectId },
      })) === 1
    );
  }

  async listComments(
    projectId: string,
    targetType: CommentTargetType,
    targetId: string,
  ): Promise<CommentRecord[]> {
    const targetFilter =
      targetType === 'TASK'
        ? { taskId: targetId }
        : targetType === 'REQUIREMENT'
          ? { requirementId: targetId }
          : { meetingId: targetId };

    return this.prisma.comment.findMany({
      orderBy: { createdAt: 'asc' },
      select: commentSelect,
      where: {
        projectId,
        targetType,
        ...targetFilter,
      },
    });
  }

  async createComment(
    projectId: string,
    authorId: string,
    targetType: CommentTargetType,
    targetId: string,
    content: string,
  ): Promise<CommentRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      authorId,
      'COMMENT_CREATE',
      async (transaction) => {
        const target = this.targetFilter(targetType, targetId);
        const created = await transaction.comment.create({
          data: {
            authorId,
            content,
            projectId,
            targetType,
            ...target,
          },
          select: commentSelect,
        });

        await transaction.activityLog.create({
          data: {
            action: 'COMMENT_CREATED',
            actorId: authorId,
            afterValue: JSON.stringify({
              content,
              targetId,
              targetType,
            }),
            projectId,
            targetId: created.id,
            targetType: 'COMMENT',
          },
        });

        return created;
      },
      { creating: true },
    );
  }

  async updateComment(
    projectId: string,
    actorId: string,
    commentId: string,
    content: string,
  ): Promise<CommentRecord> {
    return withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'COMMENT_UPDATE_OWN',
      async (transaction) => {
        const current = await transaction.comment.findFirst({
          select: commentSelect,
          where: { id: commentId, projectId },
        });

        if (!current) {
          throw this.commentNotFound();
        }

        this.assertOwnComment(current.authorId, actorId);

        const updated = await transaction.comment.update({
          data: { content },
          select: commentSelect,
          where: { id: commentId },
        });

        await transaction.activityLog.create({
          data: {
            action: 'COMMENT_UPDATED',
            actorId,
            afterValue: JSON.stringify({ content }),
            beforeValue: JSON.stringify({ content: current.content }),
            projectId,
            targetId: commentId,
            targetType: 'COMMENT',
          },
        });

        return updated;
      },
    );
  }

  async deleteComment(projectId: string, actorId: string, commentId: string): Promise<void> {
    await withProjectWrite(
      this.prisma,
      projectId,
      actorId,
      'COMMENT_DELETE_OWN',
      async (transaction) => {
        const current = await transaction.comment.findFirst({
          select: commentSelect,
          where: { id: commentId, projectId },
        });

        if (!current) {
          throw this.commentNotFound();
        }

        this.assertOwnComment(current.authorId, actorId);

        await transaction.activityLog.create({
          data: {
            action: 'COMMENT_DELETED',
            actorId,
            beforeValue: JSON.stringify({ content: current.content }),
            projectId,
            targetId: commentId,
            targetType: 'COMMENT',
          },
        });

        await transaction.comment.delete({ where: { id: commentId } });
      },
    );
  }

  private targetFilter(
    targetType: CommentTargetType,
    targetId: string,
  ): { meetingId: string } | { requirementId: string } | { taskId: string } {
    if (targetType === 'TASK') {
      return { taskId: targetId };
    }

    if (targetType === 'REQUIREMENT') {
      return { requirementId: targetId };
    }

    return { meetingId: targetId };
  }

  private assertOwnComment(authorId: string, actorId: string): void {
    if (authorId !== actorId) {
      throw new AppException(HttpStatus.FORBIDDEN, 'COMMENT_NOT_OWNER', '只能修改或删除自己的评论');
    }
  }

  private commentNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'COMMENT_NOT_FOUND', '评论不存在');
  }
}
