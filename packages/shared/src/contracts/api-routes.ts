import type { PermissionAction } from './permissions';

export const API_BASE_PATH = '/api/v1';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type AccessRequirement =
  | { readonly type: 'PUBLIC' }
  | { readonly type: 'AUTHENTICATED' }
  | { readonly type: 'PROJECT_CREATOR' }
  | { readonly type: 'PLATFORM_ADMIN' }
  | { readonly type: 'PROJECT_PERMISSION'; readonly permission: PermissionAction };

export interface ApiRouteContract {
  readonly access: AccessRequirement;
  readonly method: HttpMethod;
  readonly path: string;
}

export const PUBLIC_ACCESS: AccessRequirement = { type: 'PUBLIC' };
export const AUTHENTICATED_ACCESS: AccessRequirement = { type: 'AUTHENTICATED' };
export const PROJECT_CREATOR_ACCESS: AccessRequirement = { type: 'PROJECT_CREATOR' };
export const PLATFORM_ADMIN_ACCESS: AccessRequirement = { type: 'PLATFORM_ADMIN' };

export function projectPermission(permission: PermissionAction): AccessRequirement {
  return { permission, type: 'PROJECT_PERMISSION' };
}

export const API_ROUTE_CONTRACTS = {
  health: {
    access: PUBLIC_ACCESS,
    method: 'GET',
    path: `${API_BASE_PATH}/health`,
  },
  authRegister: {
    access: PUBLIC_ACCESS,
    method: 'POST',
    path: `${API_BASE_PATH}/auth/register`,
  },
  authLogin: {
    access: PUBLIC_ACCESS,
    method: 'POST',
    path: `${API_BASE_PATH}/auth/login`,
  },
  authLogout: {
    access: AUTHENTICATED_ACCESS,
    method: 'POST',
    path: `${API_BASE_PATH}/auth/logout`,
  },
  usersMe: {
    access: AUTHENTICATED_ACCESS,
    method: 'GET',
    path: `${API_BASE_PATH}/users/me`,
  },
  usersMeUpdate: {
    access: AUTHENTICATED_ACCESS,
    method: 'PATCH',
    path: `${API_BASE_PATH}/users/me`,
  },
  usersMePassword: {
    access: AUTHENTICATED_ACCESS,
    method: 'PATCH',
    path: `${API_BASE_PATH}/users/me/password`,
  },
  usersMeTasks: {
    access: AUTHENTICATED_ACCESS,
    method: 'GET',
    path: `${API_BASE_PATH}/users/me/tasks`,
  },
  usersList: {
    access: PLATFORM_ADMIN_ACCESS,
    method: 'GET',
    path: `${API_BASE_PATH}/users`,
  },
  usersStatusUpdate: {
    access: PLATFORM_ADMIN_ACCESS,
    method: 'PATCH',
    path: `${API_BASE_PATH}/users/:userId/status`,
  },
  projectsList: {
    access: AUTHENTICATED_ACCESS,
    method: 'GET',
    path: `${API_BASE_PATH}/projects`,
  },
  projectsCreate: {
    access: PROJECT_CREATOR_ACCESS,
    method: 'POST',
    path: `${API_BASE_PATH}/projects`,
  },
  projectsGet: {
    access: projectPermission('PROJECT_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId`,
  },
  projectsUpdate: {
    access: projectPermission('PROJECT_UPDATE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId`,
  },
  projectsStatusUpdate: {
    access: projectPermission('PROJECT_STATUS_UPDATE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/status`,
  },
  projectsArchive: {
    access: projectPermission('PROJECT_ARCHIVE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/archive`,
  },
  projectsDelete: {
    access: projectPermission('PROJECT_DELETE'),
    method: 'DELETE',
    path: `${API_BASE_PATH}/projects/:projectId`,
  },
  membersList: {
    access: projectPermission('MEMBER_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/members`,
  },
  membersInvite: {
    access: projectPermission('MEMBER_INVITE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/members`,
  },
  membersUpdateRole: {
    access: projectPermission('MEMBER_UPDATE_ROLE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/members/:userId`,
  },
  membersRemove: {
    access: projectPermission('MEMBER_REMOVE'),
    method: 'DELETE',
    path: `${API_BASE_PATH}/projects/:projectId/members/:userId`,
  },
  requirementsList: {
    access: projectPermission('REQUIREMENT_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/requirements`,
  },
  requirementsCreate: {
    access: projectPermission('REQUIREMENT_CREATE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/requirements`,
  },
  requirementsGet: {
    access: projectPermission('REQUIREMENT_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/requirements/:requirementId`,
  },
  requirementsUpdate: {
    access: projectPermission('REQUIREMENT_UPDATE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/requirements/:requirementId`,
  },
  requirementsDelete: {
    access: projectPermission('REQUIREMENT_DELETE'),
    method: 'DELETE',
    path: `${API_BASE_PATH}/projects/:projectId/requirements/:requirementId`,
  },
  tasksList: {
    access: projectPermission('TASK_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/tasks`,
  },
  tasksCreate: {
    access: projectPermission('TASK_CREATE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/tasks`,
  },
  tasksGet: {
    access: projectPermission('TASK_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/tasks/:taskId`,
  },
  tasksUpdate: {
    access: projectPermission('TASK_UPDATE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/tasks/:taskId`,
  },
  tasksDelete: {
    access: projectPermission('TASK_DELETE'),
    method: 'DELETE',
    path: `${API_BASE_PATH}/projects/:projectId/tasks/:taskId`,
  },
  tasksStatusUpdate: {
    access: projectPermission('TASK_STATUS_UPDATE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/tasks/:taskId/status`,
  },
  tasksExport: {
    access: projectPermission('REPORT_EXPORT'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/tasks/export`,
  },
  iterationsList: {
    access: projectPermission('PROJECT_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/iterations`,
  },
  iterationsCreate: {
    access: projectPermission('PROJECT_UPDATE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/iterations`,
  },
  iterationsGet: {
    access: projectPermission('PROJECT_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/iterations/:iterationId`,
  },
  iterationsUpdate: {
    access: projectPermission('PROJECT_UPDATE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/iterations/:iterationId`,
  },
  iterationsDelete: {
    access: projectPermission('PROJECT_UPDATE'),
    method: 'DELETE',
    path: `${API_BASE_PATH}/projects/:projectId/iterations/:iterationId`,
  },
  iterationsAddTask: {
    access: projectPermission('PROJECT_UPDATE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/iterations/:iterationId/tasks`,
  },
  iterationsRemoveTask: {
    access: projectPermission('PROJECT_UPDATE'),
    method: 'DELETE',
    path: `${API_BASE_PATH}/projects/:projectId/iterations/:iterationId/tasks/:taskId`,
  },
  iterationsClose: {
    access: projectPermission('PROJECT_UPDATE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/iterations/:iterationId/close`,
  },
  commentsList: {
    access: projectPermission('PROJECT_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/comments`,
  },
  commentsCreate: {
    access: projectPermission('COMMENT_CREATE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/comments`,
  },
  commentsUpdate: {
    access: projectPermission('COMMENT_UPDATE_OWN'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/comments/:commentId`,
  },
  commentsDelete: {
    access: projectPermission('COMMENT_DELETE_OWN'),
    method: 'DELETE',
    path: `${API_BASE_PATH}/projects/:projectId/comments/:commentId`,
  },
  meetingsList: {
    access: projectPermission('MEETING_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/meetings`,
  },
  meetingsCreate: {
    access: projectPermission('MEETING_CREATE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/meetings`,
  },
  meetingsGet: {
    access: projectPermission('MEETING_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/meetings/:meetingId`,
  },
  meetingsUpdate: {
    access: projectPermission('MEETING_UPDATE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/meetings/:meetingId`,
  },
  meetingActionsCreate: {
    access: projectPermission('MEETING_ACTION_MANAGE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/meetings/:meetingId/actions`,
  },
  meetingActionsUpdate: {
    access: projectPermission('MEETING_ACTION_MANAGE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/meetings/:meetingId/actions/:actionId`,
  },
  meetingActionsConvert: {
    access: projectPermission('MEETING_ACTION_MANAGE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/meetings/:meetingId/actions/:actionId/convert`,
  },
  acceptancesList: {
    access: projectPermission('ACCEPTANCE_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/acceptances`,
  },
  acceptancesCreate: {
    access: projectPermission('ACCEPTANCE_MANAGE'),
    method: 'POST',
    path: `${API_BASE_PATH}/projects/:projectId/acceptances`,
  },
  acceptancesGet: {
    access: projectPermission('ACCEPTANCE_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/acceptances/:acceptanceId`,
  },
  acceptancesUpdate: {
    access: projectPermission('ACCEPTANCE_MANAGE'),
    method: 'PATCH',
    path: `${API_BASE_PATH}/projects/:projectId/acceptances/:acceptanceId`,
  },
  dashboardGet: {
    access: projectPermission('DASHBOARD_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/dashboard`,
  },
  activityList: {
    access: projectPermission('PROJECT_VIEW'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/activity`,
  },
  progressReportExport: {
    access: projectPermission('REPORT_EXPORT'),
    method: 'GET',
    path: `${API_BASE_PATH}/projects/:projectId/reports/progress`,
  },
} as const satisfies Record<string, ApiRouteContract>;
