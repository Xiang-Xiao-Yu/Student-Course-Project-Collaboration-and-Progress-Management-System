import { HttpStatus } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import { AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from './interfaces/authenticated-request';
import type { AuthRepository } from './repositories/auth.repository';

function createGuard(): {
  guard: AuthGuard;
  jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  repository: { findSessionUserById: ReturnType<typeof vi.fn> };
} {
  const repository = {
    findSessionUserById: vi.fn(),
  };
  const jwt = {
    verifyAsync: vi.fn(),
  };
  const guard = new AuthGuard(
    repository as unknown as AuthRepository,
    jwt as unknown as JwtService,
  );

  return { guard, jwt, repository };
}

function createContext(authorization?: string): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request = {
    headers: {
      authorization,
    },
  } as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('AuthGuard', () => {
  it('attaches the authenticated user when token and tokenVersion are valid', async () => {
    const { guard, jwt, repository } = createGuard();
    const { context, request } = createContext('Bearer valid-token');

    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      tokenVersion: 3,
      username: 'student01',
    });
    repository.findSessionUserById.mockResolvedValue({
      id: 'user-1',
      nickname: '示例用户',
      status: 'ACTIVE',
      tokenVersion: 3,
      username: 'student01',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authUser).toEqual({
      id: 'user-1',
      nickname: '示例用户',
      username: 'student01',
    });
  });

  it('rejects a missing or invalid bearer token', async () => {
    const { guard, jwt } = createGuard();
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });

    jwt.verifyAsync.mockRejectedValue(new Error('expired token'));
    const expiredContext = createContext('Bearer expired-token').context;

    await expect(guard.canActivate(expiredContext)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('rejects a token after server-side logout', async () => {
    const { guard, jwt, repository } = createGuard();
    const { context } = createContext('Bearer stale-token');

    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      tokenVersion: 2,
      username: 'student01',
    });
    repository.findSessionUserById.mockResolvedValue({
      id: 'user-1',
      nickname: '示例用户',
      status: 'ACTIVE',
      tokenVersion: 3,
      username: 'student01',
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('rejects a disabled user', async () => {
    const { guard, jwt, repository } = createGuard();
    const { context } = createContext('Bearer valid-token');

    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      tokenVersion: 3,
      username: 'student01',
    });
    repository.findSessionUserById.mockResolvedValue({
      id: 'user-1',
      nickname: '禁用用户',
      status: 'DISABLED',
      tokenVersion: 3,
      username: 'student01',
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
  });
});
