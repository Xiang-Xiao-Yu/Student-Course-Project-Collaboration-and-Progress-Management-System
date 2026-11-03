import type { ProjectAccessRole } from '../projects/project-api';

export function canEditTaskDetails(
  accessRole: ProjectAccessRole,
  assigneeId: string | null,
  userId: string | null | undefined,
): boolean {
  if (accessRole === 'OWNER' || accessRole === 'ADMIN') {
    return true;
  }

  return accessRole === 'MEMBER' && Boolean(userId) && assigneeId === userId;
}

export function canReassignTask(accessRole: ProjectAccessRole): boolean {
  return accessRole === 'OWNER' || accessRole === 'ADMIN' || accessRole === 'MEMBER';
}
