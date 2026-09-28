import type { ProjectRole } from './status';

export const PERMISSION_ACTIONS = [
  'PROJECT_VIEW',
  'PROJECT_CREATE',
  'PROJECT_UPDATE',
  'PROJECT_STATUS_UPDATE',
  'PROJECT_ARCHIVE',
  'PROJECT_DELETE',
  'MEMBER_VIEW',
  'MEMBER_INVITE',
  'MEMBER_UPDATE_ROLE',
  'MEMBER_REMOVE',
  'REQUIREMENT_VIEW',
  'REQUIREMENT_CREATE',
  'REQUIREMENT_UPDATE',
  'REQUIREMENT_DELETE',
  'TASK_VIEW',
  'TASK_CREATE',
  'TASK_UPDATE',
  'TASK_DELETE',
  'TASK_ASSIGN',
  'TASK_STATUS_UPDATE',
  'COMMENT_CREATE',
  'COMMENT_UPDATE_OWN',
  'COMMENT_DELETE_OWN',
  'MEETING_VIEW',
  'MEETING_CREATE',
  'MEETING_UPDATE',
  'MEETING_ACTION_MANAGE',
  'ACCEPTANCE_VIEW',
  'ACCEPTANCE_MANAGE',
  'DASHBOARD_VIEW',
  'REPORT_EXPORT',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PROJECT_PERMISSION_MATRIX: Readonly<Record<ProjectRole, readonly PermissionAction[]>> =
  {
    OWNER: PERMISSION_ACTIONS,
    MEMBER: [
      'PROJECT_VIEW',
      'MEMBER_VIEW',
      'REQUIREMENT_VIEW',
      'REQUIREMENT_CREATE',
      'REQUIREMENT_UPDATE',
      'TASK_VIEW',
      'TASK_CREATE',
      'TASK_UPDATE',
      'TASK_ASSIGN',
      'TASK_STATUS_UPDATE',
      'COMMENT_CREATE',
      'COMMENT_UPDATE_OWN',
      'COMMENT_DELETE_OWN',
      'MEETING_VIEW',
      'MEETING_CREATE',
      'MEETING_UPDATE',
      'MEETING_ACTION_MANAGE',
      'ACCEPTANCE_VIEW',
      'DASHBOARD_VIEW',
    ],
    OBSERVER: [
      'PROJECT_VIEW',
      'MEMBER_VIEW',
      'REQUIREMENT_VIEW',
      'TASK_VIEW',
      'MEETING_VIEW',
      'ACCEPTANCE_VIEW',
      'DASHBOARD_VIEW',
    ],
  };

export function hasProjectPermission(role: ProjectRole, action: PermissionAction): boolean {
  return PROJECT_PERMISSION_MATRIX[role].includes(action);
}

export function hasPlatformAdminPermission(action: PermissionAction): boolean {
  return PERMISSION_ACTIONS.includes(action);
}
