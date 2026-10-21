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
  | 'PROJECT_VIEW';

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
    ],
    MEMBER: ['PROJECT_VIEW', 'MEMBER_VIEW'],
    OBSERVER: ['PROJECT_VIEW', 'MEMBER_VIEW'],
  };

export const PROJECT_STATUS_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> =
  {
    PLANNING: ['ACTIVE'],
    ACTIVE: ['PAUSED', 'COMPLETED'],
    PAUSED: ['ACTIVE'],
    COMPLETED: ['ARCHIVED'],
    ARCHIVED: [],
  };
