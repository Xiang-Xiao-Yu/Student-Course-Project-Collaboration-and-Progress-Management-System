import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
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
  content: true,
  createdAt: true,
  id: true,
  updatedAt: true,
} satisfies Prisma.CommentSelect;

export interface CommentRecord {
  author: {
    avatarUrl: string | null;
    id: string;
    nickname: string;
    username: string;
  };
  content: string;
  createdAt: Date;
  id: string;
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
}
