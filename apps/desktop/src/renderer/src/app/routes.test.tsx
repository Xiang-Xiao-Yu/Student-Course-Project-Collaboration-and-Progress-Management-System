import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { buildProjectPath, buildRequirementPath, buildTaskPath } from './navigation';
import { appRoutes } from './routes';

describe('P0.1 路由骨架', () => {
  it('正常场景可以匹配项目概览路由', () => {
    const matches = matchRoutes(appRoutes, '/projects/demo-project/overview');

    expect(matches?.at(-1)?.route.path).toBe('overview');
  });

  it('项目中心与项目设置路由均可匹配', () => {
    expect(matchRoutes(appRoutes, '/projects')?.at(-1)?.route.index).toBe(true);
    expect(matchRoutes(appRoutes, '/projects/demo-project/settings')?.at(-1)?.route.path).toBe(
      'settings',
    );
  });

  it('需求详情路由可匹配并编码路径参数', () => {
    expect(
      matchRoutes(appRoutes, '/projects/demo-project/requirements/requirement-1')?.at(-1)?.route
        .path,
    ).toBe('requirements/:requirementId');
    expect(buildRequirementPath('project 1', 'requirement/1')).toBe(
      '/projects/project%201/requirements/requirement%2F1',
    );
  });

  it('任务详情路由可匹配并编码路径参数', () => {
    expect(matchRoutes(appRoutes, '/projects/demo-project/board/task-1')?.at(-1)?.route.path).toBe(
      'board/:taskId',
    );
    expect(buildTaskPath('project 1', 'task/1')).toBe('/projects/project%201/board/task%2F1');
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
