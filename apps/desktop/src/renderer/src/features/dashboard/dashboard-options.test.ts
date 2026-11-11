import { describe, expect, it } from 'vitest';

import {
  buildBurndownOption,
  buildCompletionTrendOption,
  buildIterationOption,
  buildMemberTaskOption,
  buildTaskStatusOption,
} from './dashboard-options';

describe('P6 dashboard chart options', () => {
  it('正常场景生成任务状态和成员分布图', () => {
    const status = buildTaskStatusOption([
      { count: 2, status: 'TODO' },
      { count: 1, status: 'COMPLETED' },
    ]);
    const members = buildMemberTaskOption([
      {
        avatarUrl: null,
        blockedTasks: 1,
        completedTasks: 3,
        inProgressTasks: 2,
        nickname: '成员 A',
        overdueTasks: 0,
        totalTasks: 6,
        userId: 'user-1',
        username: 'member-a',
      },
    ]);

    expect(Array.isArray(status.series) ? status.series : []).toHaveLength(1);
    expect(Array.isArray(members.series) ? members.series : []).toHaveLength(5);
    expect(members.series).toContainEqual(
      expect.objectContaining({
        data: [6],
        name: '任务总数',
        type: 'bar',
      }),
    );
    expect(members.xAxis).toMatchObject({ data: ['成员 A'], type: 'category' });
    expect(members.yAxis).toMatchObject({ max: 6, minInterval: 1 });
  });

  it('边界场景迭代完成率转换为百分比', () => {
    const option = buildIterationOption([
      {
        completedTasks: 1,
        completionRate: 0.5,
        id: 'iteration-1',
        name: '迭代一',
        status: 'IN_PROGRESS',
        totalTasks: 2,
      },
    ]);

    expect(option.series).toEqual([
      expect.objectContaining({
        data: [50],
        type: 'bar',
      }),
    ]);
  });

  it('失败或空数据场景仍生成可渲染的趋势与燃尽图', () => {
    const trend = buildCompletionTrendOption([]);
    const burndown = buildBurndownOption([]);

    expect(Array.isArray(trend.series) ? trend.series : []).toHaveLength(2);
    expect(Array.isArray(burndown.series) ? burndown.series : []).toHaveLength(2);
  });
});
