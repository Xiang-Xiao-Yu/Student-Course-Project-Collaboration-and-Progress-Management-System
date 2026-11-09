import { describe, expect, it, vi } from 'vitest';

import {
  createAcceptance,
  getAcceptance,
  listAcceptances,
  updateAcceptance,
} from './acceptance-api';

describe('P5 acceptance API', () => {
  it('正常场景请求验收列表、详情和创建', async () => {
    const api = {
      get: vi.fn(async () => ({})),
      post: vi.fn(async () => ({})),
    };

    await listAcceptances(api as never, 'project/1');
    await getAcceptance(api as never, 'project/1', 'acceptance/1');
    await createAcceptance(api as never, 'project/1', {
      acceptanceDate: '2026-11-20',
      goal: '完成 P5',
      participantIds: ['user-1'],
      stageName: 'P5 阶段验收',
      standards: '用户可以完成会议和阶段验收流程。',
    });

    expect(api.get).toHaveBeenNthCalledWith(1, '/projects/project%2F1/acceptances');
    expect(api.get).toHaveBeenNthCalledWith(2, '/projects/project%2F1/acceptances/acceptance%2F1');
    expect(api.post).toHaveBeenCalledWith('/projects/project%2F1/acceptances', {
      acceptanceDate: '2026-11-20',
      goal: '完成 P5',
      participantIds: ['user-1'],
      stageName: 'P5 阶段验收',
      standards: '用户可以完成会议和阶段验收流程。',
    });
  });

  it('边界场景提交未通过原因并再次进入验收', async () => {
    const api = {
      patch: vi.fn(async () => ({})),
    };

    await updateAcceptance(api as never, 'project-1', 'acceptance-1', {
      failureReason: '缺少边界测试',
      result: 'FAILED',
    });
    await updateAcceptance(api as never, 'project-1', 'acceptance-1', {
      result: 'IN_PROGRESS',
    });

    expect(api.patch).toHaveBeenNthCalledWith(1, '/projects/project-1/acceptances/acceptance-1', {
      failureReason: '缺少边界测试',
      result: 'FAILED',
    });
    expect(api.patch).toHaveBeenNthCalledWith(2, '/projects/project-1/acceptances/acceptance-1', {
      result: 'IN_PROGRESS',
    });
  });

  it('失败场景保留验收 API 异常', async () => {
    const error = new Error('acceptance unavailable');
    const api = {
      get: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(listAcceptances(api as never, 'project-1')).rejects.toBe(error);
  });
});
