import { isValidElement } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ProjectDto } from '../features/projects/project-api';
import { TaskFormFields } from '../features/tasks/TaskFormFields';
import type { TaskDto } from '../features/tasks/task-api';
import { BoardPage } from './BoardPage';

const hooks = vi.hoisted(() => ({
  cursor: 0,
  effects: [] as Array<() => void>,
  mounted: false,
  values: [] as unknown[],
}));
const requests = vi.hoisted(() => ({
  create: vi.fn(),
  edit: vi.fn(),
  list: vi.fn(),
  project: vi.fn(),
  remove: vi.fn(),
  status: vi.fn(),
}));

// The project uses node-only tests. Replay the real page's JSX handlers with
// persistent hook state; API promises control response timing without a DOM.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void) => {
    if (!hooks.mounted) hooks.effects.push(effect);
  },
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) {
      hooks.values[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    return [
      hooks.values[index],
      (value: T | ((previous: T) => T)) => {
        hooks.values[index] =
          typeof value === 'function'
            ? (value as (previous: T) => T)(hooks.values[index] as T)
            : value;
      },
    ];
  },
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ projectId: 'project-1' }),
}));
vi.mock('../features/auth/session', () => ({
  useSession: () => ({ api: {}, session: { user: { id: 'owner-1' } } }),
}));
vi.mock('../features/projects/project-api', () => ({
  getProject: requests.project,
  listProjectMembers: async () => [],
}));
vi.mock('../features/requirements/requirement-api', () => ({ listRequirements: async () => [] }));
vi.mock('../features/tasks/task-api', () => ({
  createTask: requests.create,
  deleteTask: requests.remove,
  listTasks: requests.list,
  updateTask: requests.edit,
  updateTaskStatus: requests.status,
}));

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
const task: TaskDto = {
  assigneeId: 'owner-1',
  completedAt: null,
  completionNote: null,
  createdAt: '2026-11-03T00:00:00.000Z',
  createdById: 'owner-1',
  description: null,
  dueDate: null,
  estimatedHours: null,
  id: 'task-a',
  priority: 'MEDIUM',
  projectId: 'project-1',
  rejectionReason: null,
  requirementId: null,
  status: 'BACKLOG',
  tagNames: [],
  title: '任务 A',
  updatedAt: '2026-11-03T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function render(): ReactElement {
  hooks.cursor = 0;
  const tree = BoardPage();
  if (!hooks.mounted) {
    hooks.mounted = true;
    hooks.effects.forEach((effect) => effect());
  }
  return tree;
}

function elements(node: ReactNode): ReactElement<{ children?: ReactNode }>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function buttons(tree: ReactNode, label: string): ReactElement<ComponentProps<'button'>>[] {
  return elements(tree).filter(
    (element) => element.type === 'button' && element.props.children === label,
  ) as ReactElement<ComponentProps<'button'>>[];
}

function click(tree: ReactNode, label: string, index = 0): void {
  buttons(tree, label)[index]!.props.onClick?.({} as never);
}

function forms(tree: ReactNode): ReactElement<ComponentProps<'form'>>[] {
  return elements(tree).filter((element) => element.type === 'form') as ReactElement<
    ComponentProps<'form'>
  >[];
}

function fields(tree: ReactNode): ReactElement<ComponentProps<typeof TaskFormFields>>[] {
  return elements(tree).filter((element) => element.type === TaskFormFields) as ReactElement<
    ComponentProps<typeof TaskFormFields>
  >[];
}

function confirmations(tree: ReactNode): ReactElement<ComponentProps<typeof ConfirmDialog>>[] {
  return elements(tree).filter((element) => element.type === ConfirmDialog) as ReactElement<
    ComponentProps<typeof ConfirmDialog>
  >[];
}

async function loadBoard(): Promise<ReactElement> {
  render();
  await new Promise<void>((resolve) => setImmediate(resolve));
  return render();
}

async function flush(): Promise<ReactElement> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  return render();
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.mounted = false;
  hooks.values = [];
  vi.resetAllMocks();
  requests.project.mockResolvedValue(project);
  requests.list.mockResolvedValue([task, { ...task, id: 'task-b', title: '任务 B' }]);
});

describe('P3 看板任务操作互斥', () => {
  it('关闭未保存编辑时取消保留草稿，确认后才放弃修改', async () => {
    let tree = await loadBoard();
    click(tree, '编辑任务');
    tree = render();
    const editor = fields(tree).at(-1)!.props;
    editor.onChange({ ...editor.values, title: '未保存草稿' });
    tree = render();
    click(tree, '关闭');
    tree = render();

    expect(confirmations(tree)).toHaveLength(1);
    expect(fields(tree).at(-1)!.props.values.title).toBe('未保存草稿');
    confirmations(tree)[0]!.props.onCancel();
    tree = render();
    expect(confirmations(tree)).toHaveLength(0);
    expect(fields(tree).at(-1)!.props.values.title).toBe('未保存草稿');

    click(tree, '关闭');
    tree = render();
    confirmations(tree)[0]!.props.onConfirm();
    tree = render();
    expect(fields(tree)).toHaveLength(1);
    click(tree, '编辑任务');
    tree = render();
    expect(fields(tree).at(-1)!.props.values.title).toBe('任务 A');
  });

  it('没有修改的任务编辑器可以直接关闭', async () => {
    let tree = await loadBoard();
    click(tree, '编辑任务');
    tree = render();
    click(tree, '关闭');
    tree = render();

    expect(confirmations(tree)).toHaveLength(0);
    expect(fields(tree)).toHaveLength(1);
  });

  it('状态响应等待期间不能提交并发编辑，完成后可继续保存新标题', async () => {
    const status = deferred<TaskDto>();
    requests.status.mockReturnValue(status.promise);
    let tree = await loadBoard();
    click(tree, '编辑任务');
    tree = render();
    click(tree, '移至待开始');
    tree = render();

    expect(fields(tree).at(-1)!.props.disabled).toBe(true);
    expect(buttons(tree, '保存任务')[0]!.props.disabled).toBe(true);
    expect(buttons(tree, '删除任务')[0]!.props.disabled).toBe(true);
    expect(elements(tree).filter((element) => element.type === 'article')).toSatisfy(
      (cards: ReactElement<ComponentProps<'article'>>[]) =>
        cards.every((card) => card.props.draggable === false),
    );

    status.resolve({ ...task, status: 'TODO' });
    tree = await flush();
    click(tree, '编辑任务');
    tree = render();
    const editor = fields(tree).at(-1)!.props;
    expect(editor.disabled).toBe(false);
    editor.onChange({ ...editor.values, title: '新标题' });
    tree = render();
    requests.edit.mockResolvedValue({ ...task, status: 'TODO', title: '新标题' });
    forms(tree)
      .at(-1)!
      .props.onSubmit?.({ preventDefault() {} } as never);
    tree = await flush();
    expect(elements(tree).some((element) => element.props.children === '新标题')).toBe(true);
  });

  it('状态响应等待期间不能关闭当前编辑器或打开另一任务，避免关闭其他草稿', async () => {
    const status = deferred<TaskDto>();
    requests.status.mockReturnValue(status.promise);
    let tree = await loadBoard();
    click(tree, '编辑任务');
    tree = render();
    click(tree, '移至待开始');
    tree = render();

    expect(buttons(tree, '关闭')[0]!.props.disabled).toBe(true);
    expect(buttons(tree, '编辑任务').every((button) => button.props.disabled)).toBe(true);
    click(tree, '关闭');
    click(tree, '编辑任务', 1);
    tree = render();
    expect(fields(tree).at(-1)!.props.values.title).toBe('任务 A');

    status.resolve({ ...task, status: 'TODO' });
    tree = await flush();
    click(tree, '编辑任务', 1);
    tree = render();
    const editor = fields(tree).at(-1)!.props;
    editor.onChange({ ...editor.values, title: '任务 B 草稿' });
    expect(fields(render()).at(-1)!.props.values.title).toBe('任务 B 草稿');
  });

  it('状态更新失败后解除互斥并保留任务编辑器', async () => {
    const status = deferred<TaskDto>();
    requests.status.mockReturnValue(status.promise);
    let tree = await loadBoard();
    click(tree, '编辑任务');
    tree = render();
    click(tree, '移至待开始');
    tree = render();
    expect(fields(tree).at(-1)!.props.disabled).toBe(true);

    status.reject(new Error('network unavailable'));
    tree = await flush();
    expect(fields(tree).at(-1)!.props.disabled).toBe(false);
    expect(fields(tree).at(-1)!.props.values.title).toBe('任务 A');
    expect(buttons(tree, '关闭')[0]!.props.disabled).toBe(false);
    expect(buttons(tree, '移至待开始')[0]!.props.disabled).toBe(false);
  });

  it('创建任务仍可与其他任务状态更新并行且两次响应都保留', async () => {
    const status = deferred<TaskDto>();
    requests.status.mockReturnValue(status.promise);
    let tree = await loadBoard();
    click(tree, '编辑任务');
    tree = render();
    click(tree, '移至待开始');
    tree = render();
    const create = fields(tree)[0]!.props;
    expect(create.disabled).toBe(false);
    create.onChange({ ...create.values, title: '并行创建' });
    tree = render();
    requests.create.mockResolvedValue({ ...task, id: 'task-c', title: '并行创建' });
    forms(tree)[0]!.props.onSubmit?.({ preventDefault() {} } as never);
    await flush();
    status.resolve({ ...task, status: 'TODO' });
    tree = await flush();

    const headings = elements(tree).filter((element) => element.type === 'h3');
    expect(headings).toHaveLength(3);
    expect(elements(tree).some((element) => element.props.children === '并行创建')).toBe(true);
  });
});
