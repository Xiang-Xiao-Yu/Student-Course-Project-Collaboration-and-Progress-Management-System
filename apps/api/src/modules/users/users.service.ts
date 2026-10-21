import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { AvatarStorageService, SERVER_AVATAR_PREFIX } from './avatar-storage.service';
import type { AvatarUploadFile } from './avatar-storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { UserProfileResponse, UserTaskItem } from './interfaces/user-profile-response';
import type { UserProfileRecord } from './repositories/users.repository';
import { UsersRepository } from './repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly avatarStorage: AvatarStorageService,
  ) {}

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

  async uploadAvatar(
    userId: string,
    file: AvatarUploadFile | undefined,
  ): Promise<UserProfileResponse> {
    if (!file) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'AVATAR_FILE_REQUIRED',
        '请选择需要上传的头像图片',
      );
    }

    const current = await this.usersRepository.findProfileById(userId);

    if (!current) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    }

    const nextAvatarUrl = await this.avatarStorage.store(userId, file);
    let updated: UserProfileRecord | null;

    try {
      updated = await this.usersRepository.updateAvatar(userId, current.avatarUrl, nextAvatarUrl);
    } catch {
      await this.avatarStorage.remove(userId, nextAvatarUrl).catch(() => undefined);
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'AVATAR_STORAGE_FAILED',
        '头像保存失败，请稍后重试',
      );
    }

    if (!updated) {
      await this.avatarStorage.remove(userId, nextAvatarUrl).catch(() => undefined);
      throw new AppException(
        HttpStatus.CONFLICT,
        'AVATAR_CHANGED_CONCURRENTLY',
        '头像资料已更新，请刷新后重试',
      );
    }

    if (current.avatarUrl?.startsWith(SERVER_AVATAR_PREFIX)) {
      await this.avatarStorage.remove(userId, current.avatarUrl).catch(() => undefined);
    }

    const mimeType = nextAvatarUrl.endsWith('.jpg')
      ? 'image/jpeg'
      : nextAvatarUrl.endsWith('.webp')
        ? 'image/webp'
        : 'image/png';
    return this.toProfileResponse(
      updated,
      `data:${mimeType};base64,${file.buffer.toString('base64')}`,
    );
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

  private async toProfileResponse(
    user: UserProfileRecord,
    uploadedDataUrl?: string,
  ): Promise<UserProfileResponse> {
    return {
      avatarUrl: uploadedDataUrl ?? (await this.avatarStorage.toDataUrl(user.id, user.avatarUrl)),
      createdAt: user.createdAt.toISOString(),
      id: user.id,
      nickname: user.nickname,
      status: user.status,
      updatedAt: user.updatedAt.toISOString(),
      username: user.username,
    };
  }
}
