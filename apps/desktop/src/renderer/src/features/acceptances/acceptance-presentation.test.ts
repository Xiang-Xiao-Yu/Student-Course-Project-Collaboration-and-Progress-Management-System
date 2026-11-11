import { describe, expect, it } from 'vitest';

import {
  canCreateRemediationTask,
  getAcceptanceResultLabel,
  getAcceptanceResultTransitions,
} from './acceptance-presentation';

describe('P5 acceptance presentation', () => {
  it('正常场景展示验收结果', () => {
    expect(getAcceptanceResultLabel('NOT_STARTED')).toBe('未开始');
    expect(getAcceptanceResultLabel('FAILED')).toBe('未通过');
  });

  it('边界场景只允许合法结果转换', () => {
    expect(getAcceptanceResultTransitions('FAILED')).toEqual(['IN_PROGRESS']);
    expect(getAcceptanceResultTransitions('PASSED')).toEqual([]);
  });

  it('失败场景只有未通过验收可以创建整改任务', () => {
    expect(canCreateRemediationTask('FAILED')).toBe(true);
    expect(canCreateRemediationTask('IN_PROGRESS')).toBe(false);
  });
});
