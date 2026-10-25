import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ProjectRole, ProjectStatus } from '../project.constants';

const projectSelect = {
  createdAt: true,
  description: true,
  endDate: true,
  id: true,
  name: true,
  ownerId: true,
  startDate: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

const projectMemberSelect = {
  id: true,
  joinedAt: true,
  role: true,
  user: {
    select: {
      avatarUrl: true,
      id: true,
      nickname: true,
      username: true,
    },
  },
} satisfies Prisma.ProjectMemberSelect;

export interface ProjectRecord {
  createdAt: Date;
  description: string | null;
  endDate: Date | null;
  id: string;
  name: string;
  ownerId: string;
  startDate: Date | null;
  status: string;
  updatedAt: Date;
}

export interface ProjectWithMembershipRecord extends ProjectRecord {
  members: Array<{ role: string }>;
}

export interface ProjectWriteInput {
  description?: string | null;
  endDate?: Date | null;
  name?: string;
  startDate?: Date | null;
}

export interface ProjectMemberRecord {
  id: string;
  joinedAt: Date;
  role: string;
  user: {
    avatarUrl: string | null;
    id: string;
    nickname: string;
    username: string;
  };
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserAccess(userId: string): Promise<{ isPlatformAdmin: boolean } | null> {
    return this.prisma.user.findUnique({
      select: { isPlatformAdmin: true },
      where: { id: userId },
    });
  }

  async findMembershipRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const membership = await this.prisma.projectMember.findUnique({
      select: { role: true },
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    return (membership?.role as ProjectRole | undefined) ?? null;
  }

  async findProjectById(projectId: string): Promise<ProjectRecord | null> {
    return this.prisma.project.findUnique({
      select: projectSelect,
      where: { id: projectId },
    });
  }

  async listProjectsForUser(
    userId: string,
    isPlatformAdmin: boolean,
  ): Promise<ProjectWithMembershipRecord[]> {
    return this.prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        ...projectSelect,
        members: {
          select: { role: true },
          where: { userId },
        },
      },
      where: isPlatformAdmin
        ? undefined
        : {
            members: {
              some: { userId },
            },
          },
    });
  }

  async createProject(
    ownerId: string,
    input: Required<Pick<ProjectWriteInput, 'name'>> & ProjectWriteInput,
  ): Promise<ProjectRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          description: input.description,
          endDate: input.endDate,
          name: input.name,
          ownerId,
          startDate: input.startDate,
          status: 'PLANNING',
        },
        select: projectSelect,
      });

      await transaction.projectMember.create({
        data: {
          projectId: project.id,
          role: 'OWNER',
          userId: ownerId,
        },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_CREATED',
          actorId: ownerId,
          afterValue: JSON.stringify({
            name: project.name,
            status: project.status,
          }),
          projectId: project.id,
          targetId: project.id,
          targetType: 'PROJECT',
        },
      });

      return project;
    });
  }

  async updateProject(
    projectId: string,
    actorId: string,
    data: ProjectWriteInput,
    beforeValue: unknown,
    afterValue: unknown,
  ): Promise<ProjectRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.update({
        data,
        select: projectSelect,
        where: { id: projectId },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_UPDATED',
          actorId,
          afterValue: JSON.stringify(afterValue),
          beforeValue: JSON.stringify(beforeValue),
          projectId,
          targetId: projectId,
          targetType: 'PROJECT',
        },
      });

      return project;
    });
  }

  async updateProjectStatus(
    projectId: string,
    actorId: string,
    status: ProjectStatus,
    previousStatus: ProjectStatus,
  ): Promise<ProjectRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.update({
        data: { status },
        select: projectSelect,
        where: { id: projectId },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_STATUS_CHANGED',
          actorId,
          afterValue: JSON.stringify({ status }),
          beforeValue: JSON.stringify({ status: previousStatus }),
          projectId,
          targetId: projectId,
          targetType: 'PROJECT',
        },
      });

      return project;
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.prisma.project.delete({
      where: { id: projectId },
    });
  }

  async findUserByUsername(username: string): Promise<{
    avatarUrl: string | null;
    id: string;
    nickname: string;
    username: string;
  } | null> {
    return this.prisma.user.findUnique({
      select: {
        avatarUrl: true,
        id: true,
        nickname: true,
        username: true,
      },
      where: { username },
    });
  }

  async findMemberByUserId(projectId: string, userId: string): Promise<ProjectMemberRecord | null> {
    return this.prisma.projectMember.findUnique({
      select: projectMemberSelect,
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  }

  async listMembers(projectId: string): Promise<ProjectMemberRecord[]> {
    return this.prisma.projectMember.findMany({
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: projectMemberSelect,
      where: { projectId },
    });
  }

  async addMember(
    projectId: string,
    actorId: string,
    userId: string,
    role: 'MEMBER' | 'OBSERVER',
  ): Promise<ProjectMemberRecord> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const member = await transaction.projectMember.create({
          data: {
            projectId,
            role,
            userId,
          },
          select: projectMemberSelect,
        });

        await transaction.activityLog.create({
          data: {
            action: 'PROJECT_MEMBER_ADDED',
            actorId,
            afterValue: JSON.stringify({ role, userId }),
            projectId,
            targetId: userId,
            targetType: 'MEMBER',
          },
        });

        return member;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'PROJECT_MEMBER_EXISTS',
          '该用户已经是项目成员',
        );
      }

      throw error;
    }
  }

  async updateMemberRole(
    projectId: string,
    actorId: string,
    userId: string,
    role: ProjectRole,
    previousRole: ProjectRole,
  ): Promise<ProjectMemberRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const member = await transaction.projectMember.update({
        data: { role },
        select: projectMemberSelect,
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_MEMBER_ROLE_CHANGED',
          actorId,
          afterValue: JSON.stringify({ role, userId }),
          beforeValue: JSON.stringify({ role: previousRole, userId }),
          projectId,
          targetId: userId,
          targetType: 'MEMBER',
        },
      });

      return member;
    });
  }

  async removeMember(
    projectId: string,
    actorId: string,
    userId: string,
    removedRole: ProjectRole,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.projectMember.delete({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_MEMBER_REMOVED',
          actorId,
          beforeValue: JSON.stringify({ role: removedRole, userId }),
          projectId,
          targetId: userId,
          targetType: 'MEMBER',
        },
      });
    });
  }

  async transferOwnership(
    projectId: string,
    actorId: string,
    previousOwnerId: string,
    newOwnerId: string,
  ): Promise<ProjectMemberRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findUnique({
        select: { ownerId: true },
        where: { id: projectId },
      });

      if (!project) {
        throw new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', '项目不存在或无权访问');
      }

      const actor = await transaction.user.findUnique({
        select: { isPlatformAdmin: true },
        where: { id: actorId },
      });

      if (!actor) {
        throw new AppException(
          HttpStatus.UNAUTHORIZED,
          'AUTH_SESSION_EXPIRED',
          '登录会话已失效，请重新登录',
        );
      }

      const actorMembership = actor.isPlatformAdmin
        ? null
        : await transaction.projectMember.findUnique({
            select: { role: true },
            where: {
              projectId_userId: {
                projectId,
                userId: actorId,
              },
            },
          });

      if (!actor.isPlatformAdmin && actorMembership?.role !== 'OWNER') {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'PROJECT_PERMISSION_DENIED',
          '当前项目角色没有执行此操作的权限',
        );
      }

      if (project.ownerId !== previousOwnerId) {
        throw this.ownerTransferConflict();
      }

      const target = await transaction.projectMember.findUnique({
        select: { id: true },
        where: {
          projectId_userId: {
            projectId,
            userId: newOwnerId,
          },
        },
      });

      if (!target) {
        throw new AppException(HttpStatus.NOT_FOUND, 'PROJECT_MEMBER_NOT_FOUND', '项目成员不存在');
      }

      const ownerUpdate = await transaction.project.updateMany({
        data: { ownerId: newOwnerId },
        where: {
          id: projectId,
          ownerId: previousOwnerId,
        },
      });

      if (ownerUpdate.count !== 1) {
        throw this.ownerTransferConflict();
      }

      await transaction.projectMember.updateMany({
        data: { role: 'MEMBER' },
        where: {
          projectId,
          role: 'OWNER',
          userId: { not: newOwnerId },
        },
      });
      const member = await transaction.projectMember.update({
        data: { role: 'OWNER' },
        select: projectMemberSelect,
        where: {
          projectId_userId: {
            projectId,
            userId: newOwnerId,
          },
        },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_OWNER_TRANSFERRED',
          actorId,
          afterValue: JSON.stringify({ ownerId: newOwnerId }),
          beforeValue: JSON.stringify({ ownerId: previousOwnerId }),
          projectId,
          targetId: projectId,
          targetType: 'PROJECT',
        },
      });

      return member;
    });
  }

  private ownerTransferConflict(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      'PROJECT_OWNER_TRANSFER_CONFLICT',
      '项目负责人已发生变化，请刷新后重试',
    );
  }
}
