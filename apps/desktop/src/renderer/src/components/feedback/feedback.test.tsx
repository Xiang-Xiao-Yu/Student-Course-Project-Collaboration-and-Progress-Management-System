import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState } from '../EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

describe('P0.3 feedback components', () => {
  it('正常场景显示加载状态', () => {
    const html = renderToStaticMarkup(<LoadingState label="正在载入项目" />);

    expect(html).toContain('role="status"');
    expect(html).toContain('正在载入项目');
  });

  it('边界场景允许较长的空状态标题和描述', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        description="当前筛选条件下没有匹配的数据，调整条件后可以重新查看完整结果。"
        title="当前筛选条件下没有匹配的项目任务记录"
      />,
    );

    expect(html).toContain('当前筛选条件下没有匹配的项目任务记录');
  });

  it('失败场景显示可操作的错误信息', () => {
    const html = renderToStaticMarkup(
      <ErrorState
        actionLabel="重新加载"
        message="服务暂时不可用，请稍后重试。"
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('服务暂时不可用，请稍后重试。');
    expect(html).toContain('重新加载');
  });

  it('未保存内容弹窗提供继续编辑和放弃更改操作', () => {
    const html = renderToStaticMarkup(
      <UnsavedChangesDialog onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );

    expect(html).toContain('存在未保存内容');
    expect(html).toContain('继续编辑');
    expect(html).toContain('放弃更改');
  });
});
