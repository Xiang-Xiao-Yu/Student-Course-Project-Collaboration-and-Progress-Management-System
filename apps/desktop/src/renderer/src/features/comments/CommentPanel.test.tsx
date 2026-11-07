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

import { CommentPanel } from './CommentPanel';

const boundary = vi.hoisted(() => ({
  useEffect: vi.fn<(effect: EffectCallback, dependencies?: DependencyList) => void>(),
  useState: vi.fn<(initial: unknown) => [unknown, (value: unknown) => void]>(),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: boundary.useEffect,
  useState: boundary.useState,
}));

interface EffectSlot {
  readonly cleanup: ReturnType<EffectCallback>;
  readonly dependencies: DependencyList | undefined;
}

class PanelReplay {
  private readonly slots: unknown[] = [];
  private readonly effects = new Map<number, EffectSlot>();
  private pendingEffects: Array<() => void> = [];
  private index = 0;
  private needsRender = true;
  private tree: ReactNode = null;

  constructor(private readonly props: ComponentProps<typeof CommentPanel>) {
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
      this.tree = CommentPanel(this.props);
      const effects = this.pendingEffects;
      this.pendingEffects = [];
      effects.forEach((effect) => effect());
    } while (this.needsRender);
  }

  find(type: unknown): ReactElement<Record<string, unknown>>[] {
    const found: ReactElement<Record<string, unknown>>[] = [];
    function visit(node: ReactNode): void {
      if (Array.isArray(node)) node.forEach(visit);
      else if (isValidElement<{ children?: ReactNode }>(node)) {
        if (node.type === type) found.push(node);
        visit(node.props.children);
      }
    }
    visit(this.tree);
    return found;
  }

  change(index: number, value: string): void {
    const textarea = this.find('textarea')[index];
    const onChange = textarea?.props.onChange as
      ((event: ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
    if (!onChange) throw new Error('Missing comment editor');
    onChange({ target: { value } } as ChangeEvent<HTMLTextAreaElement>);
    this.render();
  }

  click(label: string): void {
    const button = this.find('button').find((item) => item.props.children === label);
    const onClick = button?.props.onClick as (() => void) | undefined;
    if (!onClick) throw new Error(`Missing button: ${label}`);
    onClick();
    this.render();
  }
}

beforeEach(() => vi.resetAllMocks());

describe('P4 comment drafts', () => {
  it('新评论和编辑评论产生草稿，清空或取消后解除草稿状态', () => {
    const onDirtyChange = vi.fn();
    const props = {
      api: { delete: vi.fn(), patch: vi.fn(), post: vi.fn() },
      canComment: true,
      currentUserId: 'user-1',
      initialComments: [
        {
          author: { avatarUrl: null, id: 'user-1', nickname: '作者', username: 'author' },
          content: '原评论',
          createdAt: '2026-11-07T00:00:00.000Z',
          id: 'comment-1',
          targetType: 'TASK',
          updatedAt: '2026-11-07T00:00:00.000Z',
        },
      ],
      onDirtyChange,
      projectId: 'project-1',
      targetId: 'task-1',
      targetType: 'TASK',
    } as ComponentProps<typeof CommentPanel>;
    const panel = new PanelReplay(props);

    panel.change(0, '新草稿');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    panel.change(0, '');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    panel.click('编辑');
    panel.change(1, '修改后的评论');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    panel.click('取消');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
