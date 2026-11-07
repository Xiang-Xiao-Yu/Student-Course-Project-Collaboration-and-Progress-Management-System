import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { buildProjectPath, buildRequirementPath } from '../app/navigation';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { UnsavedChangesGuard } from '../components/feedback/UnsavedChangesGuard';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type { CommentDto } from '../features/comments/comment-api';
import { listComments } from '../features/comments/comment-api';
import { CommentPanel } from '../features/comments/CommentPanel';
import type { ProjectDto, ProjectMemberDto } from '../features/projects/project-api';
import { getProject, listProjectMembers } from '../features/projects/project-api';
import {
  canEditProjectContent,
  canReviewProjectTasks,
  getProjectRoleLabel,
} from '../features/projects/project-presentation';
import type { RequirementDto } from '../features/requirements/requirement-api';
import { listRequirements } from '../features/requirements/requirement-api';
import type { TaskDto } from '../features/tasks/task-api';
import { getTask, updateTaskStatus } from '../features/tasks/task-api';
import type { TaskActivityDto } from '../features/tasks/task-history-api';
import {
  listTaskActivity,
  resolveTaskActivityPage,
  TASK_ACTIVITY_PAGE_SIZE,
} from '../features/tasks/task-history-api';
import {
  getTaskActivityDetail,
  getTaskActivityLabel,
} from '../features/tasks/task-history-presentation';
import {
  isTaskPageRequestCurrent,
  type TaskPageRequest,
} from '../features/tasks/task-page-request';
import { canEditTaskDetails } from '../features/tasks/task-permissions';
import type {
  TaskTransitionDialogMode,
  TaskTransitionValues,
} from '../features/tasks/task-status-flow';
import {
  canRejectPendingTask,
  decideTaskStatusTransition,
  validateTaskTransitionValues,
} from '../features/tasks/task-status-flow';
import { TaskStatusTransitionDialog } from '../features/tasks/TaskStatusTransitionDialog';
import {
  getTaskPriorityLabel,
  formatTaskDueDate,
  getTaskStatusActionLabel,
  getTaskStatusLabel,
  getTaskStatusTransitions,
} from '../features/tasks/task-presentation';
import { getUserFacingError } from '../lib/api/errors';

interface TaskDetailData {
  readonly activities: TaskActivityDto[];
  readonly activityHasMore: boolean;
  readonly comments: CommentDto[];
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

const EMPTY_TRANSITION_VALUES: TaskTransitionValues = {
  completionNote: '',
  rejectionReason: '',
  reopenReason: '',
};

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
  const { api, session } = useSession();
  const { projectId = '', taskId = '' } = useParams<{
    projectId: string;
    taskId: string;
  }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [commentDirty, setCommentDirty] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoadingMoreActivities, setIsLoadingMoreActivities] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<TaskDetailState>({ status: 'loading' });
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionRequest, setTransitionRequest] = useState<TransitionRequest | null>(null);
  const [transitionValues, setTransitionValues] =
    useState<TaskTransitionValues>(EMPTY_TRANSITION_VALUES);
  const activeProjectIdRef = useRef(projectId);
  const activeTaskIdRef = useRef(taskId);
  const pageRequestVersionRef = useRef(0);
  const transitionRequestVersionRef = useRef(0);

  activeProjectIdRef.current = projectId;
  activeTaskIdRef.current = taskId;

  const isCurrentPageRequest = useCallback((request: TaskPageRequest): boolean => {
    return isTaskPageRequestCurrent(request, {
      projectId: activeProjectIdRef.current,
      taskId: activeTaskIdRef.current,
      version: pageRequestVersionRef.current,
    });
  }, []);

  useEffect(() => {
    transitionRequestVersionRef.current += 1;
    setIsTransitioning(false);
    setIsLoadingMoreActivities(false);
    setActionError(null);
    setActionMessage(null);
    setTransitionError(null);
    setTransitionRequest(null);
    setTransitionValues(EMPTY_TRANSITION_VALUES);

    if (!projectId || !taskId) {
      setState({ message: '没有可加载的任务。', status: 'error' });
      return;
    }

    let isCancelled = false;
    const request: TaskPageRequest = {
      projectId,
      taskId,
      version: ++pageRequestVersionRef.current,
    };

    setState({ status: 'loading' });
    void Promise.all([
      getProject(api, projectId),
      listProjectMembers(api, projectId),
      listRequirements(api, projectId),
      getTask(api, projectId, taskId),
      listComments(api, projectId, 'TASK', taskId),
      listTaskActivity(api, projectId, taskId, {
        limit: TASK_ACTIVITY_PAGE_SIZE,
      }),
    ])
      .then(([project, members, requirements, task, comments, activities]) => {
        if (!isCancelled && isCurrentPageRequest(request)) {
          setState({
            data: {
              activities,
              activityHasMore: activities.length === TASK_ACTIVITY_PAGE_SIZE,
              comments,
              members,
              project,
              requirements,
              task,
            },
            status: 'ready',
          });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled && isCurrentPageRequest(request)) {
          setState({ message: getUserFacingError(error), status: 'error' });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api, isCurrentPageRequest, projectId, retryVersion, taskId]);

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
    const transitionVersion = ++transitionRequestVersionRef.current;
    const request: TaskPageRequest = {
      projectId: state.data.project.id,
      taskId: state.data.task.id,
      version: pageRequestVersionRef.current,
    };

    try {
      const task = await updateTaskStatus(api, request.projectId, request.taskId, {
        status: targetStatus,
        ...(values.completionNote.trim() ? { completionNote: values.completionNote.trim() } : {}),
        ...(values.rejectionReason.trim()
          ? { rejectionReason: values.rejectionReason.trim() }
          : {}),
        ...(values.reopenReason.trim() ? { reopenReason: values.reopenReason.trim() } : {}),
      });

      if (!isCurrentPageRequest(request)) {
        return;
      }

      const activities = await listTaskActivity(api, request.projectId, request.taskId, {
        limit: TASK_ACTIVITY_PAGE_SIZE,
      }).catch(() => null);

      setState((current) => {
        if (
          current.status !== 'ready' ||
          current.data.project.id !== request.projectId ||
          current.data.task.id !== request.taskId ||
          !isCurrentPageRequest(request)
        ) {
          return current;
        }

        if (!activities) {
          return { data: { ...current.data, task }, status: 'ready' };
        }

        const resolution = resolveTaskActivityPage(
          current.data.activities,
          activities,
          request.version,
          pageRequestVersionRef.current,
        );

        if (!resolution.applied) {
          return { data: { ...current.data, task }, status: 'ready' };
        }

        return {
          data: {
            ...current.data,
            activities: resolution.activities,
            activityHasMore: resolution.hasMore,
            task,
          },
          status: 'ready',
        };
      });

      if (!isCurrentPageRequest(request)) {
        return;
      }

      setTransitionRequest(null);
      setTransitionValues(EMPTY_TRANSITION_VALUES);
      setActionMessage(
        values.rejectionReason.trim()
          ? '审核不通过原因已记录。'
          : `任务已更新为“${getTaskStatusLabel(task.status)}”。`,
      );
    } catch (error) {
      if (!isCurrentPageRequest(request)) {
        return;
      }

      const message = getUserFacingError(error);

      if (transitionRequest) {
        setTransitionError(message);
      } else {
        setActionError(message);
      }
    } finally {
      if (transitionRequestVersionRef.current === transitionVersion) {
        setIsTransitioning(false);
      }
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
      state.data.task.rejectionReason,
    );

    if (decision.type === 'error') {
      setActionError(decision.message);
      return;
    }

    if (decision.type === 'direct') {
      void applyTransition(targetStatus, {
        completionNote: '',
        rejectionReason: '',
        reopenReason: '',
      });
      return;
    }

    setTransitionError(null);
    setTransitionValues(
      decision.mode === 'completion'
        ? { completionNote: decision.initialValue, rejectionReason: '', reopenReason: '' }
        : { completionNote: '', rejectionReason: '', reopenReason: decision.initialValue },
    );
    setTransitionRequest({ mode: decision.mode, targetStatus });
  }

  function attemptRejectTask(): void {
    if (state.status !== 'ready') {
      return;
    }

    setTransitionError(null);
    setTransitionValues({ completionNote: '', rejectionReason: '', reopenReason: '' });
    setTransitionRequest({ mode: 'rejection', targetStatus: 'PENDING_REVIEW' });
  }

  async function loadMoreActivities(): Promise<void> {
    if (
      state.status !== 'ready' ||
      !state.data.activityHasMore ||
      isLoadingMoreActivities ||
      isTransitioning
    ) {
      return;
    }

    const cursor = state.data.activities.at(-1)?.id;

    if (!cursor) {
      setState((current) =>
        current.status === 'ready'
          ? {
              data: { ...current.data, activityHasMore: false },
              status: 'ready',
            }
          : current,
      );
      return;
    }

    const request: TaskPageRequest = {
      projectId: state.data.project.id,
      taskId: state.data.task.id,
      version: pageRequestVersionRef.current,
    };
    setIsLoadingMoreActivities(true);
    setActionError(null);

    try {
      const nextPage = await listTaskActivity(api, request.projectId, request.taskId, {
        cursor,
        limit: TASK_ACTIVITY_PAGE_SIZE,
      });

      setState((current) => {
        if (
          current.status !== 'ready' ||
          current.data.project.id !== request.projectId ||
          current.data.task.id !== request.taskId ||
          !isCurrentPageRequest(request)
        ) {
          return current;
        }

        const resolution = resolveTaskActivityPage(
          current.data.activities,
          nextPage,
          request.version,
          pageRequestVersionRef.current,
        );

        return resolution.applied
          ? {
              data: {
                ...current.data,
                activities: resolution.activities,
                activityHasMore: resolution.hasMore,
              },
              status: 'ready',
            }
          : current;
      });
    } catch (error) {
      if (isCurrentPageRequest(request)) {
        setActionError(getUserFacingError(error));
      }
    } finally {
      if (isCurrentPageRequest(request)) {
        setIsLoadingMoreActivities(false);
      }
    }
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

  const { activities, activityHasMore, comments, members, project, requirements, task } =
    state.data;
  const canEdit = canEditProjectContent(project.accessRole, project.status);
  const canReview = canReviewProjectTasks(project.accessRole);
  const canEditThisTask =
    canEdit && canEditTaskDetails(project.accessRole, task.assigneeId, session?.user.id);
  const assignee = task.assigneeId
    ? members.find((member) => member.userId === task.assigneeId)
    : null;
  const requirement = task.requirementId
    ? requirements.find((item) => item.id === task.requirementId)
    : null;
  const transitions = getTaskStatusTransitions(task.status).filter(
    (status) => status !== 'COMPLETED' || canReview,
  );
  const canReject = canRejectPendingTask(task.status, canReview);
  const canResubmit =
    task.status === 'PENDING_REVIEW' && Boolean(task.rejectionReason) && canEditThisTask;

  return (
    <div className="page-stack p3-page">
      <UnsavedChangesGuard message="评论尚未保存，离开后更改将丢失。" when={commentDirty} />
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
              <dd>{formatTaskDueDate(task.dueDate)}</dd>
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
            {task.rejectionReason ? (
              <div className="task-rejection-note task-detail-rejection">
                审核不通过：{task.rejectionReason}
              </div>
            ) : null}
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
            ) : transitions.length === 0 && !canReject && !canResubmit ? (
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
                {canReject ? (
                  <button
                    className="danger-text-button"
                    disabled={isTransitioning}
                    onClick={attemptRejectTask}
                    type="button"
                  >
                    审核不通过
                  </button>
                ) : null}
                {canResubmit ? (
                  <button
                    className="secondary-button"
                    disabled={isTransitioning}
                    onClick={() => attemptTransition('PENDING_REVIEW')}
                    type="button"
                  >
                    重新提交审核
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="task-history-grid">
        <CommentPanel
          api={api}
          canComment={canEdit}
          currentUserId={session?.user.id}
          initialComments={comments}
          onDirtyChange={setCommentDirty}
          projectId={project.id}
          targetId={task.id}
          targetType="TASK"
          title="任务评论"
        />

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>操作记录</h2>
              <p>
                {activityHasMore ? '已加载' : '共'} {activities.length} 条记录
              </p>
            </div>
          </div>
          {activities.length === 0 ? (
            <div className="linked-task-empty">暂无操作记录</div>
          ) : (
            <div className="activity-timeline">
              {activities.map((activity) => {
                const detail = getTaskActivityDetail(activity);

                return (
                  <article className="activity-row" key={activity.id}>
                    <span className="activity-row__marker" aria-hidden="true" />
                    <div>
                      <strong>{getTaskActivityLabel(activity.action)}</strong>
                      {detail ? <p>{detail}</p> : null}
                      <span>
                        {activity.actor?.nickname ?? '系统'} · {formatDateTime(activity.createdAt)}
                      </span>
                    </div>
                  </article>
                );
              })}
              {activityHasMore ? (
                <button
                  className="secondary-button activity-load-more"
                  disabled={isLoadingMoreActivities || isTransitioning}
                  onClick={() => void loadMoreActivities()}
                  type="button"
                >
                  {isLoadingMoreActivities ? '正在加载...' : '加载更多操作记录'}
                </button>
              ) : null}
            </div>
          )}
        </section>
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
