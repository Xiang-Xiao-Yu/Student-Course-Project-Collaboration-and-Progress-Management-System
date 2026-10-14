import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../../prisma/prisma.service';

const safeUserSelect = {
  createdAt: true,
  id: true,
  nickname: true,
  username: true,
} satisfies Prisma.UserSelect;

export interface AuthUserRecord {
  createdAt: Date;
  id: string;
  nickname: string;
  username: string;
}

export interface LoginUserRecord extends AuthUserRecord {
  passwordHash: string;
  status: string;
  tokenVersion: number;
}

export interface AuthSessionUserRecord {
  id: string;
  nickname: string;
  status: string;
  tokenVersion: number;
  username: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserIdByUsername(username: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      select: { id: true },
      where: { username },
    });

    return user?.id ?? null;
  }

  async createUser(input: {
    nickname: string;
    passwordHash: string;
    username: string;
  }): Promise<AuthUserRecord> {
    try {
      return await this.prisma.user.create({
        data: {
          nickname: input.nickname,
          passwordHash: input.passwordHash,
          status: 'ACTIVE',
          username: input.username,
        },
        select: safeUserSelect,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(HttpStatus.CONFLICT, 'AUTH_USERNAME_TAKEN', '用户名已存在');
      }

      throw error;
    }
  }

  async findUserForLogin(username: string): Promise<LoginUserRecord | null> {
    return this.prisma.user.findUnique({
      select: {
        createdAt: true,
        id: true,
        nickname: true,
        passwordHash: true,
        status: true,
        tokenVersion: true,
        username: true,
      },
      where: { username },
    });
  }

  async findSessionUserById(userId: string): Promise<AuthSessionUserRecord | null> {
    return this.prisma.user.findUnique({
      select: {
        id: true,
        nickname: true,
        status: true,
        tokenVersion: true,
        username: true,
      },
      where: { id: userId },
    });
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        data: {
          tokenVersion: {
            increment: 1,
          },
        },
        select: { id: true },
        where: { id: userId },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new AppException(
          HttpStatus.UNAUTHORIZED,
          'AUTH_SESSION_EXPIRED',
          '登录会话已失效，请重新登录',
        );
      }

      throw error;
    }
  }
}
