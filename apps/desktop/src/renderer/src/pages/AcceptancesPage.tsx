import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { buildTaskPath } from '../app/navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import type {
  AcceptanceDto,
  AcceptanceResult,
  AcceptanceSummaryDto,
} from '../features/acceptances/acceptance-api';
import {
  createAcceptance,
  getAcceptance,
  listAcceptances,
  updateAcceptance,
} from '../features/acceptances/acceptance-api';
import {
  canCreateRemediationTask,
  getAcceptanceResultLabel,
  getAcceptanceResultTransitions,
} from '../features/acceptances/acceptance-presentation';
import type {
  AcceptanceFormErrors,
  AcceptanceFormValues,
} from '../features/acceptances/acceptance-validation';
import {
  acceptanceToForm,
  formToCreateAcceptanceInput,
  formToUpdateAcceptanceInput,
  hasAcceptanceFormErrors,
  hasUnsavedAcceptanceChanges,
  validateAcceptanceForm,
} from '../features/acceptances/acceptance-validation';
import { useSession } from '../features/auth/session';
import type { IterationSummaryDto } from '../features/iterations/iteration-api';
import { addIterationTask, listIterations } from '../features/iterations/iteration-api';
import type { ProjectDto, ProjectMemberDto } from '../features/projects/project-api';
import { getProject, listProjectMembers } from '../features/projects/project-api';
import { canManageProject, getProjectRoleLabel } from '../features/projects/project-presentation';
import type { RequirementDto } from '../features/requirements/requirement-api';
import { listRequirements } from '../features/requirements/requirement-api';
import { createTask } from '../features/tasks/task-api';
import { getTaskStatusLabel } from '../features/tasks/task-presentation';
import { getUserFacingError } from '../lib/api/errors';

const EMPTY_ACCEPTANCE_FORM: AcceptanceFormValues = {
  acceptanceDate: '',
  failureReason: '',
  goal: '',
  participantIds: [],
  result: 'NOT_STARTED',
  stageName: '',
  standards: '',
};

const EMPTY_REMEDIATION_FORM = {
  assigneeId: '',
  dueDate: '',
  iterationId: '',
  requirementId: '',
  title: '',
};

interface AcceptanceData {
  readonly acceptance: AcceptanceDto | null;
  readonly acceptances: AcceptanceSummaryDto[];
  readonly iterations: IterationSummaryDto[];
  readonly members: ProjectMemberDto[];
  readonly project: ProjectDto;
  readonly requirements: RequirementDto[];
}

interface PendingRemediationTask {
  readonly acceptanceId: string;
  readonly iterationApplied: boolean;
  readonly iterationId: string | null;
  readonly taskId: string;
  readonly title: string;
}

type AcceptanceState =
  | { readonly status: 'loading' }
  | { readonly data: AcceptanceData; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

export function AcceptancesPage() {
  const { api } = useSession();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [acceptanceErrors, setAcceptanceErrors] = useState<AcceptanceFormErrors>({});
  const [acceptanceForm, setAcceptanceForm] = useState<AcceptanceFormValues>(EMPTY_ACCEPTANCE_FORM);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [createErrors, setCreateErrors] = useState<AcceptanceFormErrors>({});
  const [createForm, setCreateForm] = useState<AcceptanceFormValues>(EMPTY_ACCEPTANCE_FORM);
  const [createMessage, setCreateMessage] = useState<{
    readonly text: string;
    readonly type: 'error' | 'success';
  } | null>(null);
  const [editInitialForm, setEditInitialForm] =
    useState<AcceptanceFormValues>(EMPTY_ACCEPTANCE_FORM);
  const [editOpen, setEditOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingRemediation, setIsCreatingRemediation] = useState(false);
  const [isLoadingSelection, setIsLoadingSelection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAcceptanceId, setPendingAcceptanceId] = useState<string | null>(null);
  const [pendingRemediationTask, setPendingRemediationTask] =
    useState<PendingRemediationTask | null>(null);
  const [remediationErrors, setRemediationErrors] = useState<string | null>(null);
  const [remediationForm, setRemediationForm] = useState(EMPTY_REMEDIATION_FORM);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<AcceptanceState>({ status: 'loading' });
  const activeAcceptanceIdRef = useRef<string | null>(null);
  const selectionVersionRef = useRef(0);

  const selectedAcceptanceId =
    state.status === 'ready' ? (state.data.acceptance?.id ?? null) : null;
  const selectedAcceptanceUpdatedAt =
    state.status === 'ready' ? (state.data.acceptance?.updatedAt ?? null) : null;

  activeAcceptanceIdRef.current = selectedAcceptanceId;

  function toAcceptanceSummary(acceptance: AcceptanceDto): AcceptanceSummaryDto {
    return {
      acceptanceDate: acceptance.acceptanceDate,
      createdAt: acceptance.createdAt,
      createdById: acceptance.createdById,
      failureReason: acceptance.failureReason,
      goal: acceptance.goal,
      id: acceptance.id,
      participants: acceptance.participants,
      projectId: acceptance.projectId,
      remediationTaskCount: acceptance.remediationTasks.length,
      result: acceptance.result,
      stageName: acceptance.stageName,
      standards: acceptance.standards,
      updatedAt: acceptance.updatedAt,
    };
  }

  useEffect(() => {
    selectionVersionRef.current += 1;
    setActionError(null);
    setActionMessage(null);
    setAcceptanceErrors({});
    setCreateErrors({});
    setCreateMessage(null);
    setEditOpen(false);
    setPendingAcceptanceId(null);
    setPendingRemediationTask(null);
    setRemediationErrors(null);
    setRemediationForm(EMPTY_REMEDIATION_FORM);

    if (!projectId) {
      setState({ message: '没有可加载的项目。', status: 'error' });
      return;
    }

    let isCancelled = false;
    const requestVersion = ++selectionVersionRef.current;

    setState({ status: 'loading' });
    void Promise.all([
      getProject(api, projectId),
      listProjectMembers(api, projectId),
      listAcceptances(api, projectId),
      listRequirements(api, projectId),
      listIterations(api, projectId),
    ])
      .then(async ([project, members, acceptanceSummaries, requirements, iterations]) => {
        const firstAcceptance = acceptanceSummaries[0] ?? null;
        const acceptance = firstAcceptance
          ? await getAcceptance(api, projectId, firstAcceptance.id)
          : null;

        if (!isCancelled && selectionVersionRef.current === requestVersion) {
          setState({
            data: {
              acceptance,
              acceptances: acceptanceSummaries,
              iterations,
              members,
              project,
              requirements,
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
    if (state.status === 'ready' && state.data.acceptance) {
      const nextForm = acceptanceToForm(state.data.acceptance);

      setAcceptanceForm(nextForm);
      setEditInitialForm(nextForm);
      setAcceptanceErrors({});
      setEditOpen(false);
    }
  }, [selectedAcceptanceId, selectedAcceptanceUpdatedAt, state.status]);

  function requestAcceptanceSelection(acceptanceId: string): void {
    if (editOpen && hasUnsavedAcceptanceChanges(editInitialForm, acceptanceForm)) {
      setPendingAcceptanceId(acceptanceId);
      return;
    }

    void selectAcceptance(acceptanceId);
  }

  async function selectAcceptance(acceptanceId: string): Promise<void> {
    if (state.status !== 'ready' || state.data.acceptance?.id === acceptanceId) {
      return;
    }

    const requestVersion = ++selectionVersionRef.current;
    setIsLoadingSelection(true);
    setCreateMessage(null);
    setActionError(null);
    setActionMessage(null);
    setPendingAcceptanceId(null);

    try {
      const acceptance = await getAcceptance(api, state.data.project.id, acceptanceId);

      if (selectionVersionRef.current !== requestVersion) {
        return;
      }

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                acceptance,
                acceptances: current.data.acceptances.map((item) =>
                  item.id === acceptance.id ? toAcceptanceSummary(acceptance) : item,
                ),
              },
              status: 'ready',
            }
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

    if (state.status !== 'ready' || isCreating) {
      return;
    }

    const errors = validateAcceptanceForm(createForm);

    setCreateErrors(errors);
    setCreateMessage(null);

    if (hasAcceptanceFormErrors(errors)) {
      return;
    }

    setIsCreating(true);
    const selectedAtStart = activeAcceptanceIdRef.current;

    try {
      const acceptance = await createAcceptance(
        api,
        state.data.project.id,
        formToCreateAcceptanceInput(createForm),
      );
      const shouldActivate = activeAcceptanceIdRef.current === selectedAtStart;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                acceptance: shouldActivate ? acceptance : current.data.acceptance,
                acceptances: [toAcceptanceSummary(acceptance), ...current.data.acceptances],
              },
              status: 'ready',
            }
          : current,
      );
      setCreateForm(EMPTY_ACCEPTANCE_FORM);
      setCreateErrors({});
      setCreateMessage({ text: '阶段验收已创建。', type: 'success' });
    } catch (error) {
      setCreateMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || !state.data.acceptance || isSaving) {
      return;
    }

    const errors = validateAcceptanceForm(acceptanceForm);

    setAcceptanceErrors(errors);
    setCreateMessage(null);

    if (hasAcceptanceFormErrors(errors)) {
      return;
    }

    const targetId = state.data.acceptance.id;
    setIsSaving(true);

    try {
      const acceptance = await updateAcceptance(
        api,
        state.data.project.id,
        targetId,
        formToUpdateAcceptanceInput(acceptanceForm),
      );
      const shouldActivate = activeAcceptanceIdRef.current === targetId;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                acceptance: shouldActivate ? acceptance : current.data.acceptance,
                acceptances: current.data.acceptances.map((item) =>
                  item.id === acceptance.id ? toAcceptanceSummary(acceptance) : item,
                ),
              },
              status: 'ready',
            }
          : current,
      );
      if (shouldActivate) {
        setCreateMessage({ text: '阶段验收已保存。', type: 'success' });
      }
    } catch (error) {
      if (activeAcceptanceIdRef.current === targetId) {
        setCreateMessage({ text: getUserFacingError(error), type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function continuePendingRemediation(
    pending: PendingRemediationTask,
    projectId: string,
  ): Promise<void> {
    let current = pending;

    try {
      if (current.iterationId && !current.iterationApplied) {
        await addIterationTask(api, projectId, current.iterationId, current.taskId, null);
        current = { ...current, iterationApplied: true };
        setPendingRemediationTask(current);
      }
    } catch (error) {
      setActionError(
        `整改任务已创建，但加入迭代失败：${getUserFacingError(error)}。重试不会再次创建任务。`,
      );
      return;
    }

    try {
      const acceptance = await getAcceptance(api, projectId, current.acceptanceId);

      setState((state) =>
        state.status === 'ready'
          ? {
              data: {
                ...state.data,
                acceptance:
                  state.data.acceptance?.id === acceptance.id ? acceptance : state.data.acceptance,
                acceptances: state.data.acceptances.map((item) =>
                  item.id === acceptance.id ? toAcceptanceSummary(acceptance) : item,
                ),
              },
              status: 'ready',
            }
          : state,
      );
      setPendingRemediationTask(null);
      setRemediationForm(EMPTY_REMEDIATION_FORM);
      setActionMessage('整改任务已创建。');
    } catch (error) {
      setActionError(
        `整改任务已创建，但刷新验收失败：${getUserFacingError(error)}。重试不会再次创建任务。`,
      );
    }
  }

  async function handleCreateRemediation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || !state.data.acceptance || isCreatingRemediation) {
      return;
    }

    const title = remediationForm.title.trim();

    if (!title) {
      setRemediationErrors('请输入整改任务标题。');
      return;
    }

    const projectId = state.data.project.id;
    const acceptanceId = state.data.acceptance.id;
    const iterationId = remediationForm.iterationId || null;
    setRemediationErrors(null);
    setActionError(null);
    setActionMessage(null);
    setIsCreatingRemediation(true);

    try {
      const task = await createTask(api, projectId, {
        acceptanceId,
        ...(remediationForm.assigneeId ? { assigneeId: remediationForm.assigneeId } : {}),
        ...(remediationForm.dueDate ? { dueDate: remediationForm.dueDate } : {}),
        ...(remediationForm.requirementId ? { requirementId: remediationForm.requirementId } : {}),
        priority: 'MEDIUM',
        title,
      });
      const pending = {
        acceptanceId,
        iterationApplied: !iterationId,
        iterationId,
        taskId: task.id,
        title: task.title,
      };

      setPendingRemediationTask(pending);
      await continuePendingRemediation(pending, projectId);
    } catch (error) {
      setActionError(getUserFacingError(error));
    } finally {
      setIsCreatingRemediation(false);
    }
  }

  async function retryPendingRemediation(): Promise<void> {
    if (state.status !== 'ready' || !pendingRemediationTask || isCreatingRemediation) {
      return;
    }

    setIsCreatingRemediation(true);
    setActionError(null);

    try {
      await continuePendingRemediation(pendingRemediationTask, state.data.project.id);
    } finally {
      setIsCreatingRemediation(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="阶段验收" description="记录验收标准、结果和整改任务。" />
        <LoadingState label="正在加载阶段验收" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="阶段验收" description="记录验收标准、结果和整改任务。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((value) => value + 1)}
          title="阶段验收加载失败"
        />
      </div>
    );
  }

  const { acceptance, acceptances, iterations, members, project, requirements } = state.data;
  const canManage = canManageProject(project.accessRole) && project.status !== 'ARCHIVED';
  const createDraft =
    createForm.stageName.length > 0 ||
    createForm.standards.length > 0 ||
    createForm.goal.length > 0;
  const editDirty = editOpen && hasUnsavedAcceptanceChanges(editInitialForm, acceptanceForm);

  return (
    <div className="page-stack p5-page">
      <UnsavedChangesGuard
        message="阶段验收内容尚未保存，离开后修改将丢失。"
        when={createDraft || editDirty}
      />
      <PageHeader title="阶段验收" description="记录验收标准、结果和整改任务。" />

      <div className="read-only-inline">
        当前角色：{getProjectRoleLabel(project.accessRole)}
        {!canManage ? ' · 只有项目负责人和管理员可以维护阶段验收' : ''}
      </div>
      {createMessage?.type === 'error' ? <ErrorNotice message={createMessage.text} /> : null}
      {createMessage?.type === 'success' ? (
        <div className="success-notice">{createMessage.text}</div>
      ) : null}

      {canManage ? (
        <section className="panel acceptance-create-panel">
          <div className="panel__header">
            <div>
              <h2>创建阶段验收</h2>
              <p>先记录阶段目标、验收标准和参与人员。</p>
            </div>
          </div>
          <form
            className="auth-form acceptance-form"
            onSubmit={(event) => void handleCreate(event)}
          >
            <div className="project-form-grid">
              <label className="form-field">
                <span>验收阶段名称</span>
                <input
                  disabled={isCreating}
                  maxLength={100}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      stageName: event.target.value,
                    }))
                  }
                  value={createForm.stageName}
                />
                {createErrors.stageName ? <small>{createErrors.stageName}</small> : null}
              </label>
              <label className="form-field">
                <span>验收日期</span>
                <input
                  disabled={isCreating}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      acceptanceDate: event.target.value,
                    }))
                  }
                  type="date"
                  value={createForm.acceptanceDate}
                />
                {createErrors.acceptanceDate ? <small>{createErrors.acceptanceDate}</small> : null}
              </label>
            </div>
            <label className="form-field">
              <span>验收目标</span>
              <textarea
                disabled={isCreating}
                maxLength={1000}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, goal: event.target.value }))
                }
                rows={3}
                value={createForm.goal}
              />
            </label>
            <label className="form-field">
              <span>验收标准</span>
              <textarea
                disabled={isCreating}
                maxLength={5000}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    standards: event.target.value,
                  }))
                }
                rows={4}
                value={createForm.standards}
              />
              {createErrors.standards ? <small>{createErrors.standards}</small> : null}
            </label>
            <AcceptanceParticipantSelector
              disabled={isCreating}
              error={createErrors.participantIds}
              members={members}
              onChange={(participantIds) =>
                setCreateForm((current) => ({ ...current, participantIds }))
              }
              selectedIds={createForm.participantIds}
            />
            <div className="form-actions">
              <button className="primary-button" disabled={isCreating} type="submit">
                {isCreating ? '正在创建...' : '创建阶段验收'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {acceptances.length === 0 ? (
        <section className="panel panel--large">
          <EmptyState title="暂无阶段验收" description="创建验收后可以记录结果和整改任务。" />
        </section>
      ) : (
        <div className="acceptance-workspace">
          <section className="panel acceptance-list-panel">
            <div className="panel__header">
              <div>
                <h2>验收记录</h2>
                <p>共 {acceptances.length} 条记录</p>
              </div>
            </div>
            <div className="acceptance-list">
              {acceptances.map((item) => (
                <button
                  className={`acceptance-list-row${acceptance?.id === item.id ? ' is-active' : ''}`}
                  disabled={isLoadingSelection || pendingRemediationTask !== null}
                  key={item.id}
                  onClick={() => requestAcceptanceSelection(item.id)}
                  type="button"
                >
                  <strong>{item.stageName}</strong>
                  <span>
                    {item.acceptanceDate ? formatAcceptanceDate(item.acceptanceDate) : '未设置日期'}
                  </span>
                  <span
                    className={`acceptance-result acceptance-result--${item.result.toLowerCase()}`}
                  >
                    {getAcceptanceResultLabel(item.result)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {acceptance ? (
            <section className="panel acceptance-detail-panel">
              <div className="panel__header">
                <div>
                  <h2>{acceptance.stageName}</h2>
                  <p>{acceptance.goal || '暂未填写验收目标。'}</p>
                </div>
                <span
                  className={`acceptance-result acceptance-result--${acceptance.result.toLowerCase()}`}
                >
                  {getAcceptanceResultLabel(acceptance.result)}
                </span>
              </div>

              <div className="acceptance-meta">
                <span>
                  验收日期：
                  {acceptance.acceptanceDate
                    ? formatAcceptanceDate(acceptance.acceptanceDate)
                    : '未设置'}
                </span>
                <span>参与 {acceptance.participants.length} 人</span>
              </div>

              {canManage ? (
                <div className="button-row acceptance-actions">
                  <button
                    className="secondary-button"
                    disabled={isSaving}
                    onClick={() => setEditOpen((value) => !value)}
                    type="button"
                  >
                    {editOpen ? '收起编辑' : '编辑验收'}
                  </button>
                  {getAcceptanceResultTransitions(acceptance.result).map((result) => (
                    <button
                      className="secondary-button"
                      disabled={isSaving}
                      key={result}
                      onClick={() => {
                        setAcceptanceForm((current) => ({
                          ...current,
                          result,
                          ...(result === 'IN_PROGRESS' ? { failureReason: '' } : {}),
                        }));
                        setEditOpen(true);
                      }}
                      type="button"
                    >
                      进入“{getAcceptanceResultLabel(result)}”
                    </button>
                  ))}
                </div>
              ) : null}

              {editOpen ? (
                <form
                  className="auth-form acceptance-edit-form"
                  onSubmit={(event) => void handleSave(event)}
                >
                  <label className="form-field">
                    <span>验收阶段名称</span>
                    <input
                      disabled={isSaving}
                      maxLength={100}
                      onChange={(event) =>
                        setAcceptanceForm((current) => ({
                          ...current,
                          stageName: event.target.value,
                        }))
                      }
                      value={acceptanceForm.stageName}
                    />
                    {acceptanceErrors.stageName ? (
                      <small>{acceptanceErrors.stageName}</small>
                    ) : null}
                  </label>
                  <label className="form-field">
                    <span>验收目标</span>
                    <textarea
                      disabled={isSaving}
                      maxLength={1000}
                      onChange={(event) =>
                        setAcceptanceForm((current) => ({
                          ...current,
                          goal: event.target.value,
                        }))
                      }
                      rows={3}
                      value={acceptanceForm.goal}
                    />
                  </label>
                  <label className="form-field">
                    <span>验收标准</span>
                    <textarea
                      disabled={isSaving}
                      maxLength={5000}
                      onChange={(event) =>
                        setAcceptanceForm((current) => ({
                          ...current,
                          standards: event.target.value,
                        }))
                      }
                      rows={4}
                      value={acceptanceForm.standards}
                    />
                    {acceptanceErrors.standards ? (
                      <small>{acceptanceErrors.standards}</small>
                    ) : null}
                  </label>
                  <div className="project-form-grid">
                    <label className="form-field">
                      <span>验收日期</span>
                      <input
                        disabled={isSaving}
                        onChange={(event) =>
                          setAcceptanceForm((current) => ({
                            ...current,
                            acceptanceDate: event.target.value,
                          }))
                        }
                        type="date"
                        value={acceptanceForm.acceptanceDate}
                      />
                    </label>
                    <label className="form-field">
                      <span>验收结果</span>
                      <select
                        disabled={isSaving}
                        onChange={(event) =>
                          setAcceptanceForm((current) => ({
                            ...current,
                            result: event.target.value as AcceptanceResult,
                          }))
                        }
                        value={acceptanceForm.result}
                      >
                        {[acceptance.result, ...getAcceptanceResultTransitions(acceptance.result)]
                          .filter((result, index, all) => all.indexOf(result) === index)
                          .map((result) => (
                            <option key={result} value={result}>
                              {getAcceptanceResultLabel(result)}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  {acceptanceForm.result === 'FAILED' ? (
                    <label className="form-field">
                      <span>未通过原因</span>
                      <textarea
                        disabled={isSaving}
                        maxLength={5000}
                        onChange={(event) =>
                          setAcceptanceForm((current) => ({
                            ...current,
                            failureReason: event.target.value,
                          }))
                        }
                        rows={3}
                        value={acceptanceForm.failureReason}
                      />
                      {acceptanceErrors.failureReason ? (
                        <small>{acceptanceErrors.failureReason}</small>
                      ) : null}
                    </label>
                  ) : null}
                  <AcceptanceParticipantSelector
                    disabled={isSaving}
                    error={acceptanceErrors.participantIds}
                    members={members}
                    onChange={(participantIds) =>
                      setAcceptanceForm((current) => ({ ...current, participantIds }))
                    }
                    selectedIds={acceptanceForm.participantIds}
                  />
                  <div className="form-actions">
                    <button
                      className="primary-button"
                      disabled={
                        isSaving || !hasUnsavedAcceptanceChanges(editInitialForm, acceptanceForm)
                      }
                      type="submit"
                    >
                      {isSaving ? '正在保存...' : '保存验收'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="acceptance-details">
                  <article>
                    <h3>验收标准</h3>
                    <p>{acceptance.standards}</p>
                  </article>
                  {acceptance.failureReason ? (
                    <article className="acceptance-failure">
                      <h3>未通过原因</h3>
                      <p>{acceptance.failureReason}</p>
                    </article>
                  ) : null}
                </div>
              )}

              <section className="acceptance-remediation-section">
                <div className="panel__header">
                  <div>
                    <h3>整改任务</h3>
                    <p>验收未通过时可以创建整改任务并关联需求或迭代。</p>
                  </div>
                </div>
                {actionError ? <ErrorNotice message={actionError} /> : null}
                {actionMessage ? <div className="success-notice">{actionMessage}</div> : null}

                {pendingRemediationTask ? (
                  <div className="remediation-pending">
                    <p>
                      已创建任务“{pendingRemediationTask.title}
                      ”，后续步骤尚未完成。重试不会重复创建任务。
                    </p>
                    <div className="button-row">
                      <Link
                        className="secondary-link"
                        to={buildTaskPath(project.id, pendingRemediationTask.taskId)}
                      >
                        查看已创建任务
                      </Link>
                      <button
                        className="secondary-button"
                        disabled={isCreatingRemediation}
                        onClick={() => void retryPendingRemediation()}
                        type="button"
                      >
                        {isCreatingRemediation
                          ? '正在重试...'
                          : pendingRemediationTask.iterationId &&
                              !pendingRemediationTask.iterationApplied
                            ? '重试加入迭代并刷新'
                            : '重新加载验收'}
                      </button>
                    </div>
                  </div>
                ) : canManage && canCreateRemediationTask(acceptance.result) ? (
                  <form
                    className="auth-form remediation-form"
                    onSubmit={(event) => void handleCreateRemediation(event)}
                  >
                    <div className="remediation-grid">
                      <label className="form-field">
                        <span>整改任务标题</span>
                        <input
                          onChange={(event) =>
                            setRemediationForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          value={remediationForm.title}
                        />
                      </label>
                      <label className="form-field">
                        <span>负责人</span>
                        <select
                          onChange={(event) =>
                            setRemediationForm((current) => ({
                              ...current,
                              assigneeId: event.target.value,
                            }))
                          }
                          value={remediationForm.assigneeId}
                        >
                          <option value="">未分配</option>
                          {members.map((member) => (
                            <option key={member.userId} value={member.userId}>
                              {member.nickname} (@{member.username})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-field">
                        <span>截止日期</span>
                        <input
                          onChange={(event) =>
                            setRemediationForm((current) => ({
                              ...current,
                              dueDate: event.target.value,
                            }))
                          }
                          type="date"
                          value={remediationForm.dueDate}
                        />
                      </label>
                      <label className="form-field">
                        <span>关联需求</span>
                        <select
                          onChange={(event) =>
                            setRemediationForm((current) => ({
                              ...current,
                              requirementId: event.target.value,
                            }))
                          }
                          value={remediationForm.requirementId}
                        >
                          <option value="">不关联需求</option>
                          {requirements.map((requirement) => (
                            <option key={requirement.id} value={requirement.id}>
                              {requirement.number} · {requirement.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-field">
                        <span>关联迭代</span>
                        <select
                          onChange={(event) =>
                            setRemediationForm((current) => ({
                              ...current,
                              iterationId: event.target.value,
                            }))
                          }
                          value={remediationForm.iterationId}
                        >
                          <option value="">不加入迭代</option>
                          {iterations
                            .filter(
                              (iteration) =>
                                iteration.status !== 'COMPLETED' && iteration.status !== 'CANCELED',
                            )
                            .map((iteration) => (
                              <option key={iteration.id} value={iteration.id}>
                                {iteration.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    {remediationErrors ? <small>{remediationErrors}</small> : null}
                    <div className="form-actions">
                      <button
                        className="primary-button"
                        disabled={isCreatingRemediation}
                        type="submit"
                      >
                        {isCreatingRemediation ? '正在创建...' : '创建整改任务'}
                      </button>
                    </div>
                  </form>
                ) : null}

                {acceptance.remediationTasks.length === 0 ? (
                  <div className="linked-task-empty">暂无整改任务</div>
                ) : (
                  <div className="linked-task-list">
                    {acceptance.remediationTasks.map((task) => (
                      <article className="linked-task-row" key={task.id}>
                        <strong>
                          <Link to={buildTaskPath(project.id, task.id)}>{task.title}</Link>
                        </strong>
                        <span>{getTaskStatusLabel(task.status)}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>
          ) : null}
        </div>
      )}

      {pendingAcceptanceId ? (
        <ConfirmDialog
          confirmLabel="放弃并切换"
          message="当前验收还有未保存的修改，切换后这些修改将丢失。"
          onCancel={() => setPendingAcceptanceId(null)}
          onConfirm={() => {
            const acceptanceId = pendingAcceptanceId;

            setPendingAcceptanceId(null);
            setEditOpen(false);
            setAcceptanceErrors({});
            void selectAcceptance(acceptanceId);
          }}
          title="切换验收记录"
          tone="danger"
        />
      ) : null}
    </div>
  );
}

function formatAcceptanceDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '日期无效'
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

interface AcceptanceParticipantSelectorProps {
  readonly disabled: boolean;
  readonly error?: string;
  readonly members: readonly ProjectMemberDto[];
  readonly onChange: (ids: string[]) => void;
  readonly selectedIds: readonly string[];
}

function AcceptanceParticipantSelector({
  disabled,
  error,
  members,
  onChange,
  selectedIds,
}: AcceptanceParticipantSelectorProps) {
  return (
    <fieldset className="participant-selector" disabled={disabled}>
      <legend>参与人员</legend>
      <div>
        {members.map((member) => (
          <label key={member.userId}>
            <input
              checked={selectedIds.includes(member.userId)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selectedIds, member.userId]
                    : selectedIds.filter((id) => id !== member.userId),
                )
              }
              type="checkbox"
            />
            <span>
              {member.nickname} (@{member.username})
            </span>
          </label>
        ))}
      </div>
      {error ? <small>{error}</small> : null}
    </fieldset>
  );
}
