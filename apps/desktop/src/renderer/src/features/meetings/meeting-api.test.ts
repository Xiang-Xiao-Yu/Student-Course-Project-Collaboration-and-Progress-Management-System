import { describe, expect, it, vi } from 'vitest';

import {
  convertMeetingAction,
  createMeeting,
  createMeetingAction,
  getMeeting,
  listMeetings,
  updateMeeting,
  updateMeetingAction,
} from './meeting-api';

describe('P5 meeting API', () => {
  it('正常场景请求会议列表、详情和创建', async () => {
    const api = {
      get: vi.fn(async () => ({})),
      post: vi.fn(async () => ({})),
    };

    await listMeetings(api as never, 'project/1');
    await getMeeting(api as never, 'project/1', 'meeting/1');
    await createMeeting(api as never, 'project/1', {
      agenda: '评审 P5',
      participantIds: ['user-1'],
      scheduledAt: '2026-11-09T02:00:00.000Z',
      title: 'P5 评审会议',
    });

    expect(api.get).toHaveBeenNthCalledWith(1, '/projects/project%2F1/meetings');
    expect(api.get).toHaveBeenNthCalledWith(2, '/projects/project%2F1/meetings/meeting%2F1');
    expect(api.post).toHaveBeenCalledWith('/projects/project%2F1/meetings', {
      agenda: '评审 P5',
      participantIds: ['user-1'],
      scheduledAt: '2026-11-09T02:00:00.000Z',
      title: 'P5 评审会议',
    });
  });

  it('边界场景修改会议、行动项并转换为任务', async () => {
    const api = {
      patch: vi.fn(async () => ({})),
      post: vi.fn(async () => ({})),
    };

    await updateMeeting(api as never, 'project-1', 'meeting-1', {
      minutes: '会议纪要',
    });
    await createMeetingAction(api as never, 'project-1', 'meeting-1', {
      assigneeId: 'user-1',
      dueDate: '2026-11-20',
      title: '补充测试',
    });
    await updateMeetingAction(api as never, 'project-1', 'meeting-1', 'action/1', {
      status: 'COMPLETED',
    });
    await convertMeetingAction(api as never, 'project-1', 'meeting-1', 'action/1');

    expect(api.patch).toHaveBeenNthCalledWith(1, '/projects/project-1/meetings/meeting-1', {
      minutes: '会议纪要',
    });
    expect(api.post).toHaveBeenNthCalledWith(1, '/projects/project-1/meetings/meeting-1/actions', {
      assigneeId: 'user-1',
      dueDate: '2026-11-20',
      title: '补充测试',
    });
    expect(api.patch).toHaveBeenNthCalledWith(
      2,
      '/projects/project-1/meetings/meeting-1/actions/action%2F1',
      { status: 'COMPLETED' },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/projects/project-1/meetings/meeting-1/actions/action%2F1/convert',
    );
  });

  it('失败场景保留会议 API 异常', async () => {
    const error = new Error('meeting unavailable');
    const api = {
      get: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(listMeetings(api as never, 'project-1')).rejects.toBe(error);
  });
});
