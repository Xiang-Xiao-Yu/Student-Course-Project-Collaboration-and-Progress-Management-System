import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

const userProfileSelect = {
  avatarUrl: true,
  createdAt: true,
  id: true,
  nickname: true,
  status: true,
  updatedAt: true,
  username: true,
} satisfies Prisma.UserSelect;

export interface UserProfileRecord {
  avatarUrl: string | null;
  createdAt: Date;
  id: string;
  nickname: string;
  status: string;
  updatedAt: Date;
  username: string;
}

export interface UserTaskRecord {
  dueDate: Date | null;
  id: string;
  priority: string;
  project: {
    name: string;
  };
  projectId: string;
  status: string;
  title: string;
  updatedAt: Date;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findProfileById(userId: string): Promise<UserProfileRecord | null> {
    return this.prisma.user.findUnique({
      select: userProfileSelect,
      where: { id: userId },
    });
  }

  async updateProfile(
    userId: string,
    input: {
      avatarUrl?: string | null;
      nickname?: string;
    },
  ): Promise<UserProfileRecord | null> {
    const data: Prisma.UserUpdateInput = {};

    if (input.nickname !== undefined) {
      data.nickname = input.nickname;
    }

    if (input.avatarUrl !== undefined) {
      data.avatarUrl = input.avatarUrl;
    }

    try {
      return await this.prisma.user.update({
        data,
        select: userProfileSelect,
        where: { id: userId },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }

      throw error;
    }
  }

  async updateAvatar(
    userId: string,
    expectedAvatarUrl: string | null,
    avatarUrl: string,
  ): Promise<UserProfileRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.user.updateMany({
        data: { avatarUrl },
        where: { avatarUrl: expectedAvatarUrl, id: userId },
      });

      if (result.count !== 1) {
        return null;
      }

      return transaction.user.findUnique({ select: userProfileSelect, where: { id: userId } });
    });
  }

  async findAssignedTasks(userId: string): Promise<UserTaskRecord[]> {
    return this.prisma.task.findMany({
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        dueDate: true,
        id: true,
        priority: true,
        project: {
          select: {
            name: true,
          },
        },
        projectId: true,
        status: true,
        title: true,
        updatedAt: true,
      },
      where: {
        assigneeId: userId,
        project: {
          members: {
            some: { userId },
          },
        },
      },
    });
  }
}
