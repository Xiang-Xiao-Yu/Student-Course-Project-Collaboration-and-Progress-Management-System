import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type {
  IterationDetailDto,
  IterationStatsDto,
  IterationStatus,
  IterationSummaryDto,
} from '../features/iterations/iteration-api';
import {
  addIterationTask,
  closeIteration,
  createIteration,
  getIteration,
  getIterationStats,
  listIterations,
  removeIterationTask,
  updateIteration,
} from '../features/iterations/iteration-api';
import {
  formatCompletionRate,
  getIterationStatusActionLabel,
  getIterationStatusLabel,
  getIterationStatusTransitions,
  isIterationTaskOverdue,
} from '../features/iterations/iteration-presentation';
import type {
  IterationFormErrors,
  IterationFormValues,
} from '../features/iterations/iteration-validation';
import {
  formToCreateIterationInput,
  formToUpdateIterationInput,
  hasIterationFormErrors,
  hasUnsavedIterationChanges,
  iterationToForm,
  validateIterationForm,
} from '../features/iterations/iteration-validation';
import type { ProjectDto } from '../features/projects/project-api';
import { getProject } from '../features/projects/project-api';
import {
  canManageProject,
  formatProjectDate,
  getProjectRoleLabel,
} from '../features/projects/project-presentation';
import type { TaskDto } from '../features/tasks/task-api';
import { listTasks } from '../features/tasks/task-api';
import { getTaskStatusLabel } from '../features/tasks/task-presentation';
import { getUserFacingError } from '../lib/api/errors';

const EMPTY_ITERATION_FORM: IterationFormValues = {
  endDate: '',
  goal: '',
  name: '',
  startDate: '',
};

const EMPTY_STATS: IterationStatsDto = {
  blocked: 0,
  completed: 0,
  completionRate: 0,
  inProgress: 0,
  overdue: 0,
  total: 0,
};

interface IterationsData {
  readonly iterations: IterationSummaryDto[];
  readonly project: ProjectDto;
  readonly selected: IterationDetailDto | null;
  readonly stats: IterationStatsDto;
  readonly tasks: TaskDto[];
}

type IterationsState =
  | { readonly status: 'loading' }
  | { readonly data: IterationsData; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

function toSummary(iteration: IterationDetailDto): IterationSummaryDto {
  return {
    createdAt: iteration.createdAt,
    endDate: iteration.endDate,
    goal: iteration.goal,
    id: iteration.id,
    name: iteration.name,
    projectId: iteration.projectId,
    startDate: iteration.startDate,
    status: iteration.status,
    taskCount: iteration.taskCount,
    updatedAt: iteration.updatedAt,
  };
}

function replaceSummary(
  iterations: readonly IterationSummaryDto[],
  detail: IterationDetailDto,
): IterationSummaryDto[] {
  const exists = iterations.some((iteration) => iteration.id === detail.id);
  const summary = toSummary(detail);

  return exists
    ? iterations.map((iteration) => (iteration.id === detail.id ? summary : iteration))
    : [...iterations, summary];
}

export function IterationsPage() {
  const { api } = useSession();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [addTaskError, setAddTaskError] = useState<string | null>(null);
  const [addTaskId, setAddTaskId] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeNextIterationId, setCloseNextIterationId] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [createErrors, setCreateErrors] = useState<IterationFormErrors>({});
  const [createForm, setCreateForm] = useState(EMPTY_ITERATION_FORM);
  const [createMessage, setCreateMessage] = useState<{
    readonly text: string;
    readonly type: 'error' | 'success';
  } | null>(null);
  const [editErrors, setEditErrors] = useState<IterationFormErrors>({});
  const [editForm, setEditForm] = useState(EMPTY_ITERATION_FORM);
  const [editInitialForm, setEditInitialForm] = useState(EMPTY_ITERATION_FORM);
  const [editOpen, setEditOpen] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingSelection, setIsLoadingSelection] = useState(false);
  const [isRemovingTaskId, setIsRemovingTaskId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<IterationsState>({ status: 'loading' });
  const [statusAction, setStatusAction] = useState<IterationStatus | null>(null);
  const selectionVersionRef = useRef(0);

  const selectedIterationId = state.status === 'ready' ? (state.data.selected?.id ?? null) : null;
  const selectedIterationUpdatedAt =
    state.status === 'ready' ? (state.data.selected?.updatedAt ?? null) : null;

  useEffect(() => {
    selectionVersionRef.current += 1;
    setAddTaskError(null);
    setAddTaskId('');
    setCloseError(null);
    setCloseNextIterationId('');
    setCloseOpen(false);
    setCreateErrors({});
    setEditErrors({});
    setEditOpen(false);
    setStatusAction(null);

    if (!projectId) {
      setState({ message: '没有可加载的项目。', status: 'error' });
      return;
    }

    let isCancelled = false;
    const requestVersion = ++selectionVersionRef.current;

    setState({ status: 'loading' });
    void Promise.all([
      getProject(api, projectId),
      listIterations(api, projectId),
      listTasks(api, projectId),
    ])
      .then(async ([project, iterations, tasks]) => {
        const firstIteration = iterations[0] ?? null;
        const [selected, stats] = firstIteration
          ? await Promise.all([
              getIteration(api, projectId, firstIteration.id),
              getIterationStats(api, projectId, firstIteration.id),
            ])
          : [null, EMPTY_STATS];

        if (!isCancelled && selectionVersionRef.current === requestVersion) {
          setState({
            data: { iterations, project, selected, stats, tasks },
            status: 'ready',
          });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled && selectionVersionRef.current === requestVersion) {
          setState({ message: getUserFacingError(error), status: 'error' });
        }
      });

    return () => {
      isCancelled = true;
      if (selectionVersionRef.current === requestVersion) {
        selectionVersionRef.current += 1;
      }
    };
  }, [api, projectId, retryVersion]);

  useEffect(() => {
    if (state.status === 'ready' && state.data.selected) {
      const nextForm = iterationToForm(state.data.selected);

      setEditForm(nextForm);
      setEditInitialForm(nextForm);
      setEditErrors({});
      setEditOpen(false);
    }
  }, [selectedIterationId, selectedIterationUpdatedAt, state.status]);

  async function selectIteration(iterationId: string): Promise<void> {
    if (state.status !== 'ready' || state.data.selected?.id === iterationId) {
      return;
    }

    const requestVersion = ++selectionVersionRef.current;
    setIsLoadingSelection(true);
    setAddTaskError(null);
    setCreateMessage(null);

    try {
      const [selected, stats] = await Promise.all([
        getIteration(api, state.data.project.id, iterationId),
        getIterationStats(api, state.data.project.id, iterationId),
      ]);

      if (selectionVersionRef.current !== requestVersion) {
        return;
      }

      setState((current) =>
        current.status === 'ready'
          ? { data: { ...current.data, selected, stats }, status: 'ready' }
          : current,
      );
    } catch (error) {
      if (selectionVersionRef.current === requestVersion) {
        setCreateMessage({ text: getUserFacingError(error), type: 'error' });
      }
    } finally {
      if (selectionVersionRef.current === requestVersion) {
        setIsLoadingSelection(false);
      }
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (
      state.status !== 'ready' ||
      isCreating ||
      !canManageProject(state.data.project.accessRole)
    ) {
      return;
    }

    const errors = validateIterationForm(createForm);

    setCreateErrors(errors);
    setCreateMessage(null);

    if (hasIterationFormErrors(errors)) {
      return;
    }

    setIsCreating(true);

    try {
      const selected = await createIteration(
        api,
        state.data.project.id,
        formToCreateIterationInput(createForm),
      );
      ++selectionVersionRef.current;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations: replaceSummary(current.data.iterations, selected),
                selected,
                stats: EMPTY_STATS,
              },
              status: 'ready',
            }
          : current,
      );
      setCreateForm(EMPTY_ITERATION_FORM);
      setCreateErrors({});
      setCreateMessage({ text: '迭代已创建。', type: 'success' });
    } catch (error) {
      setCreateMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || !state.data.selected || isUpdating) {
      return;
    }

    const errors = validateIterationForm(editForm);

    setEditErrors(errors);
    setCreateMessage(null);

    if (hasIterationFormErrors(errors)) {
      return;
    }

    setIsUpdating(true);

    try {
      const selected = await updateIteration(
        api,
        state.data.project.id,
        state.data.selected.id,
        formToUpdateIterationInput(editForm),
      );
      ++selectionVersionRef.current;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations: replaceSummary(current.data.iterations, selected),
                selected,
              },
              status: 'ready',
            }
          : current,
      );
      setCreateMessage({ text: '迭代信息已更新。', type: 'success' });
    } catch (error) {
      setCreateMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsUpdating(false);
    }
  }

  async function applyStatusAction(): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || !statusAction) {
      return;
    }

    const selectedId = state.data.selected.id;
    const nextStatus = statusAction;
    setStatusAction(null);
    setIsUpdating(true);
    setCreateMessage(null);

    try {
      const selected = await updateIteration(api, state.data.project.id, selectedId, {
        status: nextStatus,
      });
      ++selectionVersionRef.current;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations: replaceSummary(current.data.iterations, selected),
                selected,
              },
              status: 'ready',
            }
          : current,
      );
      setCreateMessage({
        text: `迭代已更新为“${getIterationStatusLabel(selected.status)}”。`,
        type: 'success',
      });
    } catch (error) {
      setCreateMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsUpdating(false);
    }
  }

  async function refreshIterationSummaries(): Promise<IterationSummaryDto[]> {
    if (state.status !== 'ready') {
      return [];
    }

    return listIterations(api, state.data.project.id);
  }

  async function handleAddTask(): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || isAddingTask) {
      return;
    }

    const selectedTaskId =
      addTaskId ||
      state.data.tasks.find(
        (task) => !state.data.selected?.tasks.some((item) => item.id === task.id),
      )?.id ||
      '';

    if (!selectedTaskId) {
      setAddTaskError('没有可加入当前迭代的任务。');
      return;
    }

    setIsAddingTask(true);
    setAddTaskError(null);
    setCreateMessage(null);

    try {
      const selected = await addIterationTask(
        api,
        state.data.project.id,
        state.data.selected.id,
        selectedTaskId,
      );
      const [statsResult, iterationsResult] = await Promise.allSettled([
        getIterationStats(api, state.data.project.id, selected.id),
        refreshIterationSummaries(),
      ]);
      ++selectionVersionRef.current;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations:
                  iterationsResult.status === 'fulfilled' && iterationsResult.value.length > 0
                    ? iterationsResult.value
                    : replaceSummary(current.data.iterations, selected),
                selected,
                stats: statsResult.status === 'fulfilled' ? statsResult.value : current.data.stats,
              },
              status: 'ready',
            }
          : current,
      );
      setAddTaskId('');
      setCreateMessage({ text: '任务已加入迭代。', type: 'success' });
    } catch (error) {
      setAddTaskError(getUserFacingError(error));
    } finally {
      setIsAddingTask(false);
    }
  }

  async function handleRemoveTask(taskId: string): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || isRemovingTaskId) {
      return;
    }

    setIsRemovingTaskId(taskId);
    setAddTaskError(null);
    setCreateMessage(null);

    try {
      const selected = await removeIterationTask(
        api,
        state.data.project.id,
        state.data.selected.id,
        taskId,
      );
      const [statsResult, iterationsResult] = await Promise.allSettled([
        getIterationStats(api, state.data.project.id, selected.id),
        refreshIterationSummaries(),
      ]);
      ++selectionVersionRef.current;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations:
                  iterationsResult.status === 'fulfilled' && iterationsResult.value.length > 0
                    ? iterationsResult.value
                    : replaceSummary(current.data.iterations, selected),
                selected,
                stats: statsResult.status === 'fulfilled' ? statsResult.value : current.data.stats,
              },
              status: 'ready',
            }
          : current,
      );
      setCreateMessage({ text: '任务已移出迭代。', type: 'success' });
    } catch (error) {
      setAddTaskError(getUserFacingError(error));
    } finally {
      setIsRemovingTaskId(null);
    }
  }

  async function handleCloseIteration(): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || isClosing) {
      return;
    }

    setIsClosing(true);
    setCloseError(null);

    try {
      const selected = await closeIteration(
        api,
        state.data.project.id,
        state.data.selected.id,
        closeNextIterationId ? { nextIterationId: closeNextIterationId } : {},
      );
      const [statsResult, iterationsResult] = await Promise.allSettled([
        getIterationStats(api, state.data.project.id, selected.id),
        refreshIterationSummaries(),
      ]);
      ++selectionVersionRef.current;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations:
                  iterationsResult.status === 'fulfilled' && iterationsResult.value.length > 0
                    ? iterationsResult.value
                    : replaceSummary(current.data.iterations, selected),
                selected,
                stats: statsResult.status === 'fulfilled' ? statsResult.value : current.data.stats,
              },
              status: 'ready',
            }
          : current,
      );
      setCloseOpen(false);
      setCloseNextIterationId('');
      setCreateMessage({
        text: closeNextIterationId ? '迭代已关闭，未完成任务已迁移到下一迭代。' : '迭代已关闭。',
        type: 'success',
      });
    } catch (error) {
      setCloseError(getUserFacingError(error));
    } finally {
      setIsClosing(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="迭代计划" description="规划迭代周期、任务范围和完成率。" />
        <LoadingState label="正在加载迭代计划" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="迭代计划" description="规划迭代周期、任务范围和完成率。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((value) => value + 1)}
          title="迭代计划加载失败"
        />
      </div>
    );
  }

  const { iterations, project, selected, stats, tasks } = state.data;
  const canManage = canManageProject(project.accessRole) && project.status !== 'ARCHIVED';
  const availableTasks = selected
    ? tasks.filter((task) => !selected.tasks.some((item) => item.id === task.id))
    : [];
  const nextIterationOptions = selected
    ? iterations.filter(
        (iteration) =>
          iteration.id !== selected.id &&
          iteration.status !== 'COMPLETED' &&
          iteration.status !== 'CANCELED',
      )
    : [];
  const createDraft =
    createForm.name.length > 0 ||
    createForm.goal.length > 0 ||
    createForm.startDate.length > 0 ||
    createForm.endDate.length > 0;
  const editDirty = editOpen && hasUnsavedIterationChanges(editInitialForm, editForm);

  return (
    <div className="page-stack p4-page">
      <UnsavedChangesGuard
        message="迭代内容尚未保存，离开后修改将丢失。"
        when={createDraft || editDirty}
      />
      <PageHeader title="迭代计划" description="规划迭代周期、任务范围和完成率。" />

      <div className="read-only-inline">
        当前角色：{getProjectRoleLabel(project.accessRole)}
        {!canManage ? ' · 迭代计划为只读，项目负责人和管理员可维护' : ''}
      </div>

      {createMessage?.type === 'error' ? <ErrorNotice message={createMessage.text} /> : null}
      {createMessage?.type === 'success' ? (
        <div className="success-notice">{createMessage.text}</div>
      ) : null}

      {canManage ? (
        <section className="panel iteration-create-panel">
          <div className="panel__header">
            <div>
              <h2>创建迭代</h2>
              <p>设置明确周期和目标，再把任务加入迭代。</p>
            </div>
          </div>
          <form className="auth-form iteration-form" onSubmit={(event) => void handleCreate(event)}>
            <label className="form-field">
              <span>迭代名称</span>
              <input
                disabled={isCreating}
                maxLength={100}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="例如：P4 迭代"
                value={createForm.name}
              />
              {createErrors.name ? <small>{createErrors.name}</small> : null}
            </label>
            <label className="form-field">
              <span>迭代目标</span>
              <textarea
                disabled={isCreating}
                maxLength={1000}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, goal: event.target.value }))
                }
                rows={3}
                value={createForm.goal}
              />
              {createErrors.goal ? <small>{createErrors.goal}</small> : null}
            </label>
            <div className="project-form-grid">
              <label className="form-field">
                <span>开始日期</span>
                <input
                  disabled={isCreating}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                  type="date"
                  value={createForm.startDate}
                />
                {createErrors.startDate ? <small>{createErrors.startDate}</small> : null}
              </label>
              <label className="form-field">
                <span>结束日期</span>
                <input
                  disabled={isCreating}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                  type="date"
                  value={createForm.endDate}
                />
                {createErrors.endDate ? <small>{createErrors.endDate}</small> : null}
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={isCreating} type="submit">
                {isCreating ? '正在创建...' : '创建迭代'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {iterations.length === 0 ? (
        <section className="panel panel--large">
          <EmptyState
            title="暂无迭代计划"
            description="创建迭代后，可以安排任务、查看完成率和逾期情况。"
          />
        </section>
      ) : (
        <div className="iteration-workspace">
          <section className="panel iteration-list-panel">
            <div className="panel__header">
              <div>
                <h2>迭代列表</h2>
                <p>共 {iterations.length} 个迭代</p>
              </div>
            </div>
            <div className="iteration-list">
              {iterations.map((iteration) => (
                <button
                  className={`iteration-list-row${
                    selected?.id === iteration.id ? ' is-active' : ''
                  }`}
                  disabled={isLoadingSelection}
                  key={iteration.id}
                  onClick={() => void selectIteration(iteration.id)}
                  type="button"
                >
                  <div>
                    <strong>{iteration.name}</strong>
                    <span>
                      {formatProjectDate(iteration.startDate)} -{' '}
                      {formatProjectDate(iteration.endDate)}
                    </span>
                  </div>
                  <div className="iteration-list-row__meta">
                    <span
                      className={`iteration-status iteration-status--${iteration.status.toLowerCase()}`}
                    >
                      {getIterationStatusLabel(iteration.status)}
                    </span>
                    <span>{iteration.taskCount} 个任务</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {selected ? (
            <section className="panel iteration-detail-panel">
              <div className="panel__header">
                <div>
                  <h2>{selected.name}</h2>
                  <p>{selected.goal || '暂未填写迭代目标。'}</p>
                </div>
                <span
                  className={`iteration-status iteration-status--${selected.status.toLowerCase()}`}
                >
                  {getIterationStatusLabel(selected.status)}
                </span>
              </div>

              <div className="iteration-period">
                <span>{formatProjectDate(selected.startDate)}</span>
                <span>至</span>
                <span>{formatProjectDate(selected.endDate)}</span>
              </div>

              <div className="iteration-stats" aria-label="迭代统计">
                <article>
                  <span>任务总数</span>
                  <strong>{stats.total}</strong>
                </article>
                <article>
                  <span>已完成</span>
                  <strong>{stats.completed}</strong>
                </article>
                <article>
                  <span>进行中</span>
                  <strong>{stats.inProgress}</strong>
                </article>
                <article>
                  <span>阻塞</span>
                  <strong>{stats.blocked}</strong>
                </article>
                <article className={stats.overdue > 0 ? 'is-warning' : ''}>
                  <span>逾期</span>
                  <strong>{stats.overdue}</strong>
                </article>
                <article>
                  <span>完成率</span>
                  <strong>{formatCompletionRate(stats.completionRate)}</strong>
                </article>
              </div>

              {canManage ? (
                <div className="iteration-management">
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      disabled={isUpdating}
                      onClick={() => setEditOpen((open) => !open)}
                      type="button"
                    >
                      {editOpen ? '收起编辑' : '编辑迭代'}
                    </button>
                    {getIterationStatusTransitions(selected.status)
                      .filter((status) => status !== 'COMPLETED')
                      .map((status) => (
                        <button
                          className="secondary-button"
                          disabled={isUpdating}
                          key={status}
                          onClick={() => setStatusAction(status)}
                          type="button"
                        >
                          {getIterationStatusActionLabel(status)}
                        </button>
                      ))}
                    {getIterationStatusTransitions(selected.status).includes('COMPLETED') ? (
                      <button
                        className="primary-button"
                        disabled={isUpdating}
                        onClick={() => {
                          setCloseError(null);
                          setCloseOpen(true);
                        }}
                        type="button"
                      >
                        关闭迭代
                      </button>
                    ) : null}
                  </div>

                  {editOpen ? (
                    <form
                      className="auth-form iteration-form iteration-edit-form"
                      onSubmit={(event) => void handleUpdate(event)}
                    >
                      <label className="form-field">
                        <span>迭代名称</span>
                        <input
                          disabled={isUpdating}
                          maxLength={100}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          value={editForm.name}
                        />
                        {editErrors.name ? <small>{editErrors.name}</small> : null}
                      </label>
                      <label className="form-field">
                        <span>迭代目标</span>
                        <textarea
                          disabled={isUpdating}
                          maxLength={1000}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              goal: event.target.value,
                            }))
                          }
                          rows={3}
                          value={editForm.goal}
                        />
                        {editErrors.goal ? <small>{editErrors.goal}</small> : null}
                      </label>
                      <div className="project-form-grid">
                        <label className="form-field">
                          <span>开始日期</span>
                          <input
                            disabled={isUpdating}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                startDate: event.target.value,
                              }))
                            }
                            type="date"
                            value={editForm.startDate}
                          />
                          {editErrors.startDate ? <small>{editErrors.startDate}</small> : null}
                        </label>
                        <label className="form-field">
                          <span>结束日期</span>
                          <input
                            disabled={isUpdating}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                endDate: event.target.value,
                              }))
                            }
                            type="date"
                            value={editForm.endDate}
                          />
                          {editErrors.endDate ? <small>{editErrors.endDate}</small> : null}
                        </label>
                      </div>
                      <div className="form-actions">
                        <button
                          className="primary-button"
                          disabled={
                            isUpdating || !hasUnsavedIterationChanges(editInitialForm, editForm)
                          }
                          type="submit"
                        >
                          {isUpdating ? '正在保存...' : '保存迭代'}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ) : null}

              <div className="iteration-task-section">
                <div className="panel__header">
                  <div>
                    <h3>迭代任务</h3>
                    <p>加入或移出任务会立即更新统计。</p>
                  </div>
                </div>

                {canManage ? (
                  <div className="iteration-add-task">
                    <label className="form-field">
                      <span>加入任务</span>
                      <select
                        disabled={isAddingTask || availableTasks.length === 0}
                        onChange={(event) => setAddTaskId(event.target.value)}
                        value={addTaskId || availableTasks[0]?.id || ''}
                      >
                        {availableTasks.length === 0 ? (
                          <option value="">没有可加入的任务</option>
                        ) : (
                          availableTasks.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.title} · {getTaskStatusLabel(task.status)}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <button
                      className="secondary-button"
                      disabled={isAddingTask || availableTasks.length === 0}
                      onClick={() => void handleAddTask()}
                      type="button"
                    >
                      {isAddingTask ? '正在加入...' : '加入迭代'}
                    </button>
                  </div>
                ) : null}
                {addTaskError ? <ErrorNotice message={addTaskError} /> : null}

                {selected.tasks.length === 0 ? (
                  <div className="linked-task-empty">当前迭代还没有任务</div>
                ) : (
                  <div className="iteration-task-list">
                    {selected.tasks.map((task) => {
                      const overdue = isIterationTaskOverdue(task);

                      return (
                        <article className="iteration-task-row" key={task.id}>
                          <div>
                            <strong>{task.title}</strong>
                            <span>
                              {getTaskStatusLabel(task.status)}
                              {task.dueDate
                                ? ` · 截止 ${formatProjectDate(task.dueDate)}`
                                : ' · 未设置截止日期'}
                            </span>
                          </div>
                          <div className="iteration-task-row__actions">
                            {overdue ? <span className="overdue-badge">已逾期</span> : null}
                            {canManage && selected.status !== 'COMPLETED' ? (
                              <button
                                className="danger-text-button"
                                disabled={isRemovingTaskId !== null}
                                onClick={() => void handleRemoveTask(task.id)}
                                type="button"
                              >
                                {isRemovingTaskId === task.id ? '正在移出...' : '移出迭代'}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {statusAction ? (
        <ConfirmDialog
          confirmLabel="确认更新"
          isPending={isUpdating}
          message={`确认将迭代“${selected?.name ?? ''}”更新为“${getIterationStatusLabel(
            statusAction,
          )}”吗？`}
          onCancel={() => setStatusAction(null)}
          onConfirm={() => void applyStatusAction()}
          title={getIterationStatusActionLabel(statusAction)}
          tone={statusAction === 'CANCELED' ? 'danger' : 'primary'}
        />
      ) : null}

      {closeOpen && selected ? (
        <div className="task-edit-backdrop">
          <section
            aria-labelledby="close-iteration-title"
            aria-modal="true"
            className="task-edit-dialog iteration-close-dialog"
            role="dialog"
          >
            <div className="task-edit-dialog__header">
              <div>
                <h2 id="close-iteration-title">关闭迭代</h2>
                <p>可将未完成任务迁移到另一个迭代，已完成任务保留在当前迭代。</p>
              </div>
            </div>
            {closeError ? <ErrorNotice message={closeError} /> : null}
            <label className="form-field">
              <span>下一迭代</span>
              <select
                disabled={isClosing}
                onChange={(event) => setCloseNextIterationId(event.target.value)}
                value={closeNextIterationId}
              >
                <option value="">不迁移未完成任务</option>
                {nextIterationOptions.map((iteration) => (
                  <option key={iteration.id} value={iteration.id}>
                    {iteration.name} · {getIterationStatusLabel(iteration.status)}
                  </option>
                ))}
              </select>
            </label>
            <div className="task-edit-actions">
              <button
                className="secondary-button"
                disabled={isClosing}
                onClick={() => setCloseOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={isClosing}
                onClick={() => void handleCloseIteration()}
                type="button"
              >
                {isClosing ? '正在关闭...' : '确认关闭迭代'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
