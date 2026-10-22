import type { ProjectAccessRole, ProjectRole, ProjectStatus } from './project-api';

const projectStatusLabels: Readonly<Record<ProjectStatus, string>> = {
  ACTIVE: '进行中',
  ARCHIVED: '已归档',
  COMPLETED: '已完成',
  PAUSED: '已暂停',
  PLANNING: '规划中',
};

const projectRoleLabels: Readonly<Record<ProjectAccessRole, string>> = {
  ADMIN: '平台管理员',
  MEMBER: '项目成员',
  OBSERVER: '观察者',
  OWNER: '项目负责人',
};

const projectStatusTransitions: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  ACTIVE: ['PAUSED', 'COMPLETED'],
  ARCHIVED: [],
  COMPLETED: ['ARCHIVED'],
  PAUSED: ['ACTIVE'],
  PLANNING: ['ACTIVE'],
};

export function getProjectStatusLabel(status: ProjectStatus): string {
  return projectStatusLabels[status];
}

export function getProjectRoleLabel(role: ProjectAccessRole | ProjectRole): string {
  return projectRoleLabels[role];
}

export function getProjectStatusTransitions(status: ProjectStatus): readonly ProjectStatus[] {
  return projectStatusTransitions[status];
}

export function getProjectStatusActionLabel(
  currentStatus: ProjectStatus,
  targetStatus: ProjectStatus,
): string {
  switch (targetStatus) {
    case 'ACTIVE':
      return currentStatus === 'PAUSED' ? '恢复为进行中' : '开始项目';
    case 'PAUSED':
      return '暂停项目';
    case 'COMPLETED':
      return '标记为已完成';
    case 'ARCHIVED':
      return '归档项目';
    default:
      return getProjectStatusLabel(targetStatus);
  }
}

export function canManageProject(accessRole: ProjectAccessRole | null | undefined): boolean {
  return accessRole === 'OWNER' || accessRole === 'ADMIN';
}

export function canManageMembers(accessRole: ProjectAccessRole | null | undefined): boolean {
  return canManageProject(accessRole);
}

export function isProjectArchived(status: ProjectStatus | null | undefined): boolean {
  return status === 'ARCHIVED';
}

export function formatProjectDate(value: string | null): string {
  if (!value) {
    return '未设置';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '日期无效';
  }

  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

export function toProjectDateInput(value: string | null): string {
  if (!value) {
    return '';
  }

  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);

  return match?.[1] ?? '';
}
