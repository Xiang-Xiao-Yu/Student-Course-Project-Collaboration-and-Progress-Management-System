import { Controller, Get, HttpStatus, Req, UseGuards } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import type { UserProfileResponse, UserTaskItem } from './interfaces/user-profile-response';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@Req() request: AuthenticatedRequest): Promise<UserProfileResponse> {
    return this.usersService.getProfile(this.requireUserId(request));
  }

  @Get('me/tasks')
  getAssignedTasks(@Req() request: AuthenticatedRequest): Promise<UserTaskItem[]> {
    return this.usersService.getAssignedTasks(this.requireUserId(request));
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const userId = request.authUser?.id;

    if (!userId) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    }

    return userId;
  }
}
