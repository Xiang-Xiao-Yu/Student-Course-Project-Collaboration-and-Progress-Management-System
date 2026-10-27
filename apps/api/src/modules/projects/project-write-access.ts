import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  PROJECT_ROLE_PERMISSIONS,
  type ProjectPermission,
  type ProjectRole,
} from './project.constants';

interface WritableProject {
  startDate: Date | null;
}

/** Recheck mutable authorization and project state in the same snapshot as the write. */
export async function withProjectWrite<T>(
  prisma: PrismaService,
  projectId: string,
  actorId: string,
  permission: ProjectPermission,
  mutate: (transaction: Prisma.TransactionClient, project: WritableProject) => Promise<T>,
  options: { creating?: boolean; ownerOnly?: boolean } = {},
): Promise<T> {
  try {
    return await prisma.$transaction(async (transaction) => {
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
        select: { ownerId: true, status: true, startDate: true },
      });
      if (!project) {
        throw new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', '项目不存在或无权访问');
      }
      if (!actor.isPlatformAdmin) {
        const member = await transaction.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: actorId } },
          select: { role: true },
        });
        if (!member) {
          throw new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', '项目不存在或无权访问');
        }
        const permissions = PROJECT_ROLE_PERMISSIONS[member.role as ProjectRole];
        if (
          !permissions?.includes(permission) ||
          (member.role === 'OWNER' && project.ownerId !== actorId) ||
          (options.ownerOnly && (member.role !== 'OWNER' || project.ownerId !== actorId))
        ) {
          throw new AppException(
            HttpStatus.FORBIDDEN,
            'PROJECT_PERMISSION_DENIED',
            '当前项目角色没有执行此操作的权限',
          );
        }
      }
      if (project.status === 'ARCHIVED' || (options.creating && project.status === 'PAUSED')) {
        throw new AppException(
          HttpStatus.CONFLICT,
          project.status === 'ARCHIVED' ? 'PROJECT_ARCHIVED' : 'PROJECT_PAUSED',
          '当前项目状态不允许此写入操作',
        );
      }
      return mutate(transaction, project);
    });
  } catch (error: unknown) {
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2028', 'P2034'].includes(error.code)) ||
      (error instanceof Error &&
        /database is locked|SQLITE_BUSY|write conflict/i.test(error.message))
    ) {
      throw new AppException(HttpStatus.CONFLICT, 'CONFLICT', '数据已变化，请刷新后重试');
    }
    throw error;
  }
}
