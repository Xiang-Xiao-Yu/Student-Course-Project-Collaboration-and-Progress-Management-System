import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import { PROJECT_ROLE_PERMISSIONS, ProjectPermission, ProjectRole } from './project.constants';
import { ProjectsRepository, ProjectRecord } from './repositories/projects.repository';

export interface ProjectAccessContext {
  isPlatformAdmin: boolean;
  project: ProjectRecord;
  role: ProjectRole | null;
}

@Injectable()
export class ProjectAccessService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  async requirePermission(
    projectId: string,
    userId: string,
    permission: ProjectPermission,
  ): Promise<ProjectAccessContext> {
    const [user, project] = await Promise.all([
      this.projectsRepository.findUserAccess(userId),
      this.projectsRepository.findProjectById(projectId),
    ]);

    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    }

    if (!project) {
      throw this.projectNotFound();
    }

    if (user.isPlatformAdmin) {
      return {
        isPlatformAdmin: true,
        project,
        role: null,
      };
    }

    const role = await this.projectsRepository.findMembershipRole(projectId, userId);

    if (!role) {
      throw this.projectNotFound();
    }

    if (!PROJECT_ROLE_PERMISSIONS[role].includes(permission)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'PROJECT_PERMISSION_DENIED',
        '当前项目角色没有执行此操作的权限',
      );
    }

    return {
      isPlatformAdmin: false,
      project,
      role,
    };
  }

  projectNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', '项目不存在或无权访问');
  }
}
