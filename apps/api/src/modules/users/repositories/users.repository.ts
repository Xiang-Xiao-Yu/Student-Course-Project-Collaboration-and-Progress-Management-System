import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';

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
      select: {
        avatarUrl: true,
        createdAt: true,
        id: true,
        nickname: true,
        status: true,
        updatedAt: true,
        username: true,
      },
      where: { id: userId },
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
      },
    });
  }
}
