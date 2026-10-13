import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AppException } from '../../common/errors/app.exception';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { LoginResponse, LogoutResponse } from './interfaces/login-response';
import type { RegisterResponse } from './interfaces/register-response';
import { AuthRepository } from './repositories/auth.repository';
import { PasswordHasherService } from './services/password-hasher.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.authRepository.findUserForLogin(dto.username);
    const passwordMatches =
      user !== null && (await this.passwordHasher.verify(dto.password, user.passwordHash));

    if (!user || !passwordMatches) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_INVALID_CREDENTIALS',
        '用户名或密码错误',
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'AUTH_USER_DISABLED',
        '用户已被禁用，请联系平台管理员',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tokenVersion: user.tokenVersion,
      username: user.username,
    });

    return {
      accessToken,
      expiresIn: this.configService.getOrThrow<string>('JWT_EXPIRES_IN'),
      tokenType: 'Bearer',
      user: {
        id: user.id,
        nickname: user.nickname,
        username: user.username,
      },
    };
  }

  async logout(userId: string): Promise<LogoutResponse> {
    await this.authRepository.incrementTokenVersion(userId);

    return { loggedOut: true };
  }
}
