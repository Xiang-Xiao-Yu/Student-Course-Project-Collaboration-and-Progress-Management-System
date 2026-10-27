export const PROJECT_ROLES = ['OWNER', 'MEMBER', 'OBSERVER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectPermission =
  | 'MEMBER_INVITE'
  | 'MEMBER_REMOVE'
  | 'MEMBER_UPDATE_ROLE'
  | 'MEMBER_VIEW'
  | 'PROJECT_ARCHIVE'
  | 'PROJECT_DELETE'
  | 'PROJECT_STATUS_UPDATE'
  | 'PROJECT_UPDATE'
  | 'PROJECT_VIEW'
  | 'REQUIREMENT_CREATE'
  | 'REQUIREMENT_DELETE'
  | 'REQUIREMENT_UPDATE'
  | 'REQUIREMENT_VIEW'
  | 'TASK_ASSIGN'
  | 'TASK_CREATE'
  | 'TASK_DELETE'
  | 'TASK_STATUS_UPDATE'
  | 'TASK_UPDATE'
  | 'TASK_VIEW';

export const PROJECT_ROLE_PERMISSIONS: Readonly<Record<ProjectRole, readonly ProjectPermission[]>> =
  {
    OWNER: [
      'PROJECT_VIEW',
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
    ],
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
    ],
    OBSERVER: ['PROJECT_VIEW', 'MEMBER_VIEW', 'REQUIREMENT_VIEW', 'TASK_VIEW'],
  };

export const PROJECT_STATUS_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> =
  {
    PLANNING: ['ACTIVE'],
    ACTIVE: ['PAUSED', 'COMPLETED'],
    PAUSED: ['ACTIVE'],
    COMPLETED: ['ARCHIVED'],
    ARCHIVED: [],
  };
