import { describe, expect, it } from 'vitest';

import {
  canManageMembers,
  canManageProject,
  canReviewProjectTasks,
  canCreateProjectContent,
  canDeleteProjectContent,
  canEditProjectContent,
  formatProjectDate,
  getProjectRoleLabel,
  getProjectStatusActionLabel,
  getProjectStatusLabel,
  getProjectStatusTransitions,
  isProjectArchived,
  toProjectDateInput,
} from './project-presentation';

describe('P2 project presentation', () => {
  it('正常场景映射状态、角色和合法状态转换', () => {
    expect(getProjectStatusLabel('PLANNING')).toBe('规划中');
    expect(getProjectRoleLabel('OBSERVER')).toBe('观察者');
    expect(getProjectStatusTransitions('ACTIVE')).toEqual(['PAUSED', 'COMPLETED']);
    expect(getProjectStatusTransitions('ARCHIVED')).toEqual([]);
    expect(getProjectStatusActionLabel('PLANNING', 'ACTIVE')).toBe('开始项目');
    expect(getProjectStatusActionLabel('PAUSED', 'ACTIVE')).toBe('恢复为进行中');
  });

  it('边界场景只允许负责人和管理员进入管理界面', () => {
    expect(canManageProject('OWNER')).toBe(true);
    expect(canManageProject('ADMIN')).toBe(true);
    expect(canManageProject('MEMBER')).toBe(false);
    expect(canManageProject('OBSERVER')).toBe(false);
    expect(canManageMembers(null)).toBe(false);
    expect(isProjectArchived('ARCHIVED')).toBe(true);
  });

  it('P3 内容权限区分创建、编辑、删除与项目状态', () => {
    expect(canCreateProjectContent('MEMBER', 'ACTIVE')).toBe(true);
    expect(canCreateProjectContent('OBSERVER', 'ACTIVE')).toBe(false);
    expect(canCreateProjectContent('MEMBER', 'PAUSED')).toBe(false);
    expect(canEditProjectContent('MEMBER', 'PAUSED')).toBe(true);
    expect(canEditProjectContent('MEMBER', 'ARCHIVED')).toBe(false);
    expect(canDeleteProjectContent('OWNER', 'ACTIVE')).toBe(true);
    expect(canDeleteProjectContent('MEMBER', 'ACTIVE')).toBe(false);
    expect(canReviewProjectTasks('OWNER')).toBe(true);
    expect(canReviewProjectTasks('MEMBER')).toBe(false);
  });

  it('失败场景对缺失或非法日期返回可理解的占位值', () => {
    expect(formatProjectDate(null)).toBe('未设置');
    expect(formatProjectDate('not-a-date')).toBe('日期无效');
    expect(toProjectDateInput('2026-10-22T00:00:00.000Z')).toBe('2026-10-22');
    expect(toProjectDateInput(null)).toBe('');
  });
});
