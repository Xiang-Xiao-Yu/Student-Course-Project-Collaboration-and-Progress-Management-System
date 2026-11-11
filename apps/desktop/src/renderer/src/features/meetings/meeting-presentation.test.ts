import { describe, expect, it } from 'vitest';

import {
  getMeetingActionStatusLabel,
  getMeetingActionStatusTransitions,
  isMeetingActionDueDateBeforeProjectStart,
  isMeetingActionOverdue,
} from './meeting-presentation';

describe('P5 meeting presentation', () => {
  it('正常场景展示行动项状态', () => {
    expect(getMeetingActionStatusLabel('PENDING')).toBe('待处理');
    expect(getMeetingActionStatusLabel('IN_PROGRESS')).toBe('进行中');
  });

  it('边界场景终态不能继续流转', () => {
    expect(getMeetingActionStatusTransitions('PENDING')).toEqual(['IN_PROGRESS', 'CANCELED']);
    expect(getMeetingActionStatusTransitions('COMPLETED')).toEqual([]);
  });

  it('失败场景按北京日历日判断行动项逾期', () => {
    expect(
      isMeetingActionOverdue(
        '2026-11-09T00:00:00.000Z',
        'PENDING',
        new Date('2026-11-09T15:59:59.999Z'),
      ),
    ).toBe(false);
    expect(
      isMeetingActionOverdue(
        '2026-11-09T00:00:00.000Z',
        'PENDING',
        new Date('2026-11-09T16:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isMeetingActionOverdue(
        '2026-11-01T00:00:00.000Z',
        'COMPLETED',
        new Date('2026-11-10T00:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('边界场景拒绝早于项目开始日期的行动项转换', () => {
    expect(
      isMeetingActionDueDateBeforeProjectStart(
        '2026-11-01T00:00:00.000Z',
        '2026-11-05T00:00:00.000Z',
      ),
    ).toBe(true);
    expect(
      isMeetingActionDueDateBeforeProjectStart(
        '2026-11-05T00:00:00.000Z',
        '2026-11-05T00:00:00.000Z',
      ),
    ).toBe(false);
  });
});
