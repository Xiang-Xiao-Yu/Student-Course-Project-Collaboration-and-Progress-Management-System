import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ListActivityQueryDto } from '../dto/list-activity-query.dto';
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

export interface ActivityRecord {
  action: string;
  actor: {
    id: string;
    nickname: string;
    username: string;
  } | null;
  afterValue: string | null;
  beforeValue: string | null;
  createdAt: Date;
  id: string;
  targetId: string;
  targetType: string;
}

export type ProjectOwnerTransferErrorCode =
  | 'AUTH_SESSION_EXPIRED'
  | 'PROJECT_ARCHIVED'
  | 'PROJECT_OWNER_TRANSFER_CONFLICT'
  | 'PROJECT_PERMISSION_DENIED';

export class ProjectOwnerTransferError extends Error {
  constructor(readonly code: ProjectOwnerTransferErrorCode) {
    super(code);
    this.name = 'ProjectOwnerTransferError';
  }
}

const projectOwnerTransferErrorCodes = new Set<ProjectOwnerTransferErrorCode>([
  'AUTH_SESSION_EXPIRED',
  'PROJECT_ARCHIVED',
  'PROJECT_OWNER_TRANSFER_CONFLICT',
  'PROJECT_PERMISSION_DENIED',
]);

export function isProjectOwnerTransferError(error: unknown): error is ProjectOwnerTransferError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    projectOwnerTransferErrorCodes.has(error.code as ProjectOwnerTransferErrorCode)
  );
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

  async deleteProject(projectId: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const actor = await transaction.user.findUnique({
        select: { username: true },
        where: { id: actorId },
      });

      if (!actor) {
        throw new AppException(
          HttpStatus.UNAUTHORIZED,
          'AUTH_SESSION_EXPIRED',
          '登录会话已失效，请重新登录',
        );
      }

      const project = await transaction.project.delete({
        select: { id: true, name: true, status: true },
        where: { id: projectId },
      });

      await transaction.projectDeletionAudit.create({
        data: {
          actorId,
          actorUsername: actor.username,
          projectId: project.id,
          projectName: project.name,
          projectStatus: project.status,
        },
      });
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

  async listActivity(projectId: string, query: ListActivityQueryDto): Promise<ActivityRecord[]> {
    const where: Prisma.ActivityLogWhereInput = {
      projectId,
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
    };

    if (query.cursor) {
      const cursor = await this.prisma.activityLog.findFirst({
        select: { createdAt: true, id: true },
        where: { ...where, id: query.cursor },
      });
      // Missing or out-of-scope cursors cannot expose another project's history.
      if (!cursor) return [];

      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    return this.prisma.activityLog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        action: true,
        actor: {
          select: {
            id: true,
            nickname: true,
            username: true,
          },
        },
        afterValue: true,
        beforeValue: true,
        createdAt: true,
        id: true,
        targetId: true,
        targetType: true,
      },
      take: query.limit,
      where,
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
    return this.withMemberMutation(projectId, actorId, async (transaction, ownerId) => {
      if (role === 'OWNER' || previousRole === 'OWNER' || userId === ownerId) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'PROJECT_OWNER_TRANSFER_REQUIRED',
          '必须先转移项目负责人后才能修改其角色',
        );
      }
      const updated = await transaction.projectMember.updateMany({
        data: { role },
        where: {
          projectId,
          userId,
          role: previousRole,
        },
      });
      if (updated.count !== 1) throw this.memberMutationConflict();
      const member = await transaction.projectMember.findUniqueOrThrow({
        select: projectMemberSelect,
        where: { projectId_userId: { projectId, userId } },
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
    await this.withMemberMutation(projectId, actorId, async (transaction, ownerId) => {
      if (removedRole === 'OWNER' || userId === ownerId) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'PROJECT_OWNER_CANNOT_BE_REMOVED',
          '项目负责人不能被移除，请先转移负责人',
        );
      }
      const removed = await transaction.projectMember.deleteMany({
        where: {
          projectId,
          userId,
          role: removedRole,
        },
      });
      if (removed.count !== 1) throw this.memberMutationConflict();

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

  private memberMutationConflict(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      'PROJECT_OWNER_TRANSFER_CONFLICT',
      '项目负责人或成员状态已变化，请刷新后重试',
    );
  }

  private async withMemberMutation<T>(
    projectId: string,
    actorId: string,
    mutate: (transaction: Prisma.TransactionClient, ownerId: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const actor = await transaction.user.findUnique({
          where: { id: actorId },
          select: { status: true, isPlatformAdmin: true },
        });
        if (!actor || actor.status !== 'ACTIVE') {
          throw new AppException(
            HttpStatus.UNAUTHORIZED,
            'AUTH_SESSION_EXPIRED',
            '登录会话已失效，请重新登录',
          );
        }
        const project = await transaction.project.findUnique({
          where: { id: projectId },
          select: { ownerId: true, status: true },
        });
        if (!project) {
          throw new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', '项目不存在或无权访问');
        }
        if (!actor.isPlatformAdmin) {
          const membership = await transaction.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: actorId } },
            select: { role: true },
          });
          if (project.ownerId !== actorId || membership?.role !== 'OWNER') {
            throw new AppException(
              HttpStatus.FORBIDDEN,
              'PROJECT_PERMISSION_DENIED',
              '当前项目角色没有执行此操作的权限',
            );
          }
        }
        if (project.status === 'ARCHIVED') {
          throw new AppException(
            HttpStatus.CONFLICT,
            'PROJECT_ARCHIVED',
            '已归档项目只读，不能修改成员',
          );
        }
        // SQLite serializes writers; a snapshot invalidated before the write
        // cannot commit and is translated to a stable conflict below.
        return mutate(transaction, project.ownerId);
      });
    } catch (error: unknown) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2028' || error.code === 'P2034')) ||
        (error instanceof Error &&
          /database is locked|SQLITE_BUSY|write conflict/i.test(error.message))
      ) {
        throw this.memberMutationConflict();
      }
      throw error;
    }
  }

  async transferOwnership(
    projectId: string,
    actorId: string,
    previousOwnerId: string,
    newOwnerId: string,
  ): Promise<ProjectMemberRecord> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const projectUpdate = await transaction.project.updateMany({
          data: { ownerId: newOwnerId },
          where: {
            id: projectId,
            ownerId: previousOwnerId,
            status: { not: 'ARCHIVED' },
          },
        });

        if (projectUpdate.count !== 1) {
          const project = await transaction.project.findUnique({
            select: { status: true },
            where: { id: projectId },
          });

          if (project?.status === 'ARCHIVED') {
            throw new ProjectOwnerTransferError('PROJECT_ARCHIVED');
          }

          throw new ProjectOwnerTransferError('PROJECT_OWNER_TRANSFER_CONFLICT');
        }

        const actor = await transaction.user.findUnique({
          select: { isPlatformAdmin: true, status: true },
          where: { id: actorId },
        });

        if (!actor || actor.status !== 'ACTIVE') {
          throw new ProjectOwnerTransferError('AUTH_SESSION_EXPIRED');
        }

        if (actorId !== previousOwnerId && !actor.isPlatformAdmin) {
          throw new ProjectOwnerTransferError('PROJECT_PERMISSION_DENIED');
        }

        const demotedOwner = await transaction.projectMember.updateMany({
          data: { role: 'MEMBER' },
          where: {
            projectId,
            userId: previousOwnerId,
            role: 'OWNER',
          },
        });

        if (demotedOwner.count !== 1) {
          throw new ProjectOwnerTransferError('PROJECT_OWNER_TRANSFER_CONFLICT');
        }

        const promotedMember = await transaction.projectMember.updateMany({
          data: { role: 'OWNER' },
          where: {
            projectId,
            userId: newOwnerId,
            role: { in: ['MEMBER', 'OBSERVER'] },
          },
        });

        if (promotedMember.count !== 1) {
          throw new ProjectOwnerTransferError('PROJECT_OWNER_TRANSFER_CONFLICT');
        }

        const member = await transaction.projectMember.findUnique({
          select: projectMemberSelect,
          where: {
            projectId_userId: {
              projectId,
              userId: newOwnerId,
            },
          },
        });

        if (!member) {
          throw new ProjectOwnerTransferError('PROJECT_OWNER_TRANSFER_CONFLICT');
        }

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
    } catch (error) {
      if (isProjectOwnerTransferError(error)) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2028' || error.code === 'P2034')
      ) {
        throw new ProjectOwnerTransferError('PROJECT_OWNER_TRANSFER_CONFLICT');
      }

      if (
        error instanceof Error &&
        /database is locked|SQLITE_BUSY|write conflict/i.test(error.message)
      ) {
        throw new ProjectOwnerTransferError('PROJECT_OWNER_TRANSFER_CONFLICT');
      }

      throw error;
    }
  }
}
