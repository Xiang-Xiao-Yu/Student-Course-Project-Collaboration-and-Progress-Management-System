import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { buildProjectPath } from '../app/navigation';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import type { ProjectDto, ProjectInput } from '../features/projects/project-api';
import { createProject, listProjects } from '../features/projects/project-api';
import {
  canManageProject,
  formatProjectDate,
  getProjectRoleLabel,
  getProjectStatusLabel,
} from '../features/projects/project-presentation';
import type { ProjectFormErrors, ProjectFormValues } from '../features/projects/project-validation';
import { hasProjectFormErrors, validateProjectForm } from '../features/projects/project-validation';
import { useSession } from '../features/auth/session';
import { getUserFacingError } from '../lib/api/errors';

const EMPTY_PROJECT_FORM: ProjectFormValues = {
  description: '',
  endDate: '',
  name: '',
  startDate: '',
};

type ProjectsState =
  | { readonly status: 'loading' }
  | { readonly projects: ProjectDto[]; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

function toProjectInput(values: ProjectFormValues): ProjectInput {
  return {
    description: values.description.trim(),
    ...(values.endDate ? { endDate: values.endDate } : {}),
    name: values.name.trim(),
    ...(values.startDate ? { startDate: values.startDate } : {}),
  };
}

export function ProjectsPage() {
  const { api } = useSession();
  const navigate = useNavigate();
  const [createErrors, setCreateErrors] = useState<ProjectFormErrors>({});
  const [createForm, setCreateForm] = useState<ProjectFormValues>(EMPTY_PROJECT_FORM);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [projectsState, setProjectsState] = useState<ProjectsState>({ status: 'loading' });
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    setProjectsState({ status: 'loading' });
    void listProjects(api)
      .then((projects) => {
        if (!isCancelled) {
          setProjectsState({ projects, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setProjectsState({
            message: getUserFacingError(error),
            status: 'error',
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api, retryVersion]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateProjectForm(createForm);

    setCreateErrors(nextErrors);
    setCreateMessage(null);

    if (hasProjectFormErrors(nextErrors)) {
      return;
    }

    setIsCreating(true);

    try {
      const project = await createProject(api, toProjectInput(createForm));

      setCreateForm(EMPTY_PROJECT_FORM);
      navigate(buildProjectPath(project.id, 'overview'));
    } catch (error) {
      setCreateMessage(getUserFacingError(error));
    } finally {
      setIsCreating(false);
    }
  }

  const hasCreateDraft =
    createForm.name.length > 0 ||
    createForm.description.length > 0 ||
    createForm.startDate.length > 0 ||
    createForm.endDate.length > 0;

  return (
    <div className="page-stack projects-page">
      <UnsavedChangesGuard
        message="新项目信息尚未保存，离开后填写内容将丢失。"
        when={hasCreateDraft && !isCreating}
      />
      <PageHeader title="项目中心" description="选择工作区，或创建一个新的课程项目。" />

      <section className="panel project-create-panel">
        <div className="panel__header">
          <div>
            <h2>创建项目</h2>
            <p>新项目默认进入规划中状态。</p>
          </div>
        </div>

        {createMessage ? <ErrorNotice message={createMessage} /> : null}

        <form
          className="auth-form project-form"
          onSubmit={(event) => void handleCreateProject(event)}
        >
          <label className="form-field">
            <span>项目名称</span>
            <input
              disabled={isCreating}
              maxLength={100}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="例如：软件工程课程设计"
              value={createForm.name}
            />
            {createErrors.name ? <small>{createErrors.name}</small> : null}
          </label>

          <label className="form-field">
            <span>项目简介</span>
            <textarea
              disabled={isCreating}
              maxLength={1000}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="简要说明项目目标和协作范围"
              rows={3}
              value={createForm.description}
            />
            {createErrors.description ? <small>{createErrors.description}</small> : null}
          </label>

          <div className="project-form-grid">
            <label className="form-field">
              <span>开始日期</span>
              <input
                disabled={isCreating}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, startDate: event.target.value }))
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
              {isCreating ? '正在创建...' : '创建并进入项目'}
            </button>
          </div>
        </form>
      </section>

      <section className="project-list-section" aria-labelledby="project-list-title">
        <div className="section-heading">
          <div>
            <h2 id="project-list-title">我的项目</h2>
            <p>这里只显示当前账号已加入的项目。</p>
          </div>
          {projectsState.status === 'ready' ? (
            <span className="count-badge">{projectsState.projects.length} 个项目</span>
          ) : null}
        </div>

        {projectsState.status === 'loading' ? (
          <LoadingState label="正在加载项目列表" />
        ) : projectsState.status === 'error' ? (
          <ErrorState
            actionLabel="重试"
            message={projectsState.message}
            onAction={() => setRetryVersion((version) => version + 1)}
            title="项目列表加载失败"
          />
        ) : projectsState.projects.length === 0 ? (
          <section className="panel panel--large">
            <EmptyState
              description="创建第一个项目后，即可进入需求、任务和成员工作区。"
              title="暂无项目"
            />
          </section>
        ) : (
          <div className="project-grid">
            {projectsState.projects.map((project) => (
              <article className="project-card" key={project.id}>
                <div className="project-card__header">
                  <div>
                    <span className={`status-badge status-badge--${project.status.toLowerCase()}`}>
                      {getProjectStatusLabel(project.status)}
                    </span>
                    <h3>{project.name}</h3>
                  </div>
                  <span className="role-badge">{getProjectRoleLabel(project.accessRole)}</span>
                </div>
                <p className="project-card__description">
                  {project.description || '暂未填写项目简介。'}
                </p>
                <dl className="project-card__meta">
                  <div>
                    <dt>开始</dt>
                    <dd>{formatProjectDate(project.startDate)}</dd>
                  </div>
                  <div>
                    <dt>结束</dt>
                    <dd>{formatProjectDate(project.endDate)}</dd>
                  </div>
                </dl>
                <div className="project-card__actions">
                  <Link className="primary-link" to={buildProjectPath(project.id, 'overview')}>
                    进入项目
                  </Link>
                  {canManageProject(project.accessRole) ? (
                    <Link className="secondary-link" to={buildProjectPath(project.id, 'settings')}>
                      项目设置
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
