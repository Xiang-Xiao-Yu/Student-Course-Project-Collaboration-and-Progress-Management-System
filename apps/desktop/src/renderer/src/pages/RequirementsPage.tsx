import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { buildProjectPath, buildRequirementPath } from '../app/navigation';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type { ProjectDto } from '../features/projects/project-api';
import { getProject } from '../features/projects/project-api';
import {
  canCreateProjectContent,
  canEditProjectContent,
  getProjectRoleLabel,
} from '../features/projects/project-presentation';
import type { RequirementDto } from '../features/requirements/requirement-api';
import { createRequirement, listRequirements } from '../features/requirements/requirement-api';
import {
  getRequirementPriorityLabel,
  getRequirementStatusLabel,
  getRequirementTaskProgress,
} from '../features/requirements/requirement-presentation';
import type {
  RequirementFormErrors,
  RequirementFormValues,
} from '../features/requirements/requirement-validation';
import {
  hasRequirementFormErrors,
  validateRequirementForm,
} from '../features/requirements/requirement-validation';
import { getUserFacingError } from '../lib/api/errors';

const EMPTY_REQUIREMENT_FORM: RequirementFormValues = {
  acceptanceCriteria: '',
  description: '',
  priority: 'MEDIUM',
  status: 'DRAFT',
  title: '',
};

type RequirementsPageState =
  | { readonly status: 'loading' }
  | {
      readonly project: ProjectDto;
      readonly requirements: RequirementDto[];
      readonly status: 'ready';
    }
  | { readonly message: string; readonly status: 'error' };

export function RequirementsPage() {
  const { api } = useSession();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [createErrors, setCreateErrors] = useState<RequirementFormErrors>({});
  const [createForm, setCreateForm] = useState<RequirementFormValues>(EMPTY_REQUIREMENT_FORM);
  const [createMessage, setCreateMessage] = useState<{
    readonly text: string;
    readonly type: 'error' | 'success';
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<RequirementsPageState>({ status: 'loading' });

  useEffect(() => {
    if (!projectId) {
      setState({ message: '没有可加载的项目。', status: 'error' });
      return;
    }

    let isCancelled = false;

    setState({ status: 'loading' });
    void Promise.all([getProject(api, projectId), listRequirements(api, projectId)])
      .then(([project, requirements]) => {
        if (!isCancelled) {
          setState({ project, requirements, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({ message: getUserFacingError(error), status: 'error' });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api, projectId, retryVersion]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || isCreating) {
      return;
    }

    const nextErrors = validateRequirementForm(createForm);

    setCreateErrors(nextErrors);
    setCreateMessage(null);

    if (hasRequirementFormErrors(nextErrors)) {
      return;
    }

    setIsCreating(true);

    try {
      const requirement = await createRequirement(api, state.project.id, {
        acceptanceCriteria: createForm.acceptanceCriteria.trim(),
        ...(createForm.description.trim() ? { description: createForm.description.trim() } : {}),
        priority: createForm.priority,
        title: createForm.title.trim(),
      });

      setState({
        ...state,
        requirements: [...state.requirements, requirement],
      });
      setCreateForm(EMPTY_REQUIREMENT_FORM);
      setCreateMessage({
        text: `需求 ${requirement.number} 已创建。`,
        type: 'success',
      });
    } catch (error) {
      setCreateMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsCreating(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="需求管理" description="整理需求、验收标准和关联任务。" />
        <LoadingState label="正在加载需求列表" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="需求管理" description="整理需求、验收标准和关联任务。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="需求列表加载失败"
        />
      </div>
    );
  }

  const canCreate = canCreateProjectContent(state.project.accessRole, state.project.status);
  const canEdit = canEditProjectContent(state.project.accessRole, state.project.status);
  const hasCreateDraft =
    createForm.title.length > 0 ||
    createForm.description.length > 0 ||
    createForm.acceptanceCriteria.length > 0;

  return (
    <div className="page-stack p3-page">
      <UnsavedChangesGuard
        message="新需求尚未保存，离开后填写内容将丢失。"
        when={canCreate && hasCreateDraft && !isCreating}
      />
      <div className="page-heading-with-action">
        <PageHeader title="需求管理" description="整理需求、验收标准和关联任务。" />
        <Link className="secondary-link" to={buildProjectPath(state.project.id, 'board')}>
          查看任务看板
        </Link>
      </div>

      <div className="read-only-inline">
        当前角色：{getProjectRoleLabel(state.project.accessRole)}
        {!canCreate ? ' · 当前项目状态或角色不可新增需求' : ''}
      </div>
      {createMessage?.type === 'error' ? <ErrorNotice message={createMessage.text} /> : null}
      {createMessage?.type === 'success' ? (
        <div className="success-notice">{createMessage.text}</div>
      ) : null}

      {canCreate ? (
        <section className="panel requirement-create-panel">
          <div className="panel__header">
            <div>
              <h2>创建需求</h2>
              <p>新需求保存为草稿，并自动获得项目内唯一编号。</p>
            </div>
          </div>
          <form
            className="auth-form requirement-form"
            onSubmit={(event) => void handleCreate(event)}
          >
            <label className="form-field">
              <span>需求标题</span>
              <input
                disabled={isCreating}
                maxLength={100}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="例如：支持需求与任务关联"
                value={createForm.title}
              />
              {createErrors.title ? <small>{createErrors.title}</small> : null}
            </label>

            <label className="form-field">
              <span>需求描述</span>
              <textarea
                disabled={isCreating}
                maxLength={5000}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                value={createForm.description}
              />
              {createErrors.description ? <small>{createErrors.description}</small> : null}
            </label>

            <label className="form-field">
              <span>验收标准</span>
              <textarea
                disabled={isCreating}
                maxLength={5000}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    acceptanceCriteria: event.target.value,
                  }))
                }
                placeholder="填写可检查、可验证的完成条件"
                rows={4}
                value={createForm.acceptanceCriteria}
              />
              {createErrors.acceptanceCriteria ? (
                <small>{createErrors.acceptanceCriteria}</small>
              ) : null}
            </label>

            <label className="form-field requirement-priority-field">
              <span>优先级</span>
              <select
                disabled={isCreating}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    priority:
                      event.target.value === 'HIGH'
                        ? 'HIGH'
                        : event.target.value === 'LOW'
                          ? 'LOW'
                          : 'MEDIUM',
                  }))
                }
                value={createForm.priority}
              >
                <option value="HIGH">高</option>
                <option value="MEDIUM">中</option>
                <option value="LOW">低</option>
              </select>
              {createErrors.priority ? <small>{createErrors.priority}</small> : null}
            </label>

            <div className="form-actions">
              <button className="primary-button" disabled={isCreating} type="submit">
                {isCreating ? '正在创建...' : '创建需求'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="requirement-list-section" aria-labelledby="requirement-list-title">
        <div className="section-heading">
          <div>
            <h2 id="requirement-list-title">需求列表</h2>
            <p>共 {state.requirements.length} 条需求</p>
          </div>
        </div>

        {state.requirements.length === 0 ? (
          <section className="panel panel--large">
            <EmptyState
              description="创建需求并填写验收标准后，可在详情中关联任务。"
              title="暂无需求"
            />
          </section>
        ) : (
          <div className="requirement-list">
            {state.requirements.map((requirement) => (
              <article className="requirement-row" key={requirement.id}>
                <div className="requirement-row__identity">
                  <span className="requirement-number">{requirement.number}</span>
                  <div>
                    <strong>{requirement.title}</strong>
                    <span>{requirement.description || '暂未填写需求描述。'}</span>
                  </div>
                </div>
                <div className="requirement-row__meta">
                  <span
                    className={`priority-badge priority-badge--${requirement.priority.toLowerCase()}`}
                  >
                    {getRequirementPriorityLabel(requirement.priority)}
                  </span>
                  <span
                    className={`requirement-status requirement-status--${requirement.status.toLowerCase()}`}
                  >
                    {getRequirementStatusLabel(requirement.status)}
                  </span>
                  <span>{getRequirementTaskProgress(requirement.tasks)}</span>
                </div>
                <Link
                  className={canEdit ? 'primary-link' : 'secondary-link'}
                  to={buildRequirementPath(state.project.id, requirement.id)}
                >
                  {canEdit ? '查看与编辑' : '查看详情'}
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
