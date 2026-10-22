import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { InviteProjectMemberDto } from './dto/invite-project-member.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto';
import type { ProjectMemberResponse } from './interfaces/project-member-response';
import { ProjectMembersService } from './project-members.service';

@Controller('projects/:projectId/members')
@UseGuards(AuthGuard)
export class ProjectMembersController {
  constructor(private readonly projectMembersService: ProjectMembersService) {}

  @Get()
  listMembers(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<ProjectMemberResponse[]> {
    return this.projectMembersService.listMembers(this.requireUserId(request), projectId);
  }

  @Post()
  inviteMember(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: InviteProjectMemberDto,
  ): Promise<ProjectMemberResponse> {
    return this.projectMembersService.inviteMember(this.requireUserId(request), projectId, dto);
  }

  @Patch(':userId')
  updateMemberRole(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateProjectMemberRoleDto,
  ): Promise<ProjectMemberResponse> {
    return this.projectMembersService.updateMemberRole(
      this.requireUserId(request),
      projectId,
      targetUserId,
      dto,
    );
  }

  @Delete(':userId')
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
  ): Promise<{ removed: true }> {
    return this.projectMembersService.removeMember(
      this.requireUserId(request),
      projectId,
      targetUserId,
    );
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
