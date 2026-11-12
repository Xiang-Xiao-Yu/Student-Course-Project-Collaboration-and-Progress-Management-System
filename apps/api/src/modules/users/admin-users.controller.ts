import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { AdminUsersService } from './admin-users.service';
import { DisableUserDto } from './dto/disable-user.dto';
import type { AdminUserResponse } from './interfaces/admin-user-response';

@Controller('users')
@UseGuards(AuthGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get('admin')
  list(@Req() request: AuthenticatedRequest): Promise<AdminUserResponse[]> {
    return this.users.list(this.actor(request));
  }
  @Post(':userId/disable')
  @HttpCode(HttpStatus.OK)
  disable(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() dto: DisableUserDto,
  ): Promise<AdminUserResponse> {
    return this.users.disable(this.actor(request), userId, dto);
  }
  private actor(request: AuthenticatedRequest): string {
    if (!request.authUser)
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    return request.authUser.id;
  }
}
