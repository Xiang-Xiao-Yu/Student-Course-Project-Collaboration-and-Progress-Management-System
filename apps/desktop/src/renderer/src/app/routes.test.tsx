import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { buildProjectPath } from './navigation';
import { appRoutes } from './routes';

describe('P0.1 路由骨架', () => {
  it('正常场景可以匹配项目概览路由', () => {
    const matches = matchRoutes(appRoutes, '/projects/demo-project/overview');

    expect(matches?.at(-1)?.route.path).toBe('overview');
  });

  it('边界场景可以匹配带尾斜杠的深层路由', () => {
    const matches = matchRoutes(appRoutes, '/projects/demo-project/board/');

    expect(matches?.at(-1)?.route.path).toBe('board');
  });

  it('失败场景可以回退到不存在页面并拒绝空 projectId', () => {
    const matches = matchRoutes(appRoutes, '/projects/demo-project/unknown');

    expect(matches?.at(-1)?.route.path).toBe('*');
    expect(() => buildProjectPath('   ', 'overview')).toThrow('projectId is required');
  });
});
