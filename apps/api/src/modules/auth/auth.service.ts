import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { RegisterDto } from './dto/register.dto';
import type { RegisterResponse } from './interfaces/register-response';
import { AuthRepository } from './repositories/auth.repository';
import { PasswordHasherService } from './services/password-hasher.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const existingUserId = await this.authRepository.findUserIdByUsername(dto.username);

    if (existingUserId) {
      throw new AppException(HttpStatus.CONFLICT, 'AUTH_USERNAME_TAKEN', '用户名已存在');
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);
    const user = await this.authRepository.createUser({
      nickname: dto.nickname,
      passwordHash,
      username: dto.username,
    });

    return {
      createdAt: user.createdAt.toISOString(),
      id: user.id,
      nickname: user.nickname,
      username: user.username,
    };
  }
}
