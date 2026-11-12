import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';

const select = {
  id: true,
  username: true,
  nickname: true,
  status: true,
  isPlatformAdmin: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
export type AdminUserRecord = Prisma.UserGetPayload<{ select: typeof select }>;

@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string): Promise<AdminUserRecord[]> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { status: true, isPlatformAdmin: true },
      });
      if (actor?.status !== 'ACTIVE' || !actor.isPlatformAdmin) throw this.forbidden();
      return tx.user.findMany({ select, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    });
  }

  async disable(
    actorId: string,
    targetId: string,
    confirmUsername: string,
  ): Promise<AdminUserRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Acquire SQLite's write lock before reading authorization and target state.
      // The no-op UPDATE preserves the actor's session and timestamps.
      const actorCount = await tx.$executeRaw`
        UPDATE "User" SET "tokenVersion" = "tokenVersion"
        WHERE "id" = ${actorId} AND "isPlatformAdmin" = 1 AND "status" = 'ACTIVE'
      `;
      if (actorCount !== 1) throw this.forbidden();
      const target = await tx.user.findUnique({ where: { id: targetId }, select });
      if (!target) throw new AppException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', '用户不存在');
      if (target.isPlatformAdmin)
        throw new AppException(
          HttpStatus.CONFLICT,
          'USER_ADMIN_PROTECTED',
          '管理员账号受保护，不能禁用',
        );
      if (target.username !== confirmUsername)
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'USER_CONFIRMATION_MISMATCH',
          '确认的用户名不匹配，请刷新后重试',
        );
      if (target.status === 'DISABLED') return target;

      const updated = await tx.user.update({
        where: { id: targetId },
        data: { status: 'DISABLED', tokenVersion: { increment: 1 } },
        select,
      });
      await tx.userDisableAudit.create({
        data: {
          actorId,
          targetUserId: targetId,
          beforeStatus: target.status,
          afterStatus: 'DISABLED',
        },
      });
      return updated;
    });
  }

  private forbidden(): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      'ADMIN_PERMISSION_DENIED',
      '仅平台管理员可以管理用户',
    );
  }
}
