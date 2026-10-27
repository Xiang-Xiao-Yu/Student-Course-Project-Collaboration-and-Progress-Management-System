import { describe, expect, it, vi } from 'vitest';

import {
  createRequirement,
  deleteRequirement,
  getRequirement,
  listRequirements,
  updateRequirement,
} from './requirement-api';

describe('P3 requirement API', () => {
  it('正常场景映射需求生命周期请求', async () => {
    const api = {
      delete: vi.fn(async () => ({ deleted: true as const })),
      get: vi.fn(async () => ({ id: 'requirement-1' })),
      patch: vi.fn(async () => ({ id: 'requirement-1' })),
      post: vi.fn(async () => ({ id: 'requirement-1' })),
    };

    await listRequirements(api as never, 'project-1');
    await createRequirement(api as never, 'project-1', {
      acceptanceCriteria: '可查看关联任务',
      priority: 'HIGH',
      title: '需求管理',
    });
    await getRequirement(api as never, 'project-1', 'requirement-1');
    await updateRequirement(api as never, 'project-1', 'requirement-1', {
      status: 'CONFIRMED',
    });
    await deleteRequirement(api as never, 'project-1', 'requirement-1');

    expect(api.get).toHaveBeenNthCalledWith(1, '/projects/project-1/requirements');
    expect(api.post).toHaveBeenCalledWith('/projects/project-1/requirements', {
      acceptanceCriteria: '可查看关联任务',
      priority: 'HIGH',
      title: '需求管理',
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/projects/project-1/requirements/requirement-1');
    expect(api.patch).toHaveBeenCalledWith('/projects/project-1/requirements/requirement-1', {
      status: 'CONFIRMED',
    });
    expect(api.delete).toHaveBeenCalledWith('/projects/project-1/requirements/requirement-1');
  });

  it('边界场景编码路径参数', async () => {
    const api = { get: vi.fn(async () => []) };

    await listRequirements(api as never, 'project/1');

    expect(api.get).toHaveBeenCalledWith('/projects/project%2F1/requirements');
  });

  it('失败场景保留 API 异常', async () => {
    const error = new Error('permission denied');
    const api = {
      get: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(listRequirements(api as never, 'project-1')).rejects.toBe(error);
  });
});
