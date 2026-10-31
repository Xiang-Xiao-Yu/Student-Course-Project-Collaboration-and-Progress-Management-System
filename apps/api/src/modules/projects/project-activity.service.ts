import { Injectable } from '@nestjs/common';

import { ListActivityQueryDto } from './dto/list-activity-query.dto';
import type { ActivityResponse } from './interfaces/activity-response';
import { ProjectAccessService } from './project-access.service';
import { ProjectsRepository } from './repositories/projects.repository';

function parseActivityValue(value: string | null): unknown {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

@Injectable()
export class ProjectActivityService {
  constructor(
    private readonly projectAccessService: ProjectAccessService,
    private readonly projectsRepository: ProjectsRepository,
  ) {}

  async listActivity(
    userId: string,
    projectId: string,
    query: ListActivityQueryDto,
  ): Promise<ActivityResponse[]> {
    await this.projectAccessService.requirePermission(projectId, userId, 'PROJECT_VIEW');
    const activities = await this.projectsRepository.listActivity(projectId, query);

    return activities.map((activity) => ({
      action: activity.action,
      actor: activity.actor,
      afterValue: parseActivityValue(activity.afterValue),
      beforeValue: parseActivityValue(activity.beforeValue),
      createdAt: activity.createdAt.toISOString(),
      id: activity.id,
      targetId: activity.targetId,
      targetType: activity.targetType,
    }));
  }
}
