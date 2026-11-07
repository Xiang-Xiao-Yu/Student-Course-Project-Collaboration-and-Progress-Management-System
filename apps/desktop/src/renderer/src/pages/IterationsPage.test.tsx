import { isValidElement } from 'react';
import type { ChangeEvent, DependencyList, EffectCallback, ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { IterationsPage } from './IterationsPage';

const boundary = vi.hoisted(() => ({
  api: {
    delete: vi.fn<(path: string) => Promise<unknown>>(),
    get: vi.fn<(path: string) => Promise<unknown>>(),
    post: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
  },
  useEffect: vi.fn<(effect: EffectCallback, dependencies?: DependencyList) => void>(),
  useRef: vi.fn<(initial: unknown) => { current: unknown }>(),
  useState: vi.fn<(initial: unknown) => [unknown, (value: unknown) => void]>(),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: boundary.useEffect,
  useRef: boundary.useRef,
  useState: boundary.useState,
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ projectId: 'project-1' }),
}));

vi.mock('../features/auth/session', () => ({
  useSession: () => ({ api: boundary.api }),
}));

interface EffectSlot {
  readonly cleanup: ReturnType<EffectCallback>;
  readonly dependencies: DependencyList | undefined;
}

function findElements(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = [];
  function visit(current: ReactNode): void {
    if (Array.isArray(current)) {
      current.forEach(visit);
    } else if (isValidElement<{ children?: ReactNode }>(current)) {
      if (current.type === type) found.push(current);
      visit(current.props.children);
    }
  }
  visit(node);
  return found;
}

class PageReplay {
  private readonly slots: unknown[] = [];
  private readonly effects = new Map<number, EffectSlot>();
  private pendingEffects: Array<() => void> = [];
  private index = 0;
  private needsRender = true;
  private tree: ReactNode = null;

  constructor() {
    boundary.useState.mockImplementation((initial) => {
      const index = this.index++;
      if (!(index in this.slots)) {
        this.slots[index] = typeof initial === 'function' ? initial() : initial;
      }
      return [
        this.slots[index],
        (value: unknown) => {
          const next = typeof value === 'function' ? value(this.slots[index]) : value;
          if (!Object.is(next, this.slots[index])) {
            this.slots[index] = next;
            this.needsRender = true;
          }
        },
      ];
    });
    boundary.useRef.mockImplementation((initial) => {
      const index = this.index++;
      if (!(index in this.slots)) this.slots[index] = { current: initial };
      return this.slots[index] as { current: unknown };
    });
    boundary.useEffect.mockImplementation((effect, dependencies) => {
      const index = this.index++;
      const previous = this.effects.get(index);
      if (
        !previous ||
        !dependencies ||
        dependencies.some((value, offset) => !Object.is(value, previous.dependencies?.[offset]))
      ) {
        this.pendingEffects.push(() => {
          previous?.cleanup?.();
          this.effects.set(index, { cleanup: effect(), dependencies });
        });
      }
    });
    this.render();
  }

  render(): void {
    do {
      this.index = 0;
      this.needsRender = false;
      this.tree = IterationsPage();
      const effects = this.pendingEffects;
      this.pendingEffects = [];
      effects.forEach((effect) => effect());
    } while (this.needsRender);
  }

  async settle(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.render();
  }

  find(type: unknown): ReactElement<Record<string, unknown>>[] {
    return findElements(this.tree, type);
  }

  clickButton(label: string): void {
    const button = this.find('button').find((item) => item.props.children === label);
    const onClick = button?.props.onClick as (() => void) | undefined;
    if (!onClick) throw new Error(`Missing button: ${label}`);
    onClick();
    this.render();
  }

  select(id: string): void {
    const button = this.find('button').find((item) => item.key === id);
    const onClick = button?.props.onClick as (() => void) | undefined;
    if (!onClick) throw new Error(`Missing iteration: ${id}`);
    onClick();
    this.render();
  }

  form(className: string): ReactElement<Record<string, unknown>> {
    const form = this.find('form').find((item) => String(item.props.className).includes(className));
    if (!form) throw new Error(`Missing form: ${className}`);
    return form;
  }

  change(form: ReactNode, type: 'input' | 'textarea', index: number, value: string): void {
    const input = findElements(form, type)[index];
    const onChange = input?.props.onChange as
      ((event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void) | undefined;
    if (!onChange) throw new Error(`Missing ${type}: ${index}`);
    onChange({ target: { value } } as ChangeEvent<HTMLInputElement | HTMLTextAreaElement>);
    this.render();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

const project = {
  accessRole: 'OWNER',
  id: 'project-1',
  status: 'ACTIVE',
};
const task = {
  completedAt: null as string | null,
  dueDate: null as string | null,
  id: 'task-1',
  status: 'BACKLOG',
  title: '任务一',
};
const iteration = (id: string, tasks = [task], status = 'IN_PROGRESS') => ({
  createdAt: '2026-11-01T00:00:00.000Z',
  endDate: '2026-11-30T00:00:00.000Z',
  goal: '原始目标',
  id,
  name: `迭代 ${id}`,
  projectId: 'project-1',
  startDate: '2026-11-01T00:00:00.000Z',
  status,
  taskCount: tasks.length,
  tasks,
  updatedAt: '2026-11-01T00:00:00.000Z',
});
const stats = { blocked: 0, completed: 0, completionRate: 0, inProgress: 0, overdue: 0, total: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  boundary.api.get.mockImplementation(async (path) => {
    if (path === '/projects/project-1') return project;
    if (path === '/projects/project-1/tasks') return [task];
    if (path === '/projects/project-1/iterations') return [iteration('a'), iteration('b', [])];
    if (path === '/projects/project-1/iterations/a') return iteration('a');
    if (path === '/projects/project-1/iterations/b') return iteration('b', []);
    if (path.endsWith('/stats')) return stats;
    throw new Error(`Unexpected request: ${path}`);
  });
});

describe('P4 iteration page regressions', () => {
  it('创建新迭代时保留当前未保存的编辑', async () => {
    boundary.api.post.mockResolvedValue(iteration('new', []));
    const page = new PageReplay();
    await page.settle();
    page.clickButton('编辑迭代');
    page.change(page.form('iteration-edit-form'), 'textarea', 0, '未保存目标');

    let createForm = page.form('iteration-form');
    page.change(createForm, 'input', 0, '新迭代');
    createForm = page.form('iteration-form');
    page.change(createForm, 'input', 1, '2026-11-01');
    createForm = page.form('iteration-form');
    page.change(createForm, 'input', 2, '2026-11-30');
    createForm = page.form('iteration-form');
    (createForm.props.onSubmit as (event: { preventDefault(): void }) => void)({
      preventDefault: () => {},
    });
    page.render();
    await page.settle();

    const edit = page.form('iteration-edit-form');
    expect(findElements(edit, 'textarea')[0]?.props.value).toBe('未保存目标');
    expect(page.find('h2').some((item) => item.props.children === '迭代 a')).toBe(true);
  });

  it('收起编辑后切换迭代仍需确认未保存内容', async () => {
    const page = new PageReplay();
    await page.settle();
    page.clickButton('编辑迭代');
    page.change(page.form('iteration-edit-form'), 'textarea', 0, '未保存目标');
    page.clickButton('收起编辑');
    page.select('b');

    expect(page.find(ConfirmDialog)).toHaveLength(1);
  });

  it('等待切换迭代时不允许继续编辑旧迭代', async () => {
    const pending = deferred<unknown>();
    let bRequests = 0;
    boundary.api.get.mockImplementation(async (path) => {
      if (path === '/projects/project-1') return project;
      if (path === '/projects/project-1/tasks') return [task];
      if (path === '/projects/project-1/iterations') return [iteration('a'), iteration('b', [])];
      if (path === '/projects/project-1/iterations/a') return iteration('a');
      if (path === '/projects/project-1/iterations/b') {
        bRequests += 1;
        return bRequests === 1 ? iteration('b', []) : pending.promise;
      }
      if (path.endsWith('/stats')) return stats;
      throw new Error(`Unexpected request: ${path}`);
    });
    const page = new PageReplay();
    await page.settle();
    page.clickButton('编辑迭代');
    page.select('b');

    expect(findElements(page.form('iteration-edit-form'), 'textarea')[0]?.props.disabled).toBe(
      true,
    );
    pending.resolve(iteration('b', []));
    await page.settle();
  });

  it('旧迭代移除请求完成时不清除当前迭代的统计错误', async () => {
    const pending = deferred<unknown>();
    boundary.api.delete.mockReturnValue(pending.promise);
    boundary.api.get.mockImplementation(async (path) => {
      if (path === '/projects/project-1') return project;
      if (path === '/projects/project-1/tasks') return [task];
      if (path === '/projects/project-1/iterations') return [iteration('a'), iteration('b', [])];
      if (path === '/projects/project-1/iterations/a') return iteration('a');
      if (path === '/projects/project-1/iterations/b') return iteration('b', []);
      if (path === '/projects/project-1/iterations/b/stats') throw new Error('network');
      if (path.endsWith('/stats')) return stats;
      throw new Error(`Unexpected request: ${path}`);
    });
    const page = new PageReplay();
    await page.settle();
    page.clickButton('移出迭代');
    page.select('b');
    await page.settle();
    expect(page.find(ErrorNotice)).toHaveLength(1);

    pending.resolve(iteration('a', []));
    await page.settle();
    expect(page.find(ErrorNotice)).toHaveLength(1);
  });

  it('重新加载统计时同步其他客户端修改过的任务详情', async () => {
    const overdueTask = { ...task, dueDate: '2026-11-01T00:00:00.000Z' };
    const completedTask = { ...overdueTask, status: 'COMPLETED' };
    let details = 0;
    let statistics = 0;
    boundary.api.get.mockImplementation(async (path) => {
      if (path === '/projects/project-1') return project;
      if (path === '/projects/project-1/tasks') return [overdueTask];
      if (path === '/projects/project-1/iterations') return [iteration('a', [overdueTask])];
      if (path === '/projects/project-1/iterations/a') {
        details += 1;
        return iteration('a', details === 1 ? [overdueTask] : [completedTask]);
      }
      if (path === '/projects/project-1/iterations/a/stats') {
        statistics += 1;
        if (statistics === 1) throw new Error('network');
        return { ...stats, completed: 1, completionRate: 1, overdue: 0 };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const page = new PageReplay();
    await page.settle();
    expect(page.find(ErrorNotice)).toHaveLength(1);
    page.clickButton('重新加载统计');
    await page.settle();

    const cards = page.find('div').find((item) => item.props['aria-label'] === '迭代统计');
    expect(findElements(cards, 'strong')[4]?.props.children).toBe(0);
    expect(page.find('span').some((item) => item.props.children === '已逾期')).toBe(false);
  });

  it('任务刷新返回更新的迭代时保留未保存的编辑', async () => {
    boundary.api.delete.mockResolvedValue({
      ...iteration('a', []),
      updatedAt: '2026-11-02T00:00:00.000Z',
    });
    const page = new PageReplay();
    await page.settle();
    page.clickButton('编辑迭代');
    page.change(page.form('iteration-edit-form'), 'textarea', 0, '未保存目标');
    page.clickButton('移出迭代');
    await page.settle();

    expect(findElements(page.form('iteration-edit-form'), 'textarea')[0]?.props.value).toBe(
      '未保存目标',
    );
  });

  it('任务截止日期显示与上海日历日逾期口径一致', async () => {
    vi.stubEnv('TZ', 'UTC');
    try {
      const timedTask = { ...task, dueDate: '2026-11-06T20:00:00.000Z' };
      const selected = iteration('a', [timedTask]);
      boundary.api.get.mockImplementation(async (path) => {
        if (path === '/projects/project-1') return project;
        if (path === '/projects/project-1/tasks') return [timedTask];
        if (path === '/projects/project-1/iterations') return [selected];
        if (path === '/projects/project-1/iterations/a') return selected;
        if (path.endsWith('/stats')) return stats;
        throw new Error(`Unexpected request: ${path}`);
      });
      const page = new PageReplay();
      await page.settle();
      const row = page.find('article').find((item) => item.key === timedTask.id);
      const detail = findElements(row, 'span').find((item) => Array.isArray(item.props.children));
      expect(detail?.props.children).toContain(' · 截止 2026年11月7日');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('终态迭代只允许移出未完成任务，候选列表不提供已完成任务', async () => {
    const completed = { ...task, id: 'task-2', status: 'COMPLETED', title: '已完成任务' };
    const ended = iteration('a', [task, completed], 'CANCELED');
    boundary.api.get.mockImplementation(async (path) => {
      if (path === '/projects/project-1') return project;
      if (path === '/projects/project-1/tasks') return [completed, task];
      if (path === '/projects/project-1/iterations') return [ended, iteration('b', [])];
      if (path === '/projects/project-1/iterations/a') return ended;
      if (path === '/projects/project-1/iterations/b') return iteration('b', []);
      if (path.endsWith('/stats')) return stats;
      throw new Error(`Unexpected request: ${path}`);
    });
    const page = new PageReplay();
    await page.settle();

    expect(page.find('button').some((button) => button.props.children === '加入迭代')).toBe(false);
    const unfinishedRow = page.find('article').find((item) => item.key === task.id);
    const completedRow = page.find('article').find((item) => item.key === completed.id);
    expect(findElements(unfinishedRow, 'button')).toHaveLength(1);
    expect(findElements(completedRow, 'button')).toHaveLength(0);

    page.select('b');
    await page.settle();
    expect(page.find('option').some((option) => option.props.value === task.id)).toBe(true);
    expect(page.find('option').some((option) => option.props.value === completed.id)).toBe(false);
    boundary.api.post.mockResolvedValue(iteration('b', [task]));
    page.clickButton('加入迭代');
    const dialog = page.find(ConfirmDialog)[0];
    expect(dialog).toBeDefined();
    (dialog?.props.onConfirm as () => void)();
    page.render();
    expect(boundary.api.post).toHaveBeenCalledWith('/projects/project-1/iterations/b/tasks', {
      expectedIterationId: 'a',
      taskId: task.id,
    });
  });
});
