import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import type { ProjectRole, ProjectStatus } from '../project.constants';

const projectSelect = {
  createdAt: true,
  description: true,
  endDate: true,
  id: true,
  name: true,
  ownerId: true,
  startDate: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

export interface ProjectRecord {
  createdAt: Date;
  description: string | null;
  endDate: Date | null;
  id: string;
  name: string;
  ownerId: string;
  startDate: Date | null;
  status: string;
  updatedAt: Date;
}

export interface ProjectWithMembershipRecord extends ProjectRecord {
  members: Array<{ role: string }>;
}

export interface ProjectWriteInput {
  description?: string | null;
  endDate?: Date | null;
  name?: string;
  startDate?: Date | null;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserAccess(userId: string): Promise<{ isPlatformAdmin: boolean } | null> {
    return this.prisma.user.findUnique({
      select: { isPlatformAdmin: true },
      where: { id: userId },
    });
  }

  async findMembershipRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const membership = await this.prisma.projectMember.findUnique({
      select: { role: true },
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    return (membership?.role as ProjectRole | undefined) ?? null;
  }

  async findProjectById(projectId: string): Promise<ProjectRecord | null> {
    return this.prisma.project.findUnique({
      select: projectSelect,
      where: { id: projectId },
    });
  }

  async listProjectsForUser(
    userId: string,
    isPlatformAdmin: boolean,
  ): Promise<ProjectWithMembershipRecord[]> {
    return this.prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        ...projectSelect,
        members: {
          select: { role: true },
          where: { userId },
        },
      },
      where: isPlatformAdmin
        ? undefined
        : {
            members: {
              some: { userId },
            },
          },
    });
  }

  async createProject(
    ownerId: string,
    input: Required<Pick<ProjectWriteInput, 'name'>> & ProjectWriteInput,
  ): Promise<ProjectRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          description: input.description,
          endDate: input.endDate,
          name: input.name,
          ownerId,
          startDate: input.startDate,
          status: 'PLANNING',
        },
        select: projectSelect,
      });

      await transaction.projectMember.create({
        data: {
          projectId: project.id,
          role: 'OWNER',
          userId: ownerId,
        },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_CREATED',
          actorId: ownerId,
          afterValue: JSON.stringify({
            name: project.name,
            status: project.status,
          }),
          projectId: project.id,
          targetId: project.id,
          targetType: 'PROJECT',
        },
      });

      return project;
    });
  }

  async updateProject(
    projectId: string,
    actorId: string,
    data: ProjectWriteInput,
    beforeValue: unknown,
    afterValue: unknown,
  ): Promise<ProjectRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.update({
        data,
        select: projectSelect,
        where: { id: projectId },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_UPDATED',
          actorId,
          afterValue: JSON.stringify(afterValue),
          beforeValue: JSON.stringify(beforeValue),
          projectId,
          targetId: projectId,
          targetType: 'PROJECT',
        },
      });

      return project;
    });
  }

  async updateProjectStatus(
    projectId: string,
    actorId: string,
    status: ProjectStatus,
    previousStatus: ProjectStatus,
  ): Promise<ProjectRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.update({
        data: { status },
        select: projectSelect,
        where: { id: projectId },
      });

      await transaction.activityLog.create({
        data: {
          action: 'PROJECT_STATUS_CHANGED',
          actorId,
          afterValue: JSON.stringify({ status }),
          beforeValue: JSON.stringify({ status: previousStatus }),
          projectId,
          targetId: projectId,
          targetType: 'PROJECT',
        },
      });

      return project;
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.prisma.project.delete({
      where: { id: projectId },
    });
  }
}
