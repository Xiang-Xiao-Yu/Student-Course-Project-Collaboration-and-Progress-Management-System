import { describe, expect, it, vi } from 'vitest';

import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  inviteProjectMember,
  listProjectMembers,
  listProjects,
  removeProjectMember,
  updateProject,
  updateProjectMemberRole,
  updateProjectStatus,
} from './project-api';

describe('P2 project and member API', () => {
  it('正常场景映射项目生命周期请求', async () => {
    const api = {
      delete: vi.fn(async () => ({ deleted: true as const })),
      get: vi.fn(async () => ({ id: 'project-1' })),
      patch: vi.fn(async () => ({ id: 'project-1' })),
      post: vi.fn(async () => ({ id: 'project-1' })),
    };

    await listProjects(api as never);
    await createProject(api as never, { name: '课程项目' });
    await getProject(api as never, 'project/1');
    await updateProject(api as never, 'project-1', { name: '新名称' });
    await updateProjectStatus(api as never, 'project-1', 'ACTIVE');
    await archiveProject(api as never, 'project-1');
    await deleteProject(api as never, 'project-1', '课程项目');

    expect(api.get).toHaveBeenNthCalledWith(1, '/projects');
    expect(api.get).toHaveBeenNthCalledWith(2, '/projects/project%2F1');
    expect(api.post).toHaveBeenNthCalledWith(1, '/projects', { name: '课程项目' });
    expect(api.patch).toHaveBeenNthCalledWith(1, '/projects/project-1', { name: '新名称' });
    expect(api.patch).toHaveBeenNthCalledWith(2, '/projects/project-1/status', {
      status: 'ACTIVE',
    });
    expect(api.post).toHaveBeenNthCalledWith(2, '/projects/project-1/archive');
    expect(api.delete).toHaveBeenCalledWith('/projects/project-1', {
      confirmName: '课程项目',
    });
  });

  it('边界场景编码项目与用户路径参数', async () => {
    const api = {
      delete: vi.fn(async () => ({ removed: true as const })),
      get: vi.fn(async () => []),
      patch: vi.fn(async () => ({ id: 'member-1' })),
      post: vi.fn(async () => ({ id: 'member-1' })),
    };

    await listProjectMembers(api as never, 'project/1');
    await inviteProjectMember(api as never, 'project 1', {
      role: 'OBSERVER',
      username: 'viewer',
    });
    await updateProjectMemberRole(api as never, 'project-1', 'user/1', 'OWNER');
    await removeProjectMember(api as never, 'project-1', 'user/1');

    expect(api.get).toHaveBeenCalledWith('/projects/project%2F1/members');
    expect(api.post).toHaveBeenCalledWith('/projects/project%201/members', {
      role: 'OBSERVER',
      username: 'viewer',
    });
    expect(api.patch).toHaveBeenCalledWith('/projects/project-1/members/user%2F1', {
      role: 'OWNER',
    });
    expect(api.delete).toHaveBeenCalledWith('/projects/project-1/members/user%2F1');
  });

  it('失败场景保留 API 异常供页面统一展示', async () => {
    const error = new Error('permission denied');
    const api = {
      get: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(listProjects(api as never)).rejects.toBe(error);
  });
});
