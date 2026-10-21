import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import type { ChangePasswordResponse } from '../auth/interfaces/change-password-response';
import { MAX_AVATAR_UPLOAD_BYTES } from './avatar-storage.service';
import type { AvatarUploadFile } from './avatar-storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { UserProfileResponse, UserTaskItem } from './interfaces/user-profile-response';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  getProfile(@Req() request: AuthenticatedRequest): Promise<UserProfileResponse> {
    return this.usersService.getProfile(this.requireUserId(request));
  }

  @Get('me/tasks')
  getAssignedTasks(@Req() request: AuthenticatedRequest): Promise<UserTaskItem[]> {
    return this.usersService.getAssignedTasks(this.requireUserId(request));
  }

  @Patch('me')
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponse> {
    return this.usersService.updateProfile(this.requireUserId(request), dto);
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_AVATAR_UPLOAD_BYTES, files: 1, fields: 0 },
    }),
  )
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: AvatarUploadFile | undefined,
  ): Promise<UserProfileResponse> {
    return this.usersService.uploadAvatar(this.requireUserId(request), file);
  }

  @Patch('me/password')
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponse> {
    return this.authService.changePassword(this.requireUserId(request), dto);
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
