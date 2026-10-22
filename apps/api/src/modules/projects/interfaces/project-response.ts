import type { ProjectRole, ProjectStatus } from '../project.constants';

export type ProjectAccessRole = ProjectRole | 'ADMIN';

export interface ProjectResponse {
  accessRole: ProjectAccessRole;
  createdAt: string;
  description: string | null;
  endDate: string | null;
  id: string;
  name: string;
  ownerId: string;
  startDate: string | null;
  status: ProjectStatus;
  updatedAt: string;
}
