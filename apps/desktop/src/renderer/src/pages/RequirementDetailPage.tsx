import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { buildProjectPath, buildTaskPath } from '../app/navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type { ProjectDto } from '../features/projects/project-api';
import { getProject } from '../features/projects/project-api';
import {
  canDeleteProjectContent,
  canEditProjectContent,
  formatProjectDate,
  getProjectRoleLabel,
} from '../features/projects/project-presentation';
import type {
  RequirementDto,
  UpdateRequirementInput,
} from '../features/requirements/requirement-api';
import {
  deleteRequirement,
  getRequirement,
  updateRequirement,
} from '../features/requirements/requirement-api';
import {
  getRequirementPriorityLabel,
  getRequirementStatusLabel,
  getRequirementStatusOptions,
  getRequirementTaskProgress,
} from '../features/requirements/requirement-presentation';
import type {
  RequirementFormErrors,
  RequirementFormValues,
} from '../features/requirements/requirement-validation';
import {
  hasRequirementFormErrors,
  hasUnsavedRequirementChanges,
  validateRequirementForm,
} from '../features/requirements/requirement-validation';
import { getTaskStatusLabel } from '../features/tasks/task-presentation';
import { getUserFacingError } from '../lib/api/errors';

type RequirementDetailState =
  | { readonly status: 'loading' }
  | {
      readonly project: ProjectDto;
      readonly requirement: RequirementDto;
      readonly status: 'ready';
    }
  | { readonly message: string; readonly status: 'error' };

interface RequirementPageRequest {
  readonly projectId: string;
  readonly requirementId: string;
  readonly version: number;
}

function toForm(requirement: RequirementDto): RequirementFormValues {
  return {
    acceptanceCriteria: requirement.acceptanceCriteria,
    description: requirement.description ?? '',
    priority: requirement.priority,
    status: requirement.status,
    title: requirement.title,
  };
}

export function RequirementDetailPage() {
  const { api } = useSession();
  const navigate = useNavigate();
  const { projectId = '', requirementId = '' } = useParams<{
    projectId: string;
    requirementId: string;
  }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletedRequest, setDeletedRequest] = useState<RequirementPageRequest | null>(null);
  const [form, setForm] = useState<RequirementFormValues>({
    acceptanceCriteria: '',
    description: '',
    priority: 'MEDIUM',
    status: 'DRAFT',
    title: '',
  });
  const [formErrors, setFormErrors] = useState<RequirementFormErrors>({});
  const [initialForm, setInitialForm] = useState(form);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<RequirementDetailState>({ status: 'loading' });
  const activePageRef = useRef({ projectId, requirementId });
  const pageRequestVersionRef = useRef(0);

  activePageRef.current = { projectId, requirementId };

  function isCurrentRequest(request: RequirementPageRequest): boolean {
    return (
      request.projectId === activePageRef.current.projectId &&
      request.requirementId === activePageRef.current.requirementId &&
      request.version === pageRequestVersionRef.current
    );
  }

  useEffect(() => {
    pageRequestVersionRef.current += 1;
    setActionError(null);
    setActionMessage(null);
    setDeleteDialogOpen(false);
    setDeletedRequest(null);
    setFormErrors({});
    setIsDeleting(false);
    setIsSaving(false);

    if (!projectId || !requirementId) {
      setState({ message: '没有可加载的需求。', status: 'error' });
      return;
    }

    let isCancelled = false;

    setState({ status: 'loading' });
    void Promise.all([getProject(api, projectId), getRequirement(api, projectId, requirementId)])
      .then(([project, requirement]) => {
        if (!isCancelled) {
          const nextForm = toForm(requirement);

          setState({ project, requirement, status: 'ready' });
          setForm(nextForm);
          setInitialForm(nextForm);
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({ message: getUserFacingError(error), status: 'error' });
        }
      });

    return () => {
      isCancelled = true;
      pageRequestVersionRef.current += 1;
    };
  }, [api, projectId, requirementId, retryVersion]);

  useEffect(() => {
    if (
      deletedRequest &&
      deletedRequest.projectId === projectId &&
      deletedRequest.requirementId === requirementId &&
      deletedRequest.version === pageRequestVersionRef.current
    ) {
      navigate(buildProjectPath(deletedRequest.projectId, 'requirements'));
    }
  }, [deletedRequest, navigate, projectId, requirementId]);

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || isSaving || isDeleting || deletedRequest) {
      return;
    }

    const request: RequirementPageRequest = {
      projectId: state.project.id,
      requirementId: state.requirement.id,
      version: pageRequestVersionRef.current,
    };
    if (!isCurrentRequest(request)) return;

    const nextErrors = validateRequirementForm(form);

    setFormErrors(nextErrors);
    setActionError(null);
    setActionMessage(null);

    if (hasRequirementFormErrors(nextErrors)) {
      return;
    }

    const input: UpdateRequirementInput = {
      acceptanceCriteria: form.acceptanceCriteria.trim(),
      description: form.description.trim(),
      priority: form.priority,
      status: form.status,
      title: form.title.trim(),
    };

    setIsSaving(true);

    try {
      const requirement = await updateRequirement(
        api,
        request.projectId,
        request.requirementId,
        input,
      );
      if (!isCurrentRequest(request)) return;
      const nextForm = toForm(requirement);

      setState({ ...state, requirement });
      setForm(nextForm);
      setInitialForm(nextForm);
      setActionMessage('需求已保存。');
    } catch (error) {
      if (isCurrentRequest(request)) setActionError(getUserFacingError(error));
    } finally {
      if (isCurrentRequest(request)) setIsSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (state.status !== 'ready' || isDeleting || isSaving || deletedRequest) {
      return;
    }

    const request: RequirementPageRequest = {
      projectId: state.project.id,
      requirementId: state.requirement.id,
      version: pageRequestVersionRef.current,
    };
    if (!isCurrentRequest(request)) return;

    setIsDeleting(true);
    setActionError(null);

    try {
      await deleteRequirement(api, request.projectId, request.requirementId);
      if (!isCurrentRequest(request)) return;
      setDeleteDialogOpen(false);
      setDeletedRequest(request);
    } catch (error) {
      if (isCurrentRequest(request)) {
        setDeleteDialogOpen(false);
        setActionError(getUserFacingError(error));
      }
    } finally {
      if (isCurrentRequest(request)) setIsDeleting(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="需求详情" description="维护需求内容、状态和关联任务。" />
        <LoadingState label="正在加载需求详情" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="需求详情" description="维护需求内容、状态和关联任务。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="需求详情加载失败"
        />
      </div>
    );
  }

  const canEdit = canEditProjectContent(state.project.accessRole, state.project.status);
  const canDelete = canDeleteProjectContent(state.project.accessRole, state.project.status);
  const hasUnsavedChanges = canEdit && hasUnsavedRequirementChanges(initialForm, form);
  const statusOptions = getRequirementStatusOptions(state.requirement.status);

  return (
    <div className="page-stack p3-page">
      <UnsavedChangesGuard
        message="需求修改尚未保存，离开后更改将丢失。"
        when={!deletedRequest && (hasUnsavedChanges || isSaving)}
      />
      <div className="page-heading-with-action">
        <PageHeader title="需求详情" description="维护需求内容、状态和关联任务。" />
        <Link className="secondary-link" to={buildProjectPath(state.project.id, 'requirements')}>
          返回需求列表
        </Link>
      </div>

      <div className="requirement-detail-meta">
        <span className="requirement-number">{state.requirement.number}</span>
        <span>当前角色：{getProjectRoleLabel(state.project.accessRole)}</span>
        <span>更新于 {formatProjectDate(state.requirement.updatedAt)}</span>
      </div>
      {!canEdit ? (
        <div className="read-only-inline">当前角色或项目状态只能查看需求，不能修改内容。</div>
      ) : null}
      {actionError ? <ErrorNotice message={actionError} /> : null}
      {actionMessage ? <div className="success-notice">{actionMessage}</div> : null}

      <div className="requirement-detail-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>需求内容</h2>
              <p>需求状态只能按既定顺序向前推进。</p>
            </div>
          </div>
          <form className="auth-form requirement-form" onSubmit={(event) => void handleSave(event)}>
            <label className="form-field">
              <span>需求标题</span>
              <input
                disabled={!canEdit || isSaving}
                maxLength={100}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                value={form.title}
              />
              {formErrors.title ? <small>{formErrors.title}</small> : null}
            </label>

            <label className="form-field">
              <span>需求描述</span>
              <textarea
                disabled={!canEdit || isSaving}
                maxLength={5000}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={4}
                value={form.description}
              />
              {formErrors.description ? <small>{formErrors.description}</small> : null}
            </label>

            <label className="form-field">
              <span>验收标准</span>
              <textarea
                disabled={!canEdit || isSaving}
                maxLength={5000}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    acceptanceCriteria: event.target.value,
                  }))
                }
                rows={5}
                value={form.acceptanceCriteria}
              />
              {formErrors.acceptanceCriteria ? (
                <small>{formErrors.acceptanceCriteria}</small>
              ) : null}
            </label>

            <div className="project-form-grid">
              <label className="form-field">
                <span>优先级</span>
                <select
                  disabled={!canEdit || isSaving}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority:
                        event.target.value === 'HIGH'
                          ? 'HIGH'
                          : event.target.value === 'LOW'
                            ? 'LOW'
                            : 'MEDIUM',
                    }))
                  }
                  value={form.priority}
                >
                  <option value="HIGH">高</option>
                  <option value="MEDIUM">中</option>
                  <option value="LOW">低</option>
                </select>
              </label>

              <label className="form-field">
                <span>需求状态</span>
                <select
                  disabled={!canEdit || isSaving}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as RequirementFormValues['status'],
                    }))
                  }
                  value={form.status}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {getRequirementStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {canEdit ? (
              <div className="form-actions">
                <button
                  className="primary-button"
                  disabled={!hasUnsavedChanges || isSaving}
                  type="submit"
                >
                  {isSaving ? '正在保存...' : '保存需求'}
                </button>
              </div>
            ) : null}
          </form>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>关联任务</h2>
              <p>{getRequirementTaskProgress(state.requirement.tasks)}</p>
            </div>
          </div>

          {state.requirement.tasks.length === 0 ? (
            <div className="linked-task-empty">暂无关联任务</div>
          ) : (
            <div className="linked-task-list">
              {state.requirement.tasks.map((task) => (
                <article className="linked-task-row" key={task.id}>
                  <strong>
                    <Link to={buildTaskPath(state.project.id, task.id)}>{task.title}</Link>
                  </strong>
                  <span>{getTaskStatusLabel(task.status)}</span>
                </article>
              ))}
            </div>
          )}

          <div className="requirement-summary">
            <span>优先级：{getRequirementPriorityLabel(state.requirement.priority)}</span>
            <span>状态：{getRequirementStatusLabel(state.requirement.status)}</span>
          </div>
        </section>
      </div>

      {canDelete ? (
        <section className="panel danger-zone">
          <div className="panel__header">
            <div>
              <h2>删除需求</h2>
              <p>删除需求前请确认关联任务已处理完毕。</p>
            </div>
          </div>
          <button
            className="danger-button"
            disabled={isDeleting || isSaving}
            onClick={() => setDeleteDialogOpen(true)}
            type="button"
          >
            删除需求
          </button>
        </section>
      ) : null}

      {deleteDialogOpen ? (
        <ConfirmDialog
          confirmLabel="确认删除"
          isPending={isDeleting}
          message={`删除需求 ${state.requirement.number} 后不可恢复。`}
          onCancel={() => setDeleteDialogOpen(false)}
          onConfirm={() => void handleDelete()}
          title="删除需求"
          tone="danger"
        />
      ) : null}
    </div>
  );
}
