import { describe, expect, it, vi } from 'vitest';

import { createComment, deleteComment, listComments, updateComment } from './comment-api';

describe('P4 comment API', () => {
  it('正常场景请求任务评论列表和创建评论', async () => {
    const api = {
      get: vi.fn(async () => []),
      post: vi.fn(async () => ({})),
    };

    await listComments(api as never, 'project/1', 'TASK', 'task/1');
    await createComment(api as never, 'project/1', {
      content: '需要补充边界测试。',
      targetId: 'task/1',
      targetType: 'TASK',
    });

    expect(api.get).toHaveBeenCalledWith(
      '/projects/project%2F1/comments?targetId=task%2F1&targetType=TASK',
    );
    expect(api.post).toHaveBeenCalledWith('/projects/project%2F1/comments', {
      content: '需要补充边界测试。',
      targetId: 'task/1',
      targetType: 'TASK',
    });
  });

  it('边界场景修改和删除本人评论', async () => {
    const api = {
      delete: vi.fn(async () => ({ deleted: true })),
      patch: vi.fn(async () => ({})),
    };

    await updateComment(api as never, 'project-1', 'comment/1', {
      content: '已补充边界测试。',
    });
    await deleteComment(api as never, 'project-1', 'comment/1');

    expect(api.patch).toHaveBeenCalledWith('/projects/project-1/comments/comment%2F1', {
      content: '已补充边界测试。',
    });
    expect(api.delete).toHaveBeenCalledWith('/projects/project-1/comments/comment%2F1');
  });

  it('失败场景保留 API 异常', async () => {
    const error = new Error('comment target missing');
    const api = {
      get: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(
      listComments(api as never, 'project-1', 'REQUIREMENT', 'requirement-1'),
    ).rejects.toBe(error);
  });
});
