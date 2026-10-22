import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { InviteProjectMemberDto } from './dto/invite-project-member.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto';
import type { ProjectMemberResponse } from './interfaces/project-member-response';
import { ProjectAccessService } from './project-access.service';
import type { ProjectRole } from './project.constants';
import { ProjectsRepository, ProjectMemberRecord } from './repositories/projects.repository';

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly projectAccessService: ProjectAccessService,
    private readonly projectsRepository: ProjectsRepository,
  ) {}

  async listMembers(userId: string, projectId: string): Promise<ProjectMemberResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'MEMBER_VIEW');
    const members = await this.projectsRepository.listMembers(projectId);

    return members.map((member) => this.toResponse(member));
  }

  async inviteMember(
    userId: string,
    projectId: string,
    dto: InviteProjectMemberDto,
  ): Promise<ProjectMemberResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'MEMBER_INVITE',
    );

    this.assertProjectWritable(access.project.status);

    const invitedUser = await this.projectsRepository.findUserByUsername(dto.username);

    if (!invitedUser) {
      throw new AppException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', '用户不存在');
    }

    const existingMember = await this.projectsRepository.findMemberByUserId(
      projectId,
      invitedUser.id,
    );

    if (existingMember) {
      throw new AppException(HttpStatus.CONFLICT, 'PROJECT_MEMBER_EXISTS', '该用户已经是项目成员');
    }

    const member = await this.projectsRepository.addMember(
      projectId,
      userId,
      invitedUser.id,
      dto.role,
    );

    return this.toResponse(member);
  }

  async updateMemberRole(
    userId: string,
    projectId: string,
    targetUserId: string,
    dto: UpdateProjectMemberRoleDto,
  ): Promise<ProjectMemberResponse> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'MEMBER_UPDATE_ROLE',
    );

    this.assertProjectWritable(access.project.status);

    const target = await this.projectsRepository.findMemberByUserId(projectId, targetUserId);

    if (!target) {
      throw this.memberNotFound();
    }

    const targetRole = target.role as ProjectRole;

    if (dto.role === 'OWNER') {
      if (targetRole === 'OWNER') {
        return this.toResponse(target);
      }

      const member = await this.projectsRepository.transferOwnership(
        projectId,
        userId,
        access.project.ownerId,
        targetUserId,
      );

      return this.toResponse(member);
    }

    if (targetRole === 'OWNER') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PROJECT_OWNER_TRANSFER_REQUIRED',
        '必须先转移项目负责人后才能修改其角色',
      );
    }

    if (targetRole === dto.role) {
      return this.toResponse(target);
    }

    const member = await this.projectsRepository.updateMemberRole(
      projectId,
      userId,
      targetUserId,
      dto.role,
      targetRole,
    );

    return this.toResponse(member);
  }

  async removeMember(
    userId: string,
    projectId: string,
    targetUserId: string,
  ): Promise<{ removed: true }> {
    const access = await this.projectAccessService.requirePermission(
      projectId,
      userId,
      'MEMBER_REMOVE',
    );

    this.assertProjectWritable(access.project.status);

    const target = await this.projectsRepository.findMemberByUserId(projectId, targetUserId);

    if (!target) {
      throw this.memberNotFound();
    }

    if (target.role === 'OWNER') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PROJECT_OWNER_CANNOT_BE_REMOVED',
        '项目负责人不能被移除，请先转移负责人',
      );
    }

    await this.projectsRepository.removeMember(
      projectId,
      userId,
      targetUserId,
      target.role as ProjectRole,
    );

    return { removed: true };
  }

  private toResponse(member: ProjectMemberRecord): ProjectMemberResponse {
    return {
      avatarUrl: member.user.avatarUrl,
      id: member.id,
      joinedAt: member.joinedAt.toISOString(),
      nickname: member.user.nickname,
      role: member.role as ProjectRole,
      userId: member.user.id,
      username: member.user.username,
    };
  }

  private assertProjectWritable(status: string): void {
    if (status === 'ARCHIVED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PROJECT_ARCHIVED',
        '已归档项目只读，不能修改成员',
      );
    }
  }

  private memberNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'PROJECT_MEMBER_NOT_FOUND', '项目成员不存在');
  }
}
