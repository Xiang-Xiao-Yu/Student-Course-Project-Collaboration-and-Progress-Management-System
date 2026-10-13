import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { UserProfileResponse, UserTaskItem } from './interfaces/user-profile-response';
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
}
