import { isValidElement } from 'react';
import type {
  ChangeEvent,
  ComponentProps,
  DependencyList,
  EffectCallback,
  ReactElement,
  ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { CommentPanel } from '../features/comments/CommentPanel';
import type { ProjectDto } from '../features/projects/project-api';
import type { RequirementDto } from '../features/requirements/requirement-api';
import { RequirementDetailPage } from './RequirementDetailPage';
import { RequirementsPage } from './RequirementsPage';

const boundary = vi.hoisted(() => ({
  api: {
    delete: vi.fn<(path: string) => Promise<{ deleted: true }>>(),
    get: vi.fn<(path: string) => Promise<unknown>>(),
    patch: vi.fn<(path: string, input: unknown) => Promise<RequirementDto>>(),
    post: vi.fn<(path: string, input: unknown) => Promise<RequirementDto>>(),
  },
  navigate: vi.fn<(path: string) => void>(),
  params: { projectId: 'project-1', requirementId: 'a' },
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
  useNavigate: () => boundary.navigate,
  useParams: () => boundary.params,
}));

vi.mock('../features/auth/session', () => ({
  useSession: () => ({
    api: boundary.api,
    session: { user: { id: 'owner-1' } },
  }),
}));

interface EffectSlot {
  readonly cleanup: ReturnType<EffectCallback>;
  readonly dependencies: DependencyList | undefined;
}

// The existing test runtime has no DOM. Replay only the hook host while keeping
// the page, its form callbacks, validation, permissions and API adapters real.
class PageReplay {
  private readonly slots: unknown[] = [];
  private readonly effects = new Map<number, EffectSlot>();
  private pendingEffects: Array<() => void> = [];
  private index = 0;
  private needsRender = true;
  private tree: ReactNode = null;

  constructor(private readonly component: () => ReactElement) {
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
      this.tree = this.component();
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
    const found: ReactElement<Record<string, unknown>>[] = [];
    function visit(node: ReactNode): void {
      if (Array.isArray(node)) {
        node.forEach(visit);
      } else if (isValidElement<{ children?: ReactNode }>(node)) {
        if (node.type === type) found.push(node);
        visit(node.props.children);
      }
    }
    visit(this.tree);
    return found;
  }

  props<P>(type: unknown, index = 0): P {
    const element = this.find(type)[index];
    if (!element) throw new Error(`Missing page element at index ${index}`);
    return element.props as P;
  }

  title(): string | number | readonly string[] | undefined {
    return this.props<ComponentProps<'input'>>('input').value;
  }

  changeTitle(value: string): void {
    this.props<ComponentProps<'input'>>('input').onChange?.({
      target: { value },
    } as ChangeEvent<HTMLInputElement>);
    this.render();
  }

  submit(): void {
    this.props<ComponentProps<'form'>>('form').onSubmit?.({
      preventDefault: vi.fn(),
    } as unknown as Parameters<NonNullable<ComponentProps<'form'>['onSubmit']>>[0]);
    this.render();
  }

  confirmDelete(): void {
    const button = this.find('button').find((element) => element.props.children === '删除需求');
    const onClick = button?.props.onClick as (() => void) | undefined;
    if (!onClick) throw new Error('Missing delete action');
    onClick();
    this.render();
    this.props<ComponentProps<typeof ConfirmDialog>>(ConfirmDialog).onConfirm();
    this.render();
  }

  guardsUnsavedChanges(): boolean {
    return this.props<ComponentProps<typeof UnsavedChangesGuard>>(UnsavedChangesGuard).when;
  }

  async openRequirement(requirementId: string): Promise<void> {
    boundary.params = { projectId: 'project-1', requirementId };
    this.render();
    await this.settle();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}

const project: ProjectDto = {
  accessRole: 'OWNER',
  createdAt: '2026-11-03T00:00:00.000Z',
  description: null,
  endDate: null,
  id: 'project-1',
  name: '课程项目',
  ownerId: 'owner-1',
  startDate: null,
  status: 'ACTIVE',
  updatedAt: '2026-11-03T00:00:00.000Z',
};

function requirement(id: string, title = `需求 ${id}`): RequirementDto {
  return {
    acceptanceCriteria: '可以查看关联任务',
    createdAt: '2026-11-03T00:00:00.000Z',
    creatorId: 'owner-1',
    description: '',
    id,
    number: `REQ-${id}`,
    priority: 'MEDIUM',
    projectId: 'project-1',
    status: 'DRAFT',
    tasks: [],
    title,
    updatedAt: '2026-11-03T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.params = { projectId: 'project-1', requirementId: 'a' };
  boundary.api.get.mockImplementation(async (path) => {
    if (path === '/projects/project-1') return project;
    if (path === '/projects/project-1/requirements') return [];
    if (path.startsWith('/projects/project-1/comments?')) return [];
    const id = path.match(/^\/projects\/project-1\/requirements\/(.+)$/)?.[1];
    if (id) return requirement(id);
    throw new Error(`Unexpected request: ${path}`);
  });
});

async function createDraft(): Promise<PageReplay> {
  const page = new PageReplay(RequirementsPage);
  await page.settle();
  page.changeTitle('新需求草稿');
  page.props<ComponentProps<'textarea'>>('textarea', 1).onChange?.({
    target: { value: '验证草稿不会丢失' },
  } as ChangeEvent<HTMLTextAreaElement>);
  page.render();
  return page;
}

describe('FR-04 需求页面异步操作回归', () => {
  it('评论草稿与需求表单共用离开提醒', async () => {
    const page = new PageReplay(RequirementDetailPage);
    await page.settle();
    const panel = page.props<
      ComponentProps<typeof CommentPanel> & {
        onDirtyChange?: (dirty: boolean) => void;
      }
    >(CommentPanel);

    panel.onDirtyChange?.(true);
    page.render();
    expect(page.guardsUnsavedChanges()).toBe(true);
    panel.onDirtyChange?.(false);
    page.render();
    expect(page.guardsUnsavedChanges()).toBe(false);
  });

  it('创建请求尚未完成时继续提示未保存内容', async () => {
    const pending = deferred<RequirementDto>();
    boundary.api.post.mockReturnValue(pending.promise);
    const page = await createDraft();

    page.submit();

    expect(page.guardsUnsavedChanges()).toBe(true);
    expect(page.title()).toBe('新需求草稿');
    expect(page.props<ComponentProps<'input'>>('input').disabled).toBe(true);
  });

  it('创建失败保留草稿，成功后才清除离开提示', async () => {
    const pending = deferred<RequirementDto>();
    boundary.api.post.mockReturnValueOnce(pending.promise);
    const page = await createDraft();
    page.submit();
    pending.reject(new Error('network failed'));
    await page.settle();

    expect(page.title()).toBe('新需求草稿');
    expect(page.guardsUnsavedChanges()).toBe(true);
    expect(page.find(ErrorNotice)).toHaveLength(1);

    boundary.api.post.mockResolvedValueOnce(requirement('new', '新需求草稿'));
    page.submit();
    await page.settle();
    expect(page.title()).toBe('');
    expect(page.guardsUnsavedChanges()).toBe(false);
  });

  it('脏表单删除成功先解除离开提示并关闭弹窗，再返回列表', async () => {
    const pending = deferred<{ deleted: true }>();
    boundary.api.delete.mockReturnValue(pending.promise);
    const page = new PageReplay(RequirementDetailPage);
    await page.settle();
    page.changeTitle('尚未保存的编辑');
    const navigation: Array<{ guard: boolean; path: string; dialogs: number }> = [];
    boundary.navigate.mockImplementation((path) => {
      navigation.push({
        dialogs: page.find(ConfirmDialog).length,
        guard: page.guardsUnsavedChanges(),
        path,
      });
    });

    page.confirmDelete();
    pending.resolve({ deleted: true });
    await page.settle();

    expect(navigation).toEqual([
      { dialogs: 0, guard: false, path: '/projects/project-1/requirements' },
    ]);
  });

  it('删除失败保留编辑内容和离开提示，并显示错误', async () => {
    boundary.api.delete.mockRejectedValue(new Error('delete failed'));
    const page = new PageReplay(RequirementDetailPage);
    await page.settle();
    page.changeTitle('保留编辑');

    page.confirmDelete();
    await page.settle();

    expect(page.title()).toBe('保留编辑');
    expect(page.guardsUnsavedChanges()).toBe(true);
    expect(page.find(ErrorNotice)).toHaveLength(1);
    expect(page.find(ConfirmDialog)).toHaveLength(0);
    expect(boundary.navigate).not.toHaveBeenCalled();
  });

  it.each(['b', 'a'])('切换至需求 %s 后丢弃上一轮保存成功响应', async (target) => {
    const pending = deferred<RequirementDto>();
    boundary.api.patch.mockReturnValue(pending.promise);
    const page = new PageReplay(RequirementDetailPage);
    await page.settle();
    page.changeTitle('旧保存内容');
    page.submit();
    await page.openRequirement('b');
    if (target === 'a') await page.openRequirement('a');
    page.changeTitle('当前未保存编辑');

    pending.resolve(requirement('a', '旧保存结果'));
    await page.settle();

    expect(page.title()).toBe('当前未保存编辑');
    expect(page.guardsUnsavedChanges()).toBe(true);
    expect(page.props<ComponentProps<'input'>>('input').disabled).toBe(false);
  });

  it('旧保存失败不会显示在新需求，也不会结束新需求的保存状态', async () => {
    const oldSave = deferred<RequirementDto>();
    const newSave = deferred<RequirementDto>();
    boundary.api.patch.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(newSave.promise);
    const page = new PageReplay(RequirementDetailPage);
    await page.settle();
    page.changeTitle('保存 A');
    page.submit();
    await page.openRequirement('b');
    page.changeTitle('保存 B');
    page.submit();

    oldSave.reject(new Error('old request failed'));
    await page.settle();

    expect(page.find(ErrorNotice)).toHaveLength(0);
    expect(page.props<ComponentProps<'input'>>('input').disabled).toBe(true);
    newSave.resolve(requirement('b', '保存 B'));
    await page.settle();
    expect(page.title()).toBe('保存 B');
    expect(page.guardsUnsavedChanges()).toBe(false);
  });

  it('旧需求删除完成不会带走新需求页面或保留旧删除弹窗', async () => {
    const pending = deferred<{ deleted: true }>();
    boundary.api.delete.mockReturnValue(pending.promise);
    const page = new PageReplay(RequirementDetailPage);
    await page.settle();
    page.confirmDelete();
    await page.openRequirement('b');

    pending.resolve({ deleted: true });
    await page.settle();

    expect(page.title()).toBe('需求 b');
    expect(page.find(ConfirmDialog)).toHaveLength(0);
    expect(boundary.navigate).not.toHaveBeenCalled();
  });
});
