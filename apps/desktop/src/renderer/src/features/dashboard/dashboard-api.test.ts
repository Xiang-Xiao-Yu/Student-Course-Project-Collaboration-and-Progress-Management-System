import { describe, expect, it, vi } from 'vitest';

import { exportProjectProgressReport, getProjectDashboard } from './dashboard-api';

describe('P6 dashboard API', () => {
  it('正常场景读取项目仪表盘', async () => {
    const api = { get: vi.fn(async () => ({ asOf: '2026-11-11T00:00:00.000Z' })) };

    await getProjectDashboard(api as never, 'project/1');

    expect(api.get).toHaveBeenCalledWith('/projects/project%2F1/dashboard');
  });

  it('边界场景导出项目进度报告', async () => {
    const api = {
      download: vi.fn(async () => ({
        blob: new Blob(['csv']),
        filename: 'progress-project-1.csv',
      })),
    };

    await exportProjectProgressReport(api, 'project-1');

    expect(api.download).toHaveBeenCalledWith('/projects/project-1/reports/progress');
  });

  it('失败场景保留仪表盘 API 异常', async () => {
    const error = new Error('dashboard unavailable');
    const api = { get: vi.fn(async () => Promise.reject(error)) };

    await expect(getProjectDashboard(api, 'project-1')).rejects.toBe(error);
  });
});
