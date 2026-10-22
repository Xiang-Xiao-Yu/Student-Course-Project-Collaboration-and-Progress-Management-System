import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { buildProjectPath } from '../app/navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import type { ProjectDto, ProjectInput, ProjectStatus } from '../features/projects/project-api';
import {
  archiveProject,
  deleteProject,
  getProject,
  updateProject,
  updateProjectStatus,
} from '../features/projects/project-api';
import {
  canManageProject,
  formatProjectDate,
  getProjectRoleLabel,
  getProjectStatusLabel,
  getProjectStatusTransitions,
  isProjectArchived,
  toProjectDateInput,
} from '../features/projects/project-presentation';
import type { ProjectFormErrors, ProjectFormValues } from '../features/projects/project-validation';
import {
  hasProjectFormErrors,
  hasUnsavedProjectChanges,
  validateDeleteConfirmation,
  validateProjectForm,
} from '../features/projects/project-validation';
import { useSession } from '../features/auth/session';
import { getUserFacingError } from '../lib/api/errors';

type ProjectState =
  | { readonly status: 'loading' }
  | { readonly project: ProjectDto; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

function projectToForm(project: ProjectDto): ProjectFormValues {
  return {
    description: project.description ?? '',
    endDate: toProjectDateInput(project.endDate),
    name: project.name,
    startDate: toProjectDateInput(project.startDate),
  };
}

function formToProjectInput(values: ProjectFormValues): ProjectInput {
  return {
    description: values.description.trim(),
    ...(values.endDate ? { endDate: values.endDate } : {}),
    name: values.name.trim(),
    ...(values.startDate ? { startDate: values.startDate } : {}),
  };
}

export function ProjectSettingsPage() {
  const { api } = useSession();
  const navigate = useNavigate();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteConfirmationError, setDeleteConfirmationError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<ProjectFormValues>({
    description: '',
    endDate: '',
    name: '',
    startDate: '',
  });
  const [formErrors, setFormErrors] = useState<ProjectFormErrors>({});
  const [initialForm, setInitialForm] = useState<ProjectFormValues>(form);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [projectState, setProjectState] = useState<ProjectState>({ status: 'loading' });
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setProjectState({ message: '没有可加载的项目。', status: 'error' });
      return;
    }

    let isCancelled = false;

    setProjectState({ status: 'loading' });
    void getProject(api, projectId)
      .then((project) => {
        if (!isCancelled) {
          const nextForm = projectToForm(project);

          setProjectState({ project, status: 'ready' });
          setForm(nextForm);
          setInitialForm(nextForm);
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setProjectState({
            message: getUserFacingError(error),
            status: 'error',
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api, projectId, retryVersion]);

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (projectState.status !== 'ready' || isSaving) {
      return;
    }

    const nextErrors = { ...validateProjectForm(form) };
    const project = projectState.project;

    if (project.startDate && !form.startDate) {
      nextErrors.startDate = '当前接口不支持清除已设置的开始日期，请填写新日期。';
    }

    if (project.endDate && !form.endDate) {
      nextErrors.endDate = '当前接口不支持清除已设置的结束日期，请填写新日期。';
    }

    setFormErrors(nextErrors);
    setActionError(null);
    setActionMessage(null);

    if (hasProjectFormErrors(nextErrors)) {
      return;
    }

    setIsSaving(true);

    try {
      const updatedProject = await updateProject(api, project.id, formToProjectInput(form));
      const nextForm = projectToForm(updatedProject);

      setProjectState({ project: updatedProject, status: 'ready' });
      setForm(nextForm);
      setInitialForm(nextForm);
      setActionMessage('项目基本信息已保存。');
    } catch (error) {
      setActionError(getUserFacingError(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function applyStatus(targetStatus: ProjectStatus): Promise<void> {
    if (projectState.status !== 'ready' || isUpdatingStatus) {
      return;
    }

    setIsUpdatingStatus(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const project = projectState.project;
      const updatedProject =
        targetStatus === 'ARCHIVED'
          ? await archiveProject(api, project.id)
          : await updateProjectStatus(api, project.id, targetStatus);

      setProjectState({ project: updatedProject, status: 'ready' });
      setArchiveConfirmationOpen(false);
      setActionMessage(`项目状态已更新为“${getProjectStatusLabel(updatedProject.status)}”。`);
    } catch (error) {
      setArchiveConfirmationOpen(false);
      setActionError(getUserFacingError(error));
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function handleDeleteProject(): Promise<void> {
    if (projectState.status !== 'ready' || isDeleting) {
      return;
    }

    const confirmationError = validateDeleteConfirmation(
      projectState.project.name,
      deleteConfirmation,
    );

    setDeleteConfirmationError(confirmationError);

    if (confirmationError) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);

    try {
      await deleteProject(api, projectState.project.id, deleteConfirmation.trim());
      navigate('/projects');
    } catch (error) {
      setDeleteConfirmationError(getUserFacingError(error));
    } finally {
      setIsDeleting(false);
    }
  }

  if (projectState.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="项目设置" description="维护项目信息和生命周期状态。" />
        <LoadingState label="正在加载项目设置" />
      </div>
    );
  }

  if (projectState.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="项目设置" description="维护项目信息和生命周期状态。" />
        <ErrorState
          actionLabel="重试"
          message={projectState.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="项目设置加载失败"
        />
      </div>
    );
  }

  const project = projectState.project;

  if (!canManageProject(project.accessRole)) {
    return (
      <div className="page-stack">
        <PageHeader title="项目设置" description="维护项目信息和生命周期状态。" />
        <section className="panel panel--large read-only-panel">
          <span className="tag">{getProjectRoleLabel(project.accessRole)}</span>
          <h2>当前角色只能查看项目</h2>
          <p>项目信息、成员和权限只能由项目负责人或平台管理员维护。</p>
          <Link className="secondary-link" to={buildProjectPath(project.id, 'overview')}>
            返回项目概览
          </Link>
        </section>
      </div>
    );
  }

  const archived = isProjectArchived(project.status);
  const statusTransitions = getProjectStatusTransitions(project.status);
  const hasUnsavedChanges = !archived && hasUnsavedProjectChanges(initialForm, form);

  return (
    <div className="page-stack projects-page">
      <UnsavedChangesGuard
        message="项目基本信息尚未保存，离开后修改将丢失。"
        when={hasUnsavedChanges || isSaving}
      />
      <div className="page-heading-with-action">
        <PageHeader title="项目设置" description="维护项目信息和生命周期状态。" />
        <Link className="secondary-link" to={buildProjectPath(project.id, 'overview')}>
          返回项目
        </Link>
      </div>

      {archived ? <div className="session-notice">项目已归档，仅可查看信息或删除项目。</div> : null}
      {actionError ? <ErrorNotice message={actionError} /> : null}
      {actionMessage ? <div className="success-notice">{actionMessage}</div> : null}

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>基本信息</h2>
            <p>
              {getProjectRoleLabel(project.accessRole)} · 创建于{' '}
              {formatProjectDate(project.createdAt)}
            </p>
          </div>
          <span className={`status-badge status-badge--${project.status.toLowerCase()}`}>
            {getProjectStatusLabel(project.status)}
          </span>
        </div>

        <form className="auth-form project-form" onSubmit={(event) => void handleSave(event)}>
          <label className="form-field">
            <span>项目名称</span>
            <input
              disabled={archived || isSaving}
              maxLength={100}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              value={form.name}
            />
            {formErrors.name ? <small>{formErrors.name}</small> : null}
          </label>

          <label className="form-field">
            <span>项目简介</span>
            <textarea
              disabled={archived || isSaving}
              maxLength={1000}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={4}
              value={form.description}
            />
            {formErrors.description ? <small>{formErrors.description}</small> : null}
          </label>

          <div className="project-form-grid">
            <label className="form-field">
              <span>开始日期</span>
              <input
                disabled={archived || isSaving}
                onChange={(event) =>
                  setForm((current) => ({ ...current, startDate: event.target.value }))
                }
                type="date"
                value={form.startDate}
              />
              {formErrors.startDate ? <small>{formErrors.startDate}</small> : null}
            </label>

            <label className="form-field">
              <span>结束日期</span>
              <input
                disabled={archived || isSaving}
                onChange={(event) =>
                  setForm((current) => ({ ...current, endDate: event.target.value }))
                }
                type="date"
                value={form.endDate}
              />
              {formErrors.endDate ? <small>{formErrors.endDate}</small> : null}
            </label>
          </div>

          {!archived ? (
            <div className="form-actions">
              <button
                className="primary-button"
                disabled={isSaving || !hasUnsavedChanges}
                type="submit"
              >
                {isSaving ? '正在保存...' : '保存基本信息'}
              </button>
            </div>
          ) : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>项目状态</h2>
            <p>状态只能按规划、执行、完成和归档的顺序转换。</p>
          </div>
        </div>
        {statusTransitions.length === 0 ? (
          <p className="muted-copy">当前项目没有可执行的后续状态。</p>
        ) : (
          <div className="button-row">
            {statusTransitions.map((status) => (
              <button
                className="secondary-button"
                disabled={isUpdatingStatus}
                key={status}
                onClick={() => {
                  if (status === 'ARCHIVED') {
                    setArchiveConfirmationOpen(true);
                    return;
                  }

                  void applyStatus(status);
                }}
                type="button"
              >
                {status === 'PAUSED'
                  ? '暂停项目'
                  : status === 'COMPLETED'
                    ? '标记为已完成'
                    : status === 'ARCHIVED'
                      ? '归档项目'
                      : '恢复为进行中'}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel danger-zone">
        <div className="panel__header">
          <div>
            <h2>删除项目</h2>
            <p>删除后项目及其关联数据将不可恢复，必须输入完整项目名称确认。</p>
          </div>
        </div>
        <button
          className="danger-button"
          onClick={() => {
            setDeleteConfirmation('');
            setDeleteConfirmationError(null);
            setDeleteDialogOpen(true);
          }}
          type="button"
        >
          删除项目
        </button>
      </section>

      {archiveConfirmationOpen ? (
        <ConfirmDialog
          confirmLabel="确认归档"
          isPending={isUpdatingStatus}
          message="归档后项目进入只读状态，不能再修改项目信息或成员。"
          onCancel={() => setArchiveConfirmationOpen(false)}
          onConfirm={() => void applyStatus('ARCHIVED')}
          title="归档项目"
          tone="danger"
        />
      ) : null}

      {deleteDialogOpen ? (
        <div className="confirm-backdrop">
          <section
            aria-labelledby="delete-project-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <h2 id="delete-project-title">删除项目</h2>
            <p>
              请输入项目名称 <strong>{project.name}</strong> 以确认删除。此操作不可恢复。
            </p>
            <label className="form-field confirm-dialog__field">
              <span>项目名称</span>
              <input
                autoFocus
                disabled={isDeleting}
                maxLength={100}
                onChange={(event) => {
                  setDeleteConfirmation(event.target.value);
                  setDeleteConfirmationError(null);
                }}
                value={deleteConfirmation}
              />
              {deleteConfirmationError ? <small>{deleteConfirmationError}</small> : null}
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="secondary-button"
                disabled={isDeleting}
                onClick={() => setDeleteDialogOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="danger-button"
                disabled={isDeleting}
                onClick={() => void handleDeleteProject()}
                type="button"
              >
                {isDeleting ? '正在删除...' : '确认删除'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
