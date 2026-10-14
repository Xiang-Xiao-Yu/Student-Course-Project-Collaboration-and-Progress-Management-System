import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthRepository } from './repositories/auth.repository';

interface AuthTokenPayload {
  sub: string;
  username: string;
  tokenVersion: number;
}

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload['sub'] === 'string' &&
    typeof payload['username'] === 'string' &&
    typeof payload['tokenVersion'] === 'number'
  );
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw this.sessionExpired();
    }

    let payload: AuthTokenPayload;

    try {
      const verifiedPayload = await this.jwtService.verifyAsync<Record<string, unknown>>(token);

      if (!isAuthTokenPayload(verifiedPayload)) {
        throw this.sessionExpired();
      }

      payload = verifiedPayload;
    } catch (error: unknown) {
      if (error instanceof AppException) {
        throw error;
      }

      throw this.sessionExpired();
    }

    const user = await this.authRepository.findSessionUserById(payload.sub);

    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw this.sessionExpired();
    }

    if (user.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'AUTH_USER_DISABLED',
        '用户已被禁用，请联系平台管理员',
      );
    }

    request.authUser = {
      id: user.id,
      nickname: user.nickname,
      username: user.username,
    };

    return true;
  }

  private sessionExpired(): AppException {
    return new AppException(
      HttpStatus.UNAUTHORIZED,
      'AUTH_SESSION_EXPIRED',
      '登录会话已失效，请重新登录',
    );
  }
}
