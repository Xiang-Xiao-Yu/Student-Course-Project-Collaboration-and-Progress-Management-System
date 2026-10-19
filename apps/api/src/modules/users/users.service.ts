import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { UserProfileResponse, UserTaskItem } from './interfaces/user-profile-response';
import type { UserProfileRecord } from './repositories/users.repository';
import { UsersRepository } from './repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.usersRepository.findProfileById(userId);

    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    }

    return this.toProfileResponse(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileResponse> {
    if (dto.nickname === undefined && dto.avatarUrl === undefined) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        '请至少提供一个需要更新的字段',
      );
    }

    const user = await this.usersRepository.updateProfile(userId, {
      avatarUrl: dto.avatarUrl,
      nickname: dto.nickname,
    });

    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    }

    return this.toProfileResponse(user);
  }

  async getAssignedTasks(userId: string): Promise<UserTaskItem[]> {
    const tasks = await this.usersRepository.findAssignedTasks(userId);

    return tasks.map((task) => ({
      dueDate: task.dueDate?.toISOString() ?? null,
      id: task.id,
      priority: task.priority,
      projectId: task.projectId,
      projectName: task.project.name,
      status: task.status,
      title: task.title,
      updatedAt: task.updatedAt.toISOString(),
    }));
  }

  private toProfileResponse(user: UserProfileRecord): UserProfileResponse {
    return {
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      id: user.id,
      nickname: user.nickname,
      status: user.status,
      updatedAt: user.updatedAt.toISOString(),
      username: user.username,
    };
  }
}
