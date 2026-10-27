import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { buildProjectPath } from '../app/navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type { ProjectDto, ProjectMemberDto } from '../features/projects/project-api';
import { getProject, listProjectMembers } from '../features/projects/project-api';
import {
  canCreateProjectContent,
  canDeleteProjectContent,
  canEditProjectContent,
  formatProjectDate,
  getProjectRoleLabel,
} from '../features/projects/project-presentation';
import type { RequirementDto } from '../features/requirements/requirement-api';
import { listRequirements } from '../features/requirements/requirement-api';
import type { TaskDto } from '../features/tasks/task-api';
import { createTask, deleteTask, listTasks, updateTask } from '../features/tasks/task-api';
import { TaskFormFields } from '../features/tasks/TaskFormFields';
import {
  getTaskPriorityLabel,
  getTaskStatusLabel,
  taskStatusColumns,
} from '../features/tasks/task-presentation';
import type { TaskFormErrors, TaskFormValues } from '../features/tasks/task-validation';
import {
  formToCreateTaskInput,
  formToUpdateTaskInput,
  hasTaskFormErrors,
  hasUnsavedTaskChanges,
  taskToForm,
  validateTaskForm,
} from '../features/tasks/task-validation';
import { getUserFacingError } from '../lib/api/errors';

const EMPTY_TASK_FORM: TaskFormValues = {
  assigneeId: '',
  description: '',
  dueDate: '',
  estimatedHours: '',
  priority: 'MEDIUM',
  requirementId: '',
  tagNames: '',
  title: '',
};

interface BoardData {
  readonly members: ProjectMemberDto[];
  readonly project: ProjectDto;
  readonly requirements: RequirementDto[];
  readonly tasks: TaskDto[];
}

type BoardState =
  | { readonly status: 'loading' }
  | { readonly data: BoardData; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

export function BoardPage() {
  const { api } = useSession();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [createErrors, setCreateErrors] = useState<TaskFormErrors>({});
  const [createForm, setCreateForm] = useState<TaskFormValues>(EMPTY_TASK_FORM);
  const [createMessage, setCreateMessage] = useState<{
    readonly text: string;
    readonly type: 'error' | 'success';
  } | null>(null);
  const [editErrors, setEditErrors] = useState<TaskFormErrors>({});
  const [editForm, setEditForm] = useState<TaskFormValues>(EMPTY_TASK_FORM);
  const [editInitialForm, setEditInitialForm] = useState<TaskFormValues>(EMPTY_TASK_FORM);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<BoardState>({ status: 'loading' });
  const [taskToDelete, setTaskToDelete] = useState<TaskDto | null>(null);

  useEffect(() => {
    if (!projectId) {
      setState({ message: '没有可加载的项目。', status: 'error' });
      return;
    }

    let isCancelled = false;

    setState({ status: 'loading' });
    void Promise.all([
      getProject(api, projectId),
      listProjectMembers(api, projectId),
      listRequirements(api, projectId),
      listTasks(api, projectId),
    ])
      .then(([project, members, requirements, tasks]) => {
        if (!isCancelled) {
          setState({
            data: { members, project, requirements, tasks },
            status: 'ready',
          });
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

    const nextErrors = validateTaskForm(createForm);

    setCreateErrors(nextErrors);
    setCreateMessage(null);

    if (hasTaskFormErrors(nextErrors)) {
      return;
    }

    setIsCreating(true);

    try {
      const task = await createTask(api, state.data.project.id, formToCreateTaskInput(createForm));

      setState({
        data: { ...state.data, tasks: [...state.data.tasks, task] },
        status: 'ready',
      });
      setCreateForm(EMPTY_TASK_FORM);
      setCreateMessage({ text: '任务已创建。', type: 'success' });
    } catch (error) {
      setCreateMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsCreating(false);
    }
  }

  function openTaskEditor(task: TaskDto): void {
    const form = taskToForm(task);

    setEditingTask(task);
    setEditForm(form);
    setEditInitialForm(form);
    setEditErrors({});
    setEditMessage(null);
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || !editingTask || isSavingEdit) {
      return;
    }

    const nextErrors = { ...validateTaskForm(editForm) };

    if (editingTask.assigneeId && !editForm.assigneeId) {
      nextErrors.assigneeId = '当前接口不支持清除已设置的负责人，请重新选择成员。';
    }

    if (editingTask.requirementId && !editForm.requirementId) {
      nextErrors.requirementId = '当前接口不支持移除已关联需求，请重新选择需求。';
    }

    if (editingTask.dueDate && !editForm.dueDate) {
      nextErrors.dueDate = '当前接口不支持清除截止日期，请填写新日期。';
    }

    if (editingTask.estimatedHours !== null && !editForm.estimatedHours) {
      nextErrors.estimatedHours = '当前接口不支持清除预估工时，请填写新数值。';
    }

    setEditErrors(nextErrors);
    setEditMessage(null);

    if (hasTaskFormErrors(nextErrors)) {
      return;
    }

    setIsSavingEdit(true);

    try {
      const task = await updateTask(
        api,
        state.data.project.id,
        editingTask.id,
        formToUpdateTaskInput(editForm),
      );

      setState({
        data: {
          ...state.data,
          tasks: state.data.tasks.map((item) => (item.id === task.id ? task : item)),
        },
        status: 'ready',
      });
      setEditingTask(null);
      setCreateMessage({ text: '任务信息已更新。', type: 'success' });
    } catch (error) {
      setEditMessage(getUserFacingError(error));
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteTask(): Promise<void> {
    if (state.status !== 'ready' || !taskToDelete || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setEditMessage(null);

    try {
      await deleteTask(api, state.data.project.id, taskToDelete.id);
      setState({
        data: {
          ...state.data,
          tasks: state.data.tasks.filter((task) => task.id !== taskToDelete.id),
        },
        status: 'ready',
      });
      setEditingTask(null);
      setTaskToDelete(null);
      setCreateMessage({ text: '任务已删除。', type: 'success' });
    } catch (error) {
      setTaskToDelete(null);
      setEditMessage(getUserFacingError(error));
    } finally {
      setIsDeleting(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="任务看板" description="按状态跟踪任务流转和负责人。" />
        <LoadingState label="正在加载任务看板" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="任务看板" description="按状态跟踪任务流转和负责人。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="任务看板加载失败"
        />
      </div>
    );
  }

  const { members, project, requirements, tasks } = state.data;
  const canCreate = canCreateProjectContent(project.accessRole, project.status);
  const canEdit = canEditProjectContent(project.accessRole, project.status);
  const canDelete = canDeleteProjectContent(project.accessRole, project.status);
  const hasCreateDraft = hasUnsavedTaskChanges(EMPTY_TASK_FORM, createForm);
  const hasEditDraft = editingTask !== null && hasUnsavedTaskChanges(editInitialForm, editForm);
  const memberNames = new Map(members.map((member) => [member.userId, member.nickname]));
  const requirementNumbers = new Map(
    requirements.map((requirement) => [requirement.id, requirement.number]),
  );

  return (
    <div className="page-stack p3-page">
      <UnsavedChangesGuard
        message="新任务尚未保存，离开后填写内容将丢失。"
        when={(canCreate && hasCreateDraft && !isCreating) || hasEditDraft || isSavingEdit}
      />
      <div className="page-heading-with-action">
        <PageHeader title="任务看板" description="按状态跟踪任务流转和负责人。" />
        <Link className="secondary-link" to={buildProjectPath(project.id, 'requirements')}>
          查看需求管理
        </Link>
      </div>

      <div className="read-only-inline">
        当前角色：{getProjectRoleLabel(project.accessRole)}
        {!canCreate ? ' · 当前项目状态或角色不可新增任务' : ''}
      </div>
      {createMessage?.type === 'error' ? <ErrorNotice message={createMessage.text} /> : null}
      {createMessage?.type === 'success' ? (
        <div className="success-notice">{createMessage.text}</div>
      ) : null}

      {canCreate ? (
        <section className="panel task-create-panel">
          <div className="panel__header">
            <div>
              <h2>创建任务</h2>
              <p>新任务默认进入待规划，可在看板中逐步推进。</p>
            </div>
          </div>
          <form className="auth-form task-form" onSubmit={(event) => void handleCreate(event)}>
            <TaskFormFields
              disabled={isCreating}
              errors={createErrors}
              members={members}
              onChange={setCreateForm}
              requirements={requirements}
              values={createForm}
            />
            <div className="form-actions">
              <button className="primary-button" disabled={isCreating} type="submit">
                {isCreating ? '正在创建...' : '创建任务'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="task-board" aria-label="任务看板">
        {taskStatusColumns.map((status) => {
          const columnTasks = tasks.filter((task) => task.status === status);

          return (
            <section className={`board-column board-column--${status.toLowerCase()}`} key={status}>
              <header className="board-column__header">
                <h2>{getTaskStatusLabel(status)}</h2>
                <span>{columnTasks.length}</span>
              </header>
              <div className="board-column__body">
                {columnTasks.length === 0 ? (
                  <div className="board-column__empty">暂无任务</div>
                ) : (
                  columnTasks.map((task) => (
                    <article className="task-card" key={task.id}>
                      <div className="task-card__topline">
                        <span
                          className={`priority-badge priority-badge--${task.priority.toLowerCase()}`}
                        >
                          {getTaskPriorityLabel(task.priority)}
                        </span>
                        {task.requirementId ? (
                          <span className="task-requirement">
                            {requirementNumbers.get(task.requirementId) ?? '关联需求'}
                          </span>
                        ) : null}
                      </div>
                      <h3>{task.title}</h3>
                      <p>{task.description || '暂未填写任务描述。'}</p>
                      <dl className="task-card__meta">
                        <div>
                          <dt>负责人</dt>
                          <dd>
                            {task.assigneeId
                              ? (memberNames.get(task.assigneeId) ?? '项目成员')
                              : '未分配'}
                          </dd>
                        </div>
                        <div>
                          <dt>截止日期</dt>
                          <dd>{formatProjectDate(task.dueDate)}</dd>
                        </div>
                      </dl>
                      {task.tagNames.length > 0 ? (
                        <div className="task-tags">
                          {task.tagNames.map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      ) : null}
                      {canEdit ? (
                        <button
                          className="secondary-button task-card__edit"
                          onClick={() => openTaskEditor(task)}
                          type="button"
                        >
                          编辑任务
                        </button>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </section>

      {editingTask ? (
        <div className="task-edit-backdrop">
          <section
            aria-labelledby="task-edit-title"
            aria-modal="true"
            className="task-edit-dialog"
            role="dialog"
          >
            <div className="task-edit-dialog__header">
              <div>
                <h2 id="task-edit-title">编辑任务</h2>
                <p>当前状态：{getTaskStatusLabel(editingTask.status)}</p>
              </div>
              <button
                className="secondary-button"
                disabled={isSavingEdit}
                onClick={() => setEditingTask(null)}
                type="button"
              >
                关闭
              </button>
            </div>
            {editMessage ? <ErrorNotice message={editMessage} /> : null}
            <form className="auth-form task-form" onSubmit={(event) => void handleEdit(event)}>
              <TaskFormFields
                disabled={isSavingEdit}
                errors={editErrors}
                members={members}
                onChange={setEditForm}
                requirements={requirements}
                values={editForm}
              />
              <div className="task-edit-actions">
                {canDelete ? (
                  <button
                    className="danger-text-button task-delete-button"
                    disabled={isSavingEdit}
                    onClick={() => setTaskToDelete(editingTask)}
                    type="button"
                  >
                    删除任务
                  </button>
                ) : null}
                <button
                  className="primary-button"
                  disabled={isSavingEdit || !hasUnsavedTaskChanges(editInitialForm, editForm)}
                  type="submit"
                >
                  {isSavingEdit ? '正在保存...' : '保存任务'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {taskToDelete ? (
        <ConfirmDialog
          confirmLabel="确认删除"
          isPending={isDeleting}
          message={`删除任务“${taskToDelete.title}”后不可恢复。`}
          onCancel={() => setTaskToDelete(null)}
          onConfirm={() => void handleDeleteTask()}
          title="删除任务"
          tone="danger"
        />
      ) : null}
    </div>
  );
}
