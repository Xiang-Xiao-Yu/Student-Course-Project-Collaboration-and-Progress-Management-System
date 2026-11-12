import { Injectable } from '@nestjs/common';

import { DisableUserDto } from './dto/disable-user.dto';
import type { AdminUserResponse } from './interfaces/admin-user-response';
import { AdminUsersRepository } from './repositories/admin-users.repository';
import type { AdminUserRecord } from './repositories/admin-users.repository';

@Injectable()
export class AdminUsersService {
  constructor(private readonly users: AdminUsersRepository) {}
  async list(actorId: string): Promise<AdminUserResponse[]> {
    return (await this.users.list(actorId)).map((user) => this.response(user));
  }
  async disable(
    actorId: string,
    targetId: string,
    dto: DisableUserDto,
  ): Promise<AdminUserResponse> {
    return this.response(await this.users.disable(actorId, targetId, dto.confirmUsername));
  }
  private response(user: AdminUserRecord): AdminUserResponse {
    return { ...user, updatedAt: user.updatedAt.toISOString() };
  }
}
