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
import {
  isIterationResponseCurrent,
  requiresIterationSwitchConfirmation,
  resolveIterationStatsRefresh,
} from '../features/iterations/iteration-state';
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
import { formatTaskDueDate, getTaskStatusLabel } from '../features/tasks/task-presentation';
import { getUserFacingError } from '../lib/api/errors';

const EMPTY_ITERATION_FORM: IterationFormValues = {
  endDate: '',
  goal: '',
  name: '',
  startDate: '',
};

const EMPTY_STATS: IterationStatsDto = {
  asOf: '',
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
  readonly taskIterations: Readonly<Record<string, TaskIterationOwnership>>;
  readonly tasks: TaskDto[];
}

type IterationsState =
  | { readonly status: 'loading' }
  | { readonly data: IterationsData; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

interface TaskIterationOwnership {
  readonly iterationId: string;
  readonly iterationName: string;
  readonly iterationStatus: IterationStatus;
}

interface IterationDataSnapshot {
  readonly iterations: IterationSummaryDto[];
  readonly taskIterations: Readonly<Record<string, TaskIterationOwnership>>;
}

function getAvailableTasks(data: IterationsData): TaskDto[] {
  const selected = data.selected;
  if (!selected) return [];

  return data.tasks.filter((task) => {
    const source = data.taskIterations[task.id];
    const sourceIsTerminal =
      source?.iterationStatus === 'COMPLETED' || source?.iterationStatus === 'CANCELED';
    return (
      !selected.tasks.some((item) => item.id === task.id) &&
      !(sourceIsTerminal && task.status === 'COMPLETED')
    );
  });
}

const STATS_CHANGED_MESSAGE = '迭代任务或统计已变化，请重新加载。';

function getStatsFailure(
  detail: IterationDetailDto,
  result: PromiseSettledResult<IterationStatsDto>,
): string | null {
  if (result.status === 'rejected') return getUserFacingError(result.reason);
  const tasks = detail.tasks;
  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
  const now = new Date(result.value.asOf);
  if (Number.isNaN(now.getTime())) return STATS_CHANGED_MESSAGE;
  const expected = {
    blocked: tasks.filter((task) => task.status === 'BLOCKED').length,
    completed,
    completionRate: tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 10000) / 10000,
    inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
    overdue: tasks.filter((task) => isIterationTaskOverdue(task, now)).length,
    total: tasks.length,
  };
  return (Object.keys(expected) as Array<keyof typeof expected>).every(
    (key) => result.value[key] === expected[key],
  )
    ? null
    : STATS_CHANGED_MESSAGE;
}

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

function buildTaskIterations(
  iterations: readonly IterationSummaryDto[],
  details: readonly IterationDetailDto[],
): Readonly<Record<string, TaskIterationOwnership>> {
  const iterationById = new Map(iterations.map((iteration) => [iteration.id, iteration]));
  const ownership: Record<string, TaskIterationOwnership> = {};

  for (const detail of details) {
    const iteration = iterationById.get(detail.id);

    if (!iteration) {
      continue;
    }

    for (const task of detail.tasks) {
      ownership[task.id] = {
        iterationId: iteration.id,
        iterationName: iteration.name,
        iterationStatus: iteration.status,
      };
    }
  }

  return ownership;
}

function applySelectedIterationOwnership(
  current: Readonly<Record<string, TaskIterationOwnership>>,
  selected: IterationDetailDto,
): Readonly<Record<string, TaskIterationOwnership>> {
  const next = { ...current };
  const selectedTaskIds = new Set(selected.tasks.map((task) => task.id));

  for (const [taskId, ownership] of Object.entries(next)) {
    if (ownership.iterationId === selected.id && !selectedTaskIds.has(taskId)) {
      delete next[taskId];
    }
  }

  for (const task of selected.tasks) {
    next[task.id] = {
      iterationId: selected.id,
      iterationName: selected.name,
      iterationStatus: selected.status,
    };
  }

  return next;
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
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [isRemovingTaskId, setIsRemovingTaskId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingIterationId, setPendingIterationId] = useState<string | null>(null);
  const [pendingTaskMigrationId, setPendingTaskMigrationId] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [state, setState] = useState<IterationsState>({ status: 'loading' });
  const [statusAction, setStatusAction] = useState<IterationStatus | null>(null);
  const isWritePending =
    isAddingTask ||
    isClosing ||
    isCreating ||
    isLoadingSelection ||
    isRemovingTaskId !== null ||
    isUpdating;
  const isEditingLocked = isWritePending || isRefreshingStats;
  const selectionVersionRef = useRef(0);
  const selectedIterationIdRef = useRef<string | null>(null);
  const editDirtyRef = useRef(false);
  const editIterationIdRef = useRef<string | null>(null);

  const selectedIterationId = state.status === 'ready' ? (state.data.selected?.id ?? null) : null;
  const selectedIterationUpdatedAt =
    state.status === 'ready' ? (state.data.selected?.updatedAt ?? null) : null;

  selectedIterationIdRef.current = selectedIterationId;
  editDirtyRef.current = hasUnsavedIterationChanges(editInitialForm, editForm);

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
    setIsRefreshingStats(false);
    setPendingIterationId(null);
    setPendingTaskMigrationId(null);
    setStatsError(null);
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
        const details = await Promise.all(
          iterations.map((iteration) => getIteration(api, projectId, iteration.id)),
        );
        const selected = details[0] ?? null;
        let stats = EMPTY_STATS;
        let statsFailure: string | null = null;

        if (selected) {
          try {
            stats = await getIterationStats(api, projectId, selected.id);
            statsFailure = getStatsFailure(selected, { status: 'fulfilled', value: stats });
          } catch (error) {
            statsFailure = getUserFacingError(error);
          }
        }

        if (!isCancelled && selectionVersionRef.current === requestVersion) {
          setStatsError(statsFailure);
          setState({
            data: {
              iterations,
              project,
              selected,
              stats,
              taskIterations: buildTaskIterations(iterations, details),
              tasks,
            },
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
      const selectionChanged = editIterationIdRef.current !== state.data.selected.id;
      editIterationIdRef.current = state.data.selected.id;
      if (!selectionChanged && editDirtyRef.current) {
        return;
      }
      const nextForm = iterationToForm(state.data.selected);

      setEditForm(nextForm);
      setEditInitialForm(nextForm);
      setEditErrors({});
      setEditOpen(false);
    }
  }, [selectedIterationId, selectedIterationUpdatedAt, state.status]);

  function requestIterationSelection(iterationId: string): void {
    if (iterationId === selectedIterationIdRef.current) {
      return;
    }
    if (requiresIterationSwitchConfirmation(editInitialForm, editForm)) {
      setPendingIterationId(iterationId);
      return;
    }

    void selectIteration(iterationId);
  }

  async function selectIteration(iterationId: string): Promise<void> {
    if (state.status !== 'ready' || state.data.selected?.id === iterationId) {
      return;
    }

    const requestVersion = ++selectionVersionRef.current;
    setIsLoadingSelection(true);
    setIsRefreshingStats(false);
    setAddTaskError(null);
    setCreateMessage(null);
    setPendingIterationId(null);

    try {
      const [selectedResult, statsResult] = await Promise.allSettled([
        getIteration(api, state.data.project.id, iterationId),
        getIterationStats(api, state.data.project.id, iterationId),
      ]);

      if (selectionVersionRef.current !== requestVersion) {
        return;
      }

      if (selectedResult.status === 'rejected') {
        setCreateMessage({
          text: getUserFacingError(selectedResult.reason),
          type: 'error',
        });
        return;
      }

      const selected = selectedResult.value;
      const statsFailure = getStatsFailure(selected, statsResult);
      const statsRefresh = resolveIterationStatsRefresh(
        EMPTY_STATS,
        statsResult.status === 'fulfilled' && statsFailure === null
          ? { status: 'fulfilled', value: statsResult.value }
          : { message: statsFailure ?? STATS_CHANGED_MESSAGE, status: 'rejected' },
      );

      setStatsError(statsRefresh.error);
      setState((current) =>
        current.status === 'ready'
          ? { data: { ...current.data, selected, stats: statsRefresh.stats }, status: 'ready' }
          : current,
      );
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
      isEditingLocked ||
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
    const selectedAtStart = selectedIterationIdRef.current;

    try {
      const selected = await createIteration(
        api,
        state.data.project.id,
        formToCreateIterationInput(createForm),
      );
      const shouldActivate =
        isIterationResponseCurrent(selectedAtStart, selectedIterationIdRef.current) &&
        !editDirtyRef.current;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations: replaceSummary(current.data.iterations, selected),
                selected: shouldActivate ? selected : current.data.selected,
                stats: shouldActivate ? EMPTY_STATS : current.data.stats,
              },
              status: 'ready',
            }
          : current,
      );
      setCreateForm(EMPTY_ITERATION_FORM);
      setCreateErrors({});
      if (shouldActivate) {
        setStatsError(null);
      }
      setCreateMessage({ text: '迭代已创建。', type: 'success' });
    } catch (error) {
      setCreateMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || !state.data.selected || isEditingLocked) {
      return;
    }

    const errors = validateIterationForm(editForm);

    setEditErrors(errors);
    setCreateMessage(null);

    if (hasIterationFormErrors(errors)) {
      return;
    }

    const targetIterationId = state.data.selected.id;
    const projectId = state.data.project.id;
    setIsUpdating(true);

    try {
      const selected = await updateIteration(
        api,
        projectId,
        targetIterationId,
        formToUpdateIterationInput(editForm),
      );
      const shouldActivate = isIterationResponseCurrent(
        targetIterationId,
        selectedIterationIdRef.current,
      );

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations: replaceSummary(current.data.iterations, selected),
                selected: shouldActivate ? selected : current.data.selected,
                taskIterations: shouldActivate
                  ? applySelectedIterationOwnership(current.data.taskIterations, selected)
                  : current.data.taskIterations,
              },
              status: 'ready',
            }
          : current,
      );
      if (shouldActivate) {
        const nextForm = iterationToForm(selected);
        setEditForm(nextForm);
        setEditInitialForm(nextForm);
        setEditErrors({});
        setEditOpen(false);
        setCreateMessage({ text: '迭代信息已更新。', type: 'success' });
      }
    } catch (error) {
      if (isIterationResponseCurrent(targetIterationId, selectedIterationIdRef.current)) {
        setCreateMessage({ text: getUserFacingError(error), type: 'error' });
      }
    } finally {
      setIsUpdating(false);
    }
  }

  async function applyStatusAction(): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || !statusAction || isEditingLocked) {
      return;
    }

    const selectedId = state.data.selected.id;
    const projectId = state.data.project.id;
    const nextStatus = statusAction;
    setStatusAction(null);
    setIsUpdating(true);
    setCreateMessage(null);

    try {
      const selected = await updateIteration(api, projectId, selectedId, {
        status: nextStatus,
      });
      const shouldActivate = isIterationResponseCurrent(selectedId, selectedIterationIdRef.current);

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations: replaceSummary(current.data.iterations, selected),
                selected: shouldActivate ? selected : current.data.selected,
                taskIterations: shouldActivate
                  ? applySelectedIterationOwnership(current.data.taskIterations, selected)
                  : current.data.taskIterations,
              },
              status: 'ready',
            }
          : current,
      );
      if (shouldActivate) {
        setCreateMessage({
          text: `迭代已更新为“${getIterationStatusLabel(selected.status)}”。`,
          type: 'success',
        });
      }
    } catch (error) {
      if (isIterationResponseCurrent(selectedId, selectedIterationIdRef.current)) {
        setCreateMessage({ text: getUserFacingError(error), type: 'error' });
      }
    } finally {
      setIsUpdating(false);
    }
  }

  async function loadIterationData(projectId: string): Promise<IterationDataSnapshot> {
    const iterations = await listIterations(api, projectId);
    const details = await Promise.all(
      iterations.map((iteration) => getIteration(api, projectId, iteration.id)),
    );

    return {
      iterations,
      taskIterations: buildTaskIterations(iterations, details),
    };
  }

  function requestAddTask(): void {
    if (state.status !== 'ready' || !state.data.selected || isEditingLocked) {
      return;
    }

    const candidates = getAvailableTasks(state.data);
    const selectedTaskId =
      candidates.find((task) => task.id === addTaskId)?.id ?? candidates[0]?.id ?? '';

    if (!selectedTaskId) {
      setAddTaskError('没有可加入当前迭代的任务。');
      return;
    }

    const source = state.data.taskIterations[selectedTaskId];

    if (source && source.iterationId !== state.data.selected.id) {
      setPendingTaskMigrationId(selectedTaskId);
      return;
    }

    void handleAddTask(selectedTaskId, source);
  }

  async function handleAddTask(
    taskIdOverride?: string,
    sourceOverride?: TaskIterationOwnership,
  ): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || isEditingLocked) {
      return;
    }

    const projectId = state.data.project.id;
    const targetIterationId = state.data.selected.id;
    const candidates = getAvailableTasks(state.data);
    const selectedTaskId =
      taskIdOverride ||
      candidates.find((task) => task.id === addTaskId)?.id ||
      candidates[0]?.id ||
      '';

    if (!selectedTaskId) {
      setAddTaskError('没有可加入当前迭代的任务。');
      return;
    }

    const source = sourceOverride ?? state.data.taskIterations[selectedTaskId];
    const taskTitle =
      state.data.tasks.find((task) => task.id === selectedTaskId)?.title ?? '该任务';
    setIsAddingTask(true);
    setAddTaskError(null);
    setCreateMessage(null);

    try {
      const selected = await addIterationTask(
        api,
        projectId,
        targetIterationId,
        selectedTaskId,
        source?.iterationId ?? null,
      );
      const [statsResult, ownershipResult] = await Promise.allSettled([
        getIterationStats(api, projectId, selected.id),
        loadIterationData(projectId),
      ]);
      const shouldActivate = isIterationResponseCurrent(
        targetIterationId,
        selectedIterationIdRef.current,
      );
      const statsFailure = getStatsFailure(selected, statsResult);

      if (shouldActivate) {
        setStatsError(statsFailure);
      } else if (!shouldActivate && source?.iterationId === selectedIterationIdRef.current) {
        setStatsError('任务归属已变化，请重新加载当前迭代统计。');
      }

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations:
                  ownershipResult.status === 'fulfilled'
                    ? ownershipResult.value.iterations
                    : replaceSummary(current.data.iterations, selected),
                selected: shouldActivate ? selected : current.data.selected,
                stats: shouldActivate
                  ? statsResult.status === 'fulfilled' && statsFailure === null
                    ? statsResult.value
                    : EMPTY_STATS
                  : current.data.stats,
                taskIterations:
                  ownershipResult.status === 'fulfilled'
                    ? ownershipResult.value.taskIterations
                    : applySelectedIterationOwnership(current.data.taskIterations, selected),
              },
              status: 'ready',
            }
          : current,
      );
      setAddTaskId('');
      setPendingTaskMigrationId(null);
      if (shouldActivate) {
        setCreateMessage({
          text: source
            ? `任务“${taskTitle}”已从“${source.iterationName}”迁移到当前迭代。`
            : '任务已加入迭代。',
          type: 'success',
        });
      }
    } catch (error) {
      if (isIterationResponseCurrent(targetIterationId, selectedIterationIdRef.current)) {
        setAddTaskError(getUserFacingError(error));
      }
    } finally {
      setIsAddingTask(false);
    }
  }

  async function handleRemoveTask(taskId: string): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || isEditingLocked) {
      return;
    }

    const projectId = state.data.project.id;
    const targetIterationId = state.data.selected.id;
    setIsRemovingTaskId(taskId);
    setAddTaskError(null);
    setCreateMessage(null);

    try {
      const selected = await removeIterationTask(api, projectId, targetIterationId, taskId);
      const [statsResult, ownershipResult] = await Promise.allSettled([
        getIterationStats(api, projectId, selected.id),
        loadIterationData(projectId),
      ]);
      const shouldActivate = isIterationResponseCurrent(
        targetIterationId,
        selectedIterationIdRef.current,
      );
      const statsFailure = getStatsFailure(selected, statsResult);

      if (shouldActivate) {
        setStatsError(statsFailure);
      }

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations:
                  ownershipResult.status === 'fulfilled'
                    ? ownershipResult.value.iterations
                    : replaceSummary(current.data.iterations, selected),
                selected: shouldActivate ? selected : current.data.selected,
                stats: shouldActivate
                  ? statsResult.status === 'fulfilled' && statsFailure === null
                    ? statsResult.value
                    : EMPTY_STATS
                  : current.data.stats,
                taskIterations:
                  ownershipResult.status === 'fulfilled'
                    ? ownershipResult.value.taskIterations
                    : applySelectedIterationOwnership(current.data.taskIterations, selected),
              },
              status: 'ready',
            }
          : current,
      );
      if (shouldActivate) {
        setCreateMessage({ text: '任务已移出迭代。', type: 'success' });
      }
    } catch (error) {
      if (isIterationResponseCurrent(targetIterationId, selectedIterationIdRef.current)) {
        setAddTaskError(getUserFacingError(error));
      }
    } finally {
      setIsRemovingTaskId(null);
    }
  }

  async function handleCloseIteration(): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || isEditingLocked) {
      return;
    }

    const projectId = state.data.project.id;
    const targetIterationId = state.data.selected.id;
    const movingTaskIds = state.data.selected.tasks
      .filter((task) => task.status !== 'COMPLETED')
      .map((task) => task.id);
    const nextIteration = closeNextIterationId
      ? state.data.iterations.find((iteration) => iteration.id === closeNextIterationId)
      : null;
    setIsClosing(true);
    setCloseError(null);

    try {
      const selected = await closeIteration(
        api,
        projectId,
        targetIterationId,
        closeNextIterationId ? { nextIterationId: closeNextIterationId } : {},
      );
      const [statsResult, ownershipResult] = await Promise.allSettled([
        getIterationStats(api, projectId, selected.id),
        loadIterationData(projectId),
      ]);
      const shouldActivate = isIterationResponseCurrent(
        targetIterationId,
        selectedIterationIdRef.current,
      );
      const statsFailure = getStatsFailure(selected, statsResult);

      if (shouldActivate) {
        setStatsError(statsFailure);
      }

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                iterations:
                  ownershipResult.status === 'fulfilled'
                    ? ownershipResult.value.iterations
                    : replaceSummary(current.data.iterations, selected),
                selected: shouldActivate ? selected : current.data.selected,
                stats: shouldActivate
                  ? statsResult.status === 'fulfilled' && statsFailure === null
                    ? statsResult.value
                    : EMPTY_STATS
                  : current.data.stats,
                taskIterations:
                  ownershipResult.status === 'fulfilled'
                    ? ownershipResult.value.taskIterations
                    : movingTaskIds.reduce<Record<string, TaskIterationOwnership>>(
                        (ownership, taskId) => {
                          if (nextIteration) {
                            ownership[taskId] = {
                              iterationId: nextIteration.id,
                              iterationName: nextIteration.name,
                              iterationStatus: nextIteration.status,
                            };
                          }

                          return ownership;
                        },
                        {
                          ...applySelectedIterationOwnership(current.data.taskIterations, selected),
                        },
                      ),
              },
              status: 'ready',
            }
          : current,
      );
      setCloseOpen(false);
      setCloseNextIterationId('');
      if (shouldActivate) {
        setCreateMessage({
          text: closeNextIterationId ? '迭代已关闭，未完成任务已迁移到下一迭代。' : '迭代已关闭。',
          type: 'success',
        });
      }
    } catch (error) {
      if (isIterationResponseCurrent(targetIterationId, selectedIterationIdRef.current)) {
        setCloseError(getUserFacingError(error));
      }
    } finally {
      setIsClosing(false);
    }
  }

  async function retrySelectedIterationStats(): Promise<void> {
    if (state.status !== 'ready' || !state.data.selected || isRefreshingStats || isWritePending) {
      return;
    }

    const iterationId = state.data.selected.id;
    const projectId = state.data.project.id;
    const requestVersion = selectionVersionRef.current;
    setIsRefreshingStats(true);

    try {
      const [selected, stats] = await Promise.all([
        getIteration(api, projectId, iterationId),
        getIterationStats(api, projectId, iterationId),
      ]);

      if (
        requestVersion === selectionVersionRef.current &&
        isIterationResponseCurrent(iterationId, selectedIterationIdRef.current)
      ) {
        const statsFailure = getStatsFailure(selected, { status: 'fulfilled', value: stats });
        if (statsFailure) {
          setStatsError(statsFailure);
          return;
        }
        setState((current) =>
          current.status === 'ready' && current.data.selected?.id === iterationId
            ? {
                data: {
                  ...current.data,
                  iterations: replaceSummary(current.data.iterations, selected),
                  selected,
                  stats,
                  taskIterations: applySelectedIterationOwnership(
                    current.data.taskIterations,
                    selected,
                  ),
                },
                status: 'ready',
              }
            : current,
        );
        setStatsError(null);
      }
    } catch (error) {
      if (
        requestVersion === selectionVersionRef.current &&
        isIterationResponseCurrent(iterationId, selectedIterationIdRef.current)
      ) {
        setStatsError(getUserFacingError(error));
      }
    } finally {
      if (requestVersion === selectionVersionRef.current) {
        setIsRefreshingStats(false);
      }
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

  const { iterations, project, selected, stats, taskIterations } = state.data;
  const canManage = canManageProject(project.accessRole) && project.status !== 'ARCHIVED';
  const statsUnavailable = statsError !== null;
  const overdueCount = stats.overdue;
  const pendingTaskMigrationSource = pendingTaskMigrationId
    ? taskIterations[pendingTaskMigrationId]
    : null;
  const selectedIsTerminal = selected?.status === 'COMPLETED' || selected?.status === 'CANCELED';
  const availableTasks = getAvailableTasks(state.data);
  const selectedAvailableTaskId =
    availableTasks.find((task) => task.id === addTaskId)?.id ?? availableTasks[0]?.id ?? '';
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
  const editDirty = hasUnsavedIterationChanges(editInitialForm, editForm);

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
                disabled={isCreating || isEditingLocked}
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
                disabled={isCreating || isEditingLocked}
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
                  disabled={isCreating || isEditingLocked}
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
                  disabled={isCreating || isEditingLocked}
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
              <button
                className="primary-button"
                disabled={isCreating || isEditingLocked}
                type="submit"
              >
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
                  disabled={
                    isLoadingSelection || isAddingTask || isClosing || isUpdating || isCreating
                  }
                  key={iteration.id}
                  onClick={() => requestIterationSelection(iteration.id)}
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

              {statsError ? (
                <div className="iteration-stats-error">
                  <ErrorNotice message={`迭代统计刷新失败：${statsError}`} />
                  <button
                    className="secondary-button"
                    disabled={isRefreshingStats || isWritePending}
                    onClick={() => void retrySelectedIterationStats()}
                    type="button"
                  >
                    {isRefreshingStats ? '正在重新加载...' : '重新加载统计'}
                  </button>
                </div>
              ) : null}

              <div className="iteration-stats" aria-label="迭代统计">
                <article>
                  <span>任务总数</span>
                  <strong>{statsUnavailable ? '-' : stats.total}</strong>
                </article>
                <article>
                  <span>已完成</span>
                  <strong>{statsUnavailable ? '-' : stats.completed}</strong>
                </article>
                <article>
                  <span>进行中</span>
                  <strong>{statsUnavailable ? '-' : stats.inProgress}</strong>
                </article>
                <article>
                  <span>阻塞</span>
                  <strong>{statsUnavailable ? '-' : stats.blocked}</strong>
                </article>
                <article className={!statsUnavailable && overdueCount > 0 ? 'is-warning' : ''}>
                  <span>逾期</span>
                  <strong>{statsUnavailable ? '-' : overdueCount}</strong>
                </article>
                <article>
                  <span>完成率</span>
                  <strong>
                    {statsUnavailable ? '-' : formatCompletionRate(stats.completionRate)}
                  </strong>
                </article>
              </div>

              {canManage ? (
                <div className="iteration-management">
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      disabled={isUpdating || isEditingLocked}
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
                          disabled={isUpdating || isEditingLocked || editDirty}
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
                        disabled={isUpdating || isEditingLocked || editDirty}
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
                  {editDirty ? <p>请先保存或放弃迭代修改，再更改迭代状态。</p> : null}

                  {editOpen ? (
                    <form
                      className="auth-form iteration-form iteration-edit-form"
                      onSubmit={(event) => void handleUpdate(event)}
                    >
                      <label className="form-field">
                        <span>迭代名称</span>
                        <input
                          disabled={isUpdating || isEditingLocked}
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
                          disabled={isUpdating || isEditingLocked}
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
                            disabled={isUpdating || isEditingLocked}
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
                            disabled={isUpdating || isEditingLocked}
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
                            isUpdating ||
                            isEditingLocked ||
                            !hasUnsavedIterationChanges(editInitialForm, editForm)
                          }
                          type="submit"
                        >
                          {isUpdating ? '正在保存...' : '保存迭代'}
                        </button>
                        <button
                          className="secondary-button"
                          disabled={isUpdating || isEditingLocked || !editDirty}
                          onClick={() => {
                            setEditForm(editInitialForm);
                            setEditErrors({});
                            setEditOpen(false);
                          }}
                          type="button"
                        >
                          放弃修改
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

                {canManage && !selectedIsTerminal ? (
                  <div className="iteration-add-task">
                    <label className="form-field">
                      <span>加入任务</span>
                      <select
                        disabled={isEditingLocked || isAddingTask || availableTasks.length === 0}
                        onChange={(event) => setAddTaskId(event.target.value)}
                        value={selectedAvailableTaskId}
                      >
                        {availableTasks.length === 0 ? (
                          <option value="">没有可加入的任务</option>
                        ) : (
                          availableTasks.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.title} · {getTaskStatusLabel(task.status)}
                              {taskIterations[task.id]
                                ? ` · 当前属于“${taskIterations[task.id]?.iterationName}”`
                                : ''}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <button
                      className="secondary-button"
                      disabled={isEditingLocked || isAddingTask || availableTasks.length === 0}
                      onClick={requestAddTask}
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
                      const overdue =
                        !statsUnavailable && isIterationTaskOverdue(task, new Date(stats.asOf));

                      return (
                        <article className="iteration-task-row" key={task.id}>
                          <div>
                            <strong>{task.title}</strong>
                            <span>
                              {getTaskStatusLabel(task.status)}
                              {task.dueDate
                                ? ` · 截止 ${formatTaskDueDate(task.dueDate)}`
                                : ' · 未设置截止日期'}
                            </span>
                          </div>
                          <div className="iteration-task-row__actions">
                            {overdue ? <span className="overdue-badge">已逾期</span> : null}
                            {canManage && (!selectedIsTerminal || task.status !== 'COMPLETED') ? (
                              <button
                                className="danger-text-button"
                                disabled={isEditingLocked || isRemovingTaskId !== null}
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

      {pendingIterationId ? (
        <ConfirmDialog
          confirmLabel="放弃并切换"
          message="当前迭代还有未保存的修改，切换后这些修改将丢失。"
          onCancel={() => setPendingIterationId(null)}
          onConfirm={() => {
            const iterationId = pendingIterationId;

            setPendingIterationId(null);
            setEditOpen(false);
            setEditErrors({});
            void selectIteration(iterationId);
          }}
          title="切换迭代"
          tone="danger"
        />
      ) : null}

      {pendingTaskMigrationId && pendingTaskMigrationSource ? (
        <ConfirmDialog
          confirmLabel="确认迁移"
          message={`任务当前属于“${pendingTaskMigrationSource.iterationName}”（${getIterationStatusLabel(
            pendingTaskMigrationSource.iterationStatus,
          )}）。继续后会将其移入当前迭代，原迭代统计也会变化。`}
          onCancel={() => setPendingTaskMigrationId(null)}
          onConfirm={() => {
            const taskId = pendingTaskMigrationId;
            const source = pendingTaskMigrationSource;

            setPendingTaskMigrationId(null);
            void handleAddTask(taskId, source);
          }}
          title="迁移任务"
          tone="danger"
        />
      ) : null}

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
