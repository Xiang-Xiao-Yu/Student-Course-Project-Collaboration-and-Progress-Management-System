import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { buildProjectPath, buildRequirementPath } from '../app/navigation';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type { ProjectDto, ProjectMemberDto } from '../features/projects/project-api';
import { getProject, listProjectMembers } from '../features/projects/project-api';
import {
  canEditProjectContent,
  canReviewProjectTasks,
  formatProjectDate,
  getProjectRoleLabel,
} from '../features/projects/project-presentation';
import type { RequirementDto } from '../features/requirements/requirement-api';
import { listRequirements } from '../features/requirements/requirement-api';
import type { TaskDto } from '../features/tasks/task-api';
import { getTask, updateTaskStatus } from '../features/tasks/task-api';
import type {
  TaskTransitionDialogMode,
  TaskTransitionValues,
} from '../features/tasks/task-status-flow';
import {
  decideTaskStatusTransition,
  validateTaskTransitionValues,
} from '../features/tasks/task-status-flow';
import { TaskStatusTransitionDialog } from '../features/tasks/TaskStatusTransitionDialog';
import {
  getTaskPriorityLabel,
  getTaskStatusActionLabel,
  getTaskStatusLabel,
  getTaskStatusTransitions,
} from '../features/tasks/task-presentation';
import { getUserFacingError } from '../lib/api/errors';

interface TaskDetailData {
  readonly members: ProjectMemberDto[];
  readonly project: ProjectDto;
  readonly requirements: RequirementDto[];
  readonly task: TaskDto;
}

type TaskDetailState =
  | { readonly status: 'loading' }
  | { readonly data: TaskDetailData; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

interface TransitionRequest {
  readonly mode: TaskTransitionDialogMode;
  readonly targetStatus: TaskDto['status'];
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '未记录';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '时间无效';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function TaskDetailPage() {
  const { api } = useSession();
  const { projectId = '', taskId = '' } = useParams<{
    projectId: string;
    taskId: string;
  }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<TaskDetailState>({ status: 'loading' });
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionRequest, setTransitionRequest] = useState<TransitionRequest | null>(null);
  const [transitionValues, setTransitionValues] = useState<TaskTransitionValues>({
    completionNote: '',
    reopenReason: '',
  });

  useEffect(() => {
    if (!projectId || !taskId) {
      setState({ message: '没有可加载的任务。', status: 'error' });
      return;
    }

    let isCancelled = false;

    setState({ status: 'loading' });
    void Promise.all([
      getProject(api, projectId),
      listProjectMembers(api, projectId),
      listRequirements(api, projectId),
      getTask(api, projectId, taskId),
    ])
      .then(([project, members, requirements, task]) => {
        if (!isCancelled) {
          setState({
            data: { members, project, requirements, task },
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
  }, [api, projectId, retryVersion, taskId]);

  async function applyTransition(
    targetStatus: TaskDto['status'],
    values: TaskTransitionValues,
  ): Promise<void> {
    if (state.status !== 'ready' || isTransitioning) {
      return;
    }

    setIsTransitioning(true);
    setActionError(null);
    setActionMessage(null);
    setTransitionError(null);

    try {
      const task = await updateTaskStatus(api, state.data.project.id, state.data.task.id, {
        status: targetStatus,
        ...(values.completionNote.trim() ? { completionNote: values.completionNote.trim() } : {}),
        ...(values.reopenReason.trim() ? { reopenReason: values.reopenReason.trim() } : {}),
      });

      setState({ data: { ...state.data, task }, status: 'ready' });
      setTransitionRequest(null);
      setTransitionValues({ completionNote: '', reopenReason: '' });
      setActionMessage(`任务已更新为“${getTaskStatusLabel(task.status)}”。`);
    } catch (error) {
      const message = getUserFacingError(error);

      if (transitionRequest) {
        setTransitionError(message);
      } else {
        setActionError(message);
      }
    } finally {
      setIsTransitioning(false);
    }
  }

  function attemptTransition(targetStatus: TaskDto['status']): void {
    if (state.status !== 'ready') {
      return;
    }

    const decision = decideTaskStatusTransition(
      state.data.task.status,
      targetStatus,
      state.data.task.completionNote,
      canReviewProjectTasks(state.data.project.accessRole),
    );

    if (decision.type === 'error') {
      setActionError(decision.message);
      return;
    }

    if (decision.type === 'direct') {
      void applyTransition(targetStatus, { completionNote: '', reopenReason: '' });
      return;
    }

    setTransitionError(null);
    setTransitionValues(
      decision.mode === 'completion'
        ? { completionNote: decision.initialValue, reopenReason: '' }
        : { completionNote: '', reopenReason: decision.initialValue },
    );
    setTransitionRequest({ mode: decision.mode, targetStatus });
  }

  function confirmTransition(): void {
    if (!transitionRequest) {
      return;
    }

    const error = validateTaskTransitionValues(transitionRequest.mode, transitionValues);

    setTransitionError(error);

    if (!error) {
      void applyTransition(transitionRequest.targetStatus, transitionValues);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="任务详情" description="查看任务属性、完成信息和状态流转。" />
        <LoadingState label="正在加载任务详情" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="任务详情" description="查看任务属性、完成信息和状态流转。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="任务详情加载失败"
        />
      </div>
    );
  }

  const { members, project, requirements, task } = state.data;
  const canEdit = canEditProjectContent(project.accessRole, project.status);
  const canReview = canReviewProjectTasks(project.accessRole);
  const assignee = task.assigneeId
    ? members.find((member) => member.userId === task.assigneeId)
    : null;
  const requirement = task.requirementId
    ? requirements.find((item) => item.id === task.requirementId)
    : null;
  const transitions = getTaskStatusTransitions(task.status).filter(
    (status) => status !== 'COMPLETED' || canReview,
  );

  return (
    <div className="page-stack p3-page">
      <div className="page-heading-with-action">
        <PageHeader title="任务详情" description="查看任务属性、完成信息和状态流转。" />
        <Link className="secondary-link" to={buildProjectPath(project.id, 'board')}>
          返回任务看板
        </Link>
      </div>

      <div className="read-only-inline">
        当前角色：{getProjectRoleLabel(project.accessRole)} · 状态：
        {getTaskStatusLabel(task.status)}
      </div>
      {actionError ? <ErrorNotice message={actionError} /> : null}
      {actionMessage ? <div className="success-notice">{actionMessage}</div> : null}

      <div className="task-detail-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>{task.title}</h2>
              <p>{task.description || '暂未填写任务描述。'}</p>
            </div>
            <span className={`priority-badge priority-badge--${task.priority.toLowerCase()}`}>
              {getTaskPriorityLabel(task.priority)}
            </span>
          </div>

          <dl className="task-detail-list">
            <div>
              <dt>负责人</dt>
              <dd>{assignee ? `${assignee.nickname} (@${assignee.username})` : '未分配'}</dd>
            </div>
            <div>
              <dt>关联需求</dt>
              <dd>
                {requirement ? (
                  <Link to={buildRequirementPath(project.id, requirement.id)}>
                    {requirement.number} · {requirement.title}
                  </Link>
                ) : (
                  '未关联需求'
                )}
              </dd>
            </div>
            <div>
              <dt>截止日期</dt>
              <dd>{formatProjectDate(task.dueDate)}</dd>
            </div>
            <div>
              <dt>预估工时</dt>
              <dd>{task.estimatedHours === null ? '未填写' : `${task.estimatedHours} 小时`}</dd>
            </div>
            <div>
              <dt>创建时间</dt>
              <dd>{formatDateTime(task.createdAt)}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{formatDateTime(task.updatedAt)}</dd>
            </div>
          </dl>

          {task.tagNames.length > 0 ? (
            <div className="task-tags task-detail-tags">
              {task.tagNames.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
        </section>

        <div className="task-detail-side">
          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>完成信息</h2>
                <p>提交审核和审核完成时保存的说明。</p>
              </div>
            </div>
            <div className="completion-note">{task.completionNote || '暂未填写完成说明。'}</div>
            <dl className="task-detail-list task-detail-list--compact">
              <div>
                <dt>完成时间</dt>
                <dd>{formatDateTime(task.completedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>状态操作</h2>
                <p>所有操作按后端合法状态流提交。</p>
              </div>
            </div>
            {!canEdit ? (
              <div className="read-only-inline">当前角色或项目状态只能查看任务。</div>
            ) : transitions.length === 0 ? (
              <div className="linked-task-empty">当前状态没有后续操作。</div>
            ) : (
              <div className="button-row">
                {transitions.map((status) => (
                  <button
                    className="secondary-button"
                    disabled={isTransitioning}
                    key={status}
                    onClick={() => attemptTransition(status as TaskDto['status'])}
                    type="button"
                  >
                    {getTaskStatusActionLabel(task.status, status)}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {transitionRequest ? (
        <TaskStatusTransitionDialog
          error={transitionError}
          isPending={isTransitioning}
          mode={transitionRequest.mode}
          onCancel={() => {
            setTransitionRequest(null);
            setTransitionError(null);
          }}
          onChange={setTransitionValues}
          onConfirm={confirmTransition}
          targetStatusLabel={getTaskStatusLabel(transitionRequest.targetStatus)}
          taskTitle={task.title}
          values={transitionValues}
        />
      ) : null}
    </div>
  );
}
