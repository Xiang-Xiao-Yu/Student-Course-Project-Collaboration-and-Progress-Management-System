import type { ProjectRole } from '../project.constants';

export interface ProjectMemberResponse {
  avatarUrl: string | null;
  id: string;
  joinedAt: string;
  nickname: string;
  role: ProjectRole;
  userId: string;
  username: string;
}
