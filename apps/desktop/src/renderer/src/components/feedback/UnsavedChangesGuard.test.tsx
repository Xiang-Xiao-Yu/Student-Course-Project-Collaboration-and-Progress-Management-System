import type { EffectCallback } from 'react';
import { createMemoryRouter } from 'react-router-dom';
import type { Blocker } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UnsavedChangesGuard } from './UnsavedChangesGuard';

const boundary = vi.hoisted(() => ({
  useBlocker: vi.fn<(when: boolean) => Blocker>(),
  useEffect: vi.fn<(effect: EffectCallback) => void>(),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: boundary.useEffect,
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useBlocker: boundary.useBlocker,
}));

let router: ReturnType<typeof createMemoryRouter>;
let effects: EffectCallback[];

function deferredSave() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

// Replay the guard's passive effects without adding a DOM dependency. Navigation,
// the blocked destination, proceed and reset all use the real React Router.
function renderGuard(when: boolean): ReturnType<typeof UnsavedChangesGuard> {
  effects = [];
  const result = UnsavedChangesGuard({ message: '会议尚未保存。', when });
  effects.forEach((effect) => effect());
  return result;
}

beforeEach(() => {
  vi.resetAllMocks();
  router = createMemoryRouter(
    [
      { element: null, path: '/meetings' },
      { element: null, path: '/acceptances' },
    ],
    { initialEntries: ['/meetings'] },
  );
  boundary.useEffect.mockImplementation((effect) => effects.push(effect));
  boundary.useBlocker.mockImplementation((when) =>
    router.getBlocker('unsaved-changes', () => when),
  );
});

afterEach(() => router.dispose());

describe('未保存内容导航保护', () => {
  it('保存期间先阻止导航，保存成功清空草稿后自动前往原目标', async () => {
    renderGuard(true);
    const completion = deferredSave();
    const save = completion.promise.then(() => renderGuard(false));

    await router.navigate('/acceptances');
    expect(renderGuard(true)).not.toBeNull();
    expect(router.state.location.pathname).toBe('/meetings');

    completion.resolve();
    const dialogAfterSave = await save;

    expect(router.state.location.pathname).toBe('/acceptances');
    expect(dialogAfterSave).toBeNull();
    expect(router.state.blockers.get('unsaved-changes')?.state).toBe('unblocked');
  });

  it('保存失败仍有草稿时保留对话框和待定目标，不自动放行', async () => {
    renderGuard(true);
    const completion = deferredSave();
    const save = completion.promise.catch(() => renderGuard(true));

    await router.navigate('/acceptances');
    completion.reject(new Error('保存失败'));
    const dialogAfterFailure = await save;

    expect(dialogAfterFailure).not.toBeNull();
    expect(router.state.location.pathname).toBe('/meetings');
    expect(router.state.blockers.get('unsaved-changes')?.state).toBe('blocked');
  });

  it('仍有其他草稿时保持阻止，即使当前表单已保存', async () => {
    renderGuard(true);
    await router.navigate('/acceptances');

    expect(renderGuard(true)).not.toBeNull();
    expect(router.state.location.pathname).toBe('/meetings');
    expect(router.state.blockers.get('unsaved-changes')?.state).toBe('blocked');
  });

  it('选择继续编辑会取消待定导航，此后保存不会再触发旧导航', async () => {
    renderGuard(true);
    await router.navigate('/acceptances');
    const dialog = renderGuard(true);
    expect(dialog).not.toBeNull();

    dialog?.props.onCancel();
    expect(renderGuard(false)).toBeNull();

    expect(router.state.location.pathname).toBe('/meetings');
    expect(router.state.blockers.get('unsaved-changes')?.state).toBe('unblocked');
  });

  it('主动放弃草稿仍可前往待定目标', async () => {
    renderGuard(true);
    await router.navigate('/acceptances');
    const dialog = renderGuard(true);

    dialog?.props.onConfirm();

    expect(router.state.location.pathname).toBe('/acceptances');
  });

  it('没有草稿且没有待定导航时正常离开，不创建确认框', async () => {
    expect(renderGuard(false)).toBeNull();

    await router.navigate('/acceptances');

    expect(router.state.location.pathname).toBe('/acceptances');
    expect(renderGuard(false)).toBeNull();
  });
});
