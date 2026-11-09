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
import { useSession } from '../features/auth/session';
import type { CommentDto } from '../features/comments/comment-api';
import { listComments } from '../features/comments/comment-api';
import { CommentPanel } from '../features/comments/CommentPanel';
import type {
  MeetingActionDto,
  MeetingActionStatus,
  MeetingDto,
  MeetingSummaryDto,
} from '../features/meetings/meeting-api';
import {
  convertMeetingAction,
  createMeeting,
  createMeetingAction,
  getMeeting,
  listMeetings,
  updateMeeting,
  updateMeetingAction,
} from '../features/meetings/meeting-api';
import {
  formatMeetingDateTime,
  getMeetingActionStatusLabel,
  getMeetingActionStatusTransitions,
  isMeetingActionDueDateBeforeProjectStart,
  isMeetingActionOverdue,
} from '../features/meetings/meeting-presentation';
import type {
  MeetingActionFormErrors,
  MeetingActionFormValues,
  MeetingFormErrors,
  MeetingFormValues,
} from '../features/meetings/meeting-validation';
import {
  formToCreateMeetingActionInput,
  formToCreateMeetingInput,
  formToUpdateMeetingInput,
  hasMeetingFormErrors,
  hasUnsavedMeetingChanges,
  meetingToForm,
  validateMeetingActionForm,
  validateMeetingForm,
} from '../features/meetings/meeting-validation';
import type { ProjectDto, ProjectMemberDto } from '../features/projects/project-api';
import { getProject, listProjectMembers } from '../features/projects/project-api';
import {
  canEditProjectContent,
  getProjectRoleLabel,
} from '../features/projects/project-presentation';
import { getUserFacingError } from '../lib/api/errors';

const EMPTY_MEETING_FORM: MeetingFormValues = {
  agenda: '',
  decisions: '',
  minutes: '',
  participantIds: [],
  scheduledAt: '',
  title: '',
};

const EMPTY_ACTION_FORM: MeetingActionFormValues = {
  assigneeId: '',
  dueDate: '',
  status: 'PENDING',
  title: '',
};

interface MeetingsData {
  readonly comments: CommentDto[];
  readonly meeting: MeetingDto | null;
  readonly meetings: MeetingSummaryDto[];
  readonly members: ProjectMemberDto[];
  readonly project: ProjectDto;
}

type MeetingsState =
  | { readonly status: 'loading' }
  | { readonly data: MeetingsData; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

export function MeetingsPage() {
  const { api, session } = useSession();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [actionErrors, setActionErrors] = useState<MeetingActionFormErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState<MeetingActionFormValues>(EMPTY_ACTION_FORM);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [createErrors, setCreateErrors] = useState<MeetingFormErrors>({});
  const [createForm, setCreateForm] = useState<MeetingFormValues>(EMPTY_MEETING_FORM);
  const [createMessage, setCreateMessage] = useState<{
    readonly text: string;
    readonly type: 'error' | 'success';
  } | null>(null);
  const [editErrors, setEditErrors] = useState<MeetingFormErrors>({});
  const [editForm, setEditForm] = useState<MeetingFormValues>(EMPTY_MEETING_FORM);
  const [editInitialForm, setEditInitialForm] = useState<MeetingFormValues>(EMPTY_MEETING_FORM);
  const [editOpen, setEditOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingAction, setIsCreatingAction] = useState(false);
  const [isLoadingSelection, setIsLoadingSelection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingMeetingId, setPendingMeetingId] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<MeetingsState>({ status: 'loading' });
  const [updatingActionId, setUpdatingActionId] = useState<string | null>(null);
  const activeMeetingIdRef = useRef<string | null>(null);
  const selectionVersionRef = useRef(0);

  const selectedMeetingId = state.status === 'ready' ? (state.data.meeting?.id ?? null) : null;
  const selectedMeetingUpdatedAt =
    state.status === 'ready' ? (state.data.meeting?.updatedAt ?? null) : null;

  activeMeetingIdRef.current = selectedMeetingId;

  function toMeetingSummary(meeting: MeetingDto): MeetingSummaryDto {
    return {
      createdAt: meeting.createdAt,
      createdById: meeting.createdById,
      actionCount: meeting.actions.length,
      agenda: meeting.agenda,
      decisions: meeting.decisions,
      id: meeting.id,
      minutes: meeting.minutes,
      participantCount: meeting.participants.length,
      projectId: meeting.projectId,
      scheduledAt: meeting.scheduledAt,
      title: meeting.title,
      updatedAt: meeting.updatedAt,
    };
  }

  useEffect(() => {
    selectionVersionRef.current += 1;
    setActionErrors({});
    setActionError(null);
    setActionForm(EMPTY_ACTION_FORM);
    setActionMessage(null);
    setCreateErrors({});
    setCreateMessage(null);
    setEditErrors({});
    setEditOpen(false);
    setPendingMeetingId(null);

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
      listMeetings(api, projectId),
    ])
      .then(async ([project, members, meetingSummaries]) => {
        const firstMeeting = meetingSummaries[0] ?? null;
        const [meeting, comments] = firstMeeting
          ? await Promise.all([
              getMeeting(api, projectId, firstMeeting.id),
              listComments(api, projectId, 'MEETING', firstMeeting.id),
            ])
          : [null, []];

        if (!isCancelled && selectionVersionRef.current === requestVersion) {
          setState({
            data: {
              comments,
              meeting,
              meetings: meetingSummaries,
              members,
              project,
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
    if (state.status === 'ready' && state.data.meeting) {
      const nextForm = meetingToForm(state.data.meeting);

      setEditForm(nextForm);
      setEditInitialForm(nextForm);
      setEditErrors({});
      setEditOpen(false);
    }
  }, [selectedMeetingId, selectedMeetingUpdatedAt, state.status]);

  function requestMeetingSelection(meetingId: string): void {
    if (editOpen && hasUnsavedMeetingChanges(editInitialForm, editForm)) {
      setPendingMeetingId(meetingId);
      return;
    }

    void selectMeeting(meetingId);
  }

  async function selectMeeting(meetingId: string): Promise<void> {
    if (state.status !== 'ready' || state.data.meeting?.id === meetingId) {
      return;
    }

    const project = state.data.project;
    const requestVersion = ++selectionVersionRef.current;
    setIsLoadingSelection(true);
    setCreateMessage(null);
    setActionMessage(null);
    setActionError(null);
    setPendingMeetingId(null);

    try {
      const [meeting, comments] = await Promise.all([
        getMeeting(api, project.id, meetingId),
        listComments(api, project.id, 'MEETING', meetingId),
      ]);

      if (selectionVersionRef.current !== requestVersion) {
        return;
      }

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                comments,
                meeting,
                meetings: current.data.meetings.map((item) =>
                  item.id === meeting.id ? toMeetingSummary(meeting) : item,
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

  async function handleCreateMeeting(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || isCreating) {
      return;
    }

    const errors = validateMeetingForm(createForm, { requireDetails: true });

    setCreateErrors(errors);
    setCreateMessage(null);

    if (hasMeetingFormErrors(errors)) {
      return;
    }

    setIsCreating(true);
    const selectedAtStart = activeMeetingIdRef.current;

    try {
      const meeting = await createMeeting(
        api,
        state.data.project.id,
        formToCreateMeetingInput(createForm),
      );
      const comments = await listComments(api, state.data.project.id, 'MEETING', meeting.id).catch(
        () => [],
      );
      const shouldActivate = activeMeetingIdRef.current === selectedAtStart;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                comments: shouldActivate ? comments : current.data.comments,
                meeting: shouldActivate ? meeting : current.data.meeting,
                meetings: [toMeetingSummary(meeting), ...current.data.meetings],
              },
              status: 'ready',
            }
          : current,
      );
      setCreateForm(EMPTY_MEETING_FORM);
      setCreateErrors({});
      setCreateMessage({ text: '会议已创建。', type: 'success' });
    } catch (error) {
      setCreateMessage({ text: getUserFacingError(error), type: 'error' });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveMeeting(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || !state.data.meeting || isSaving) {
      return;
    }

    const errors = validateMeetingForm(editForm, { requireDetails: true });

    setEditErrors(errors);
    setCreateMessage(null);

    if (hasMeetingFormErrors(errors)) {
      return;
    }

    const targetMeetingId = state.data.meeting.id;
    const project = state.data.project;
    setIsSaving(true);

    try {
      const meeting = await updateMeeting(
        api,
        project.id,
        targetMeetingId,
        formToUpdateMeetingInput(editForm),
      );
      const shouldActivate = activeMeetingIdRef.current === targetMeetingId;

      setState((current) =>
        current.status === 'ready'
          ? {
              data: {
                ...current.data,
                meeting: shouldActivate ? meeting : current.data.meeting,
                meetings: current.data.meetings.map((item) =>
                  item.id === meeting.id ? toMeetingSummary(meeting) : item,
                ),
              },
              status: 'ready',
            }
          : current,
      );
      if (shouldActivate) {
        setCreateMessage({ text: '会议信息已保存。', type: 'success' });
      }
    } catch (error) {
      if (activeMeetingIdRef.current === targetMeetingId) {
        setCreateMessage({ text: getUserFacingError(error), type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateAction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || !state.data.meeting || isCreatingAction) {
      return;
    }

    const errors = validateMeetingActionForm(actionForm, state.data.project.startDate);

    setActionErrors(errors);
    setActionError(null);
    setActionMessage(null);

    if (hasMeetingFormErrors(errors)) {
      return;
    }

    const meetingId = state.data.meeting.id;
    const project = state.data.project;
    setIsCreatingAction(true);

    try {
      const action = await createMeetingAction(
        api,
        project.id,
        meetingId,
        formToCreateMeetingActionInput(actionForm),
      );

      setState((current) =>
        current.status === 'ready' && current.data.meeting?.id === meetingId
          ? {
              data: {
                ...current.data,
                meeting: {
                  ...current.data.meeting,
                  actions: [...current.data.meeting.actions, action],
                },
              },
              status: 'ready',
            }
          : current,
      );
      setActionForm(EMPTY_ACTION_FORM);
      setActionMessage('行动项已创建。');
    } catch (error) {
      setActionError(getUserFacingError(error));
    } finally {
      setIsCreatingAction(false);
    }
  }

  function replaceAction(current: MeetingDto, action: MeetingActionDto): MeetingDto {
    return {
      ...current,
      actions: current.actions.map((item) => (item.id === action.id ? action : item)),
    };
  }

  async function handleActionStatus(
    action: MeetingActionDto,
    status: MeetingActionStatus,
  ): Promise<void> {
    if (state.status !== 'ready' || !state.data.meeting || updatingActionId) {
      return;
    }

    const meetingId = state.data.meeting.id;
    const project = state.data.project;
    setUpdatingActionId(action.id);
    setActionError(null);
    setActionMessage(null);

    try {
      const updated = await updateMeetingAction(api, project.id, meetingId, action.id, { status });

      setState((current) =>
        current.status === 'ready' && current.data.meeting?.id === meetingId
          ? {
              data: {
                ...current.data,
                meeting: replaceAction(current.data.meeting, updated),
              },
              status: 'ready',
            }
          : current,
      );
      setActionMessage(`行动项已更新为“${getMeetingActionStatusLabel(updated.status)}”。`);
    } catch (error) {
      setActionError(getUserFacingError(error));
    } finally {
      setUpdatingActionId(null);
    }
  }

  async function handleConvertAction(action: MeetingActionDto): Promise<void> {
    if (state.status !== 'ready' || !state.data.meeting || updatingActionId) {
      return;
    }

    const meetingId = state.data.meeting.id;
    const project = state.data.project;

    if (isMeetingActionDueDateBeforeProjectStart(action.dueDate, project.startDate)) {
      setActionError('行动项截止日期早于项目开始日期，暂不能转换为任务。');
      return;
    }

    setUpdatingActionId(action.id);
    setActionError(null);
    setActionMessage(null);

    try {
      const conversion = await convertMeetingAction(api, project.id, meetingId, action.id);

      setState((current) =>
        current.status === 'ready' && current.data.meeting?.id === meetingId
          ? {
              data: {
                ...current.data,
                meeting: replaceAction(current.data.meeting, conversion.action),
              },
              status: 'ready',
            }
          : current,
      );
      setActionMessage(`行动项已转换为任务“${conversion.task.title}”。`);
    } catch (error) {
      setActionError(getUserFacingError(error));
    } finally {
      setUpdatingActionId(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="会议纪要" description="记录会议议程、纪要、决定和行动项。" />
        <LoadingState label="正在加载会议记录" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="会议纪要" description="记录会议议程、纪要、决定和行动项。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((value) => value + 1)}
          title="会议记录加载失败"
        />
      </div>
    );
  }

  const { comments, meeting, meetings, members, project } = state.data;
  const canEdit = canEditProjectContent(project.accessRole, project.status);
  const creator = meeting
    ? (members.find((member) => member.userId === meeting.createdById) ?? null)
    : null;
  const createDraft =
    createForm.title.length > 0 ||
    createForm.agenda.length > 0 ||
    createForm.scheduledAt.length > 0;
  const editDirty = editOpen && hasUnsavedMeetingChanges(editInitialForm, editForm);

  return (
    <div className="page-stack p5-page">
      <UnsavedChangesGuard
        message="会议内容尚未保存，离开后修改将丢失。"
        when={createDraft || editDirty}
      />
      <PageHeader title="会议纪要" description="记录会议议程、纪要、决定和行动项。" />

      <div className="read-only-inline">
        当前角色：{getProjectRoleLabel(project.accessRole)}
        {!canEdit ? ' · 当前角色只能查看会议和行动项' : ''}
      </div>
      {createMessage?.type === 'error' ? <ErrorNotice message={createMessage.text} /> : null}
      {createMessage?.type === 'success' ? (
        <div className="success-notice">{createMessage.text}</div>
      ) : null}

      {canEdit ? (
        <section className="panel meeting-create-panel">
          <div className="panel__header">
            <div>
              <h2>创建会议</h2>
              <p>填写会议主题、时间和参会人员，议程可稍后补充。</p>
            </div>
          </div>
          <form
            className="auth-form meeting-form"
            onSubmit={(event) => void handleCreateMeeting(event)}
          >
            <div className="project-form-grid">
              <label className="form-field">
                <span>会议主题</span>
                <input
                  disabled={isCreating}
                  maxLength={100}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="例如：P5 阶段评审"
                  value={createForm.title}
                />
                {createErrors.title ? <small>{createErrors.title}</small> : null}
              </label>
              <label className="form-field">
                <span>会议时间</span>
                <input
                  disabled={isCreating}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      scheduledAt: event.target.value,
                    }))
                  }
                  type="datetime-local"
                  value={createForm.scheduledAt}
                />
                {createErrors.scheduledAt ? <small>{createErrors.scheduledAt}</small> : null}
              </label>
            </div>
            <label className="form-field">
              <span>会议议程</span>
              <textarea
                disabled={isCreating}
                maxLength={5000}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, agenda: event.target.value }))
                }
                rows={3}
                value={createForm.agenda}
              />
              {createErrors.agenda ? <small>{createErrors.agenda}</small> : null}
            </label>
            <ParticipantSelector
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
                {isCreating ? '正在创建...' : '创建会议'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {meetings.length === 0 ? (
        <section className="panel panel--large">
          <EmptyState title="暂无会议记录" description="创建会议后可以记录纪要和行动项。" />
        </section>
      ) : (
        <div className="meeting-workspace">
          <section className="panel meeting-list-panel">
            <div className="panel__header">
              <div>
                <h2>历史会议</h2>
                <p>共 {meetings.length} 次会议</p>
              </div>
            </div>
            <div className="meeting-list">
              {meetings.map((item) => (
                <button
                  className={`meeting-list-row${meeting?.id === item.id ? ' is-active' : ''}`}
                  disabled={isLoadingSelection}
                  key={item.id}
                  onClick={() => requestMeetingSelection(item.id)}
                  type="button"
                >
                  <strong>{item.title}</strong>
                  <span>{formatMeetingDateTime(item.scheduledAt)}</span>
                  <span>
                    {item.participantCount} 人 · {item.actionCount} 个行动项
                  </span>
                </button>
              ))}
            </div>
          </section>

          {meeting ? (
            <section className="panel meeting-detail-panel">
              <div className="panel__header">
                <div>
                  <h2>{meeting.title}</h2>
                  <p>{formatMeetingDateTime(meeting.scheduledAt)}</p>
                </div>
                {canEdit ? (
                  <button
                    className="secondary-button"
                    disabled={isSaving}
                    onClick={() => setEditOpen((value) => !value)}
                    type="button"
                  >
                    {editOpen ? '收起编辑' : '编辑会议'}
                  </button>
                ) : null}
              </div>

              <div className="meeting-meta">
                <span>创建人：{creator?.nickname ?? '项目成员'}</span>
                <span>参会 {meeting.participants.length} 人</span>
              </div>

              {editOpen ? (
                <form
                  className="auth-form meeting-edit-form"
                  onSubmit={(event) => void handleSaveMeeting(event)}
                >
                  <div className="project-form-grid">
                    <label className="form-field">
                      <span>会议主题</span>
                      <input
                        disabled={isSaving}
                        maxLength={100}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, title: event.target.value }))
                        }
                        value={editForm.title}
                      />
                      {editErrors.title ? <small>{editErrors.title}</small> : null}
                    </label>
                    <label className="form-field">
                      <span>会议时间</span>
                      <input
                        disabled={isSaving}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            scheduledAt: event.target.value,
                          }))
                        }
                        type="datetime-local"
                        value={editForm.scheduledAt}
                      />
                      {editErrors.scheduledAt ? <small>{editErrors.scheduledAt}</small> : null}
                    </label>
                  </div>
                  <label className="form-field">
                    <span>会议议程</span>
                    <textarea
                      disabled={isSaving}
                      maxLength={5000}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, agenda: event.target.value }))
                      }
                      rows={3}
                      value={editForm.agenda}
                    />
                  </label>
                  <label className="form-field">
                    <span>会议纪要</span>
                    <textarea
                      disabled={isSaving}
                      maxLength={5000}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, minutes: event.target.value }))
                      }
                      rows={4}
                      value={editForm.minutes}
                    />
                  </label>
                  <label className="form-field">
                    <span>会议决定</span>
                    <textarea
                      disabled={isSaving}
                      maxLength={5000}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          decisions: event.target.value,
                        }))
                      }
                      rows={3}
                      value={editForm.decisions}
                    />
                  </label>
                  <ParticipantSelector
                    disabled={isSaving}
                    error={editErrors.participantIds}
                    members={members}
                    onChange={(participantIds) =>
                      setEditForm((current) => ({ ...current, participantIds }))
                    }
                    selectedIds={editForm.participantIds}
                  />
                  <div className="form-actions">
                    <button
                      className="primary-button"
                      disabled={isSaving || !hasUnsavedMeetingChanges(editInitialForm, editForm)}
                      type="submit"
                    >
                      {isSaving ? '正在保存...' : '保存会议'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="meeting-notes">
                  <MeetingNote label="会议议程" value={meeting.agenda} />
                  <MeetingNote label="会议纪要" value={meeting.minutes} />
                  <MeetingNote label="会议决定" value={meeting.decisions} />
                </div>
              )}

              <section className="meeting-action-section">
                <div className="panel__header">
                  <div>
                    <h3>行动项</h3>
                    <p>跟踪负责人、截止日期和完成状态，也可以转为普通任务。</p>
                  </div>
                </div>
                {actionError ? <ErrorNotice message={actionError} /> : null}
                {actionMessage ? <div className="success-notice">{actionMessage}</div> : null}

                {canEdit ? (
                  <form
                    className="auth-form meeting-action-form"
                    onSubmit={(event) => void handleCreateAction(event)}
                  >
                    <div className="meeting-action-grid">
                      <label className="form-field">
                        <span>行动项标题</span>
                        <input
                          disabled={isCreatingAction}
                          maxLength={100}
                          onChange={(event) =>
                            setActionForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          value={actionForm.title}
                        />
                        {actionErrors.title ? <small>{actionErrors.title}</small> : null}
                      </label>
                      <label className="form-field">
                        <span>负责人</span>
                        <select
                          disabled={isCreatingAction}
                          onChange={(event) =>
                            setActionForm((current) => ({
                              ...current,
                              assigneeId: event.target.value,
                            }))
                          }
                          value={actionForm.assigneeId}
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
                          disabled={isCreatingAction}
                          onChange={(event) =>
                            setActionForm((current) => ({
                              ...current,
                              dueDate: event.target.value,
                            }))
                          }
                          type="date"
                          value={actionForm.dueDate}
                        />
                        {actionErrors.dueDate ? <small>{actionErrors.dueDate}</small> : null}
                      </label>
                    </div>
                    <div className="form-actions">
                      <button className="primary-button" disabled={isCreatingAction} type="submit">
                        {isCreatingAction ? '正在创建...' : '创建行动项'}
                      </button>
                    </div>
                  </form>
                ) : null}

                {meeting.actions.length === 0 ? (
                  <div className="linked-task-empty">暂无行动项</div>
                ) : (
                  <div className="meeting-action-list">
                    {meeting.actions.map((action) => (
                      <article className="meeting-action-row" key={action.id}>
                        <div>
                          <strong>{action.title}</strong>
                          <span>
                            {getMeetingMemberLabel(members, action.assigneeId)}
                            {action.dueDate
                              ? ` · 截止 ${formatMeetingDateTime(action.dueDate)}`
                              : ' · 未设置截止日期'}
                          </span>
                          {isMeetingActionOverdue(action.dueDate, action.status) ? (
                            <span className="overdue-badge">已逾期</span>
                          ) : null}
                          {isMeetingActionDueDateBeforeProjectStart(
                            action.dueDate,
                            project.startDate,
                          ) ? (
                            <span className="action-date-error">
                              截止日期早于项目开始日期，需先调整
                            </span>
                          ) : null}
                        </div>
                        <div className="meeting-action-row__status">
                          <span
                            className={`meeting-action-status meeting-action-status--${action.status.toLowerCase()}`}
                          >
                            {getMeetingActionStatusLabel(action.status)}
                          </span>
                          {canEdit ? (
                            <div className="button-row">
                              {getMeetingActionStatusTransitions(action.status).map((status) => (
                                <button
                                  className="secondary-button"
                                  disabled={
                                    updatingActionId !== null ||
                                    isMeetingActionDueDateBeforeProjectStart(
                                      action.dueDate,
                                      project.startDate,
                                    )
                                  }
                                  key={status}
                                  onClick={() => void handleActionStatus(action, status)}
                                  type="button"
                                >
                                  {getMeetingActionStatusLabel(status)}
                                </button>
                              ))}
                              {action.convertedTaskId ? (
                                <Link
                                  className="secondary-link"
                                  to={buildTaskPath(project.id, action.convertedTaskId)}
                                >
                                  查看任务
                                </Link>
                              ) : (
                                <button
                                  className="secondary-button"
                                  disabled={updatingActionId !== null}
                                  onClick={() => void handleConvertAction(action)}
                                  type="button"
                                >
                                  转为任务
                                </button>
                              )}
                            </div>
                          ) : action.convertedTaskId ? (
                            <Link
                              className="secondary-link"
                              to={buildTaskPath(project.id, action.convertedTaskId)}
                            >
                              查看任务
                            </Link>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <CommentPanel
                api={api}
                canComment={canEdit}
                currentUserId={session?.user.id}
                initialComments={comments}
                projectId={project.id}
                targetId={meeting.id}
                targetType="MEETING"
                title="会议评论"
              />
            </section>
          ) : null}
        </div>
      )}

      {pendingMeetingId ? (
        <ConfirmDialog
          confirmLabel="放弃并切换"
          message="当前会议还有未保存的修改，切换后这些修改将丢失。"
          onCancel={() => setPendingMeetingId(null)}
          onConfirm={() => {
            const meetingId = pendingMeetingId;

            setPendingMeetingId(null);
            setEditOpen(false);
            setEditErrors({});
            void selectMeeting(meetingId);
          }}
          title="切换会议"
          tone="danger"
        />
      ) : null}
    </div>
  );
}

interface ParticipantSelectorProps {
  readonly disabled: boolean;
  readonly error?: string;
  readonly members: readonly ProjectMemberDto[];
  readonly onChange: (ids: string[]) => void;
  readonly selectedIds: readonly string[];
}

function ParticipantSelector({
  disabled,
  error,
  members,
  onChange,
  selectedIds,
}: ParticipantSelectorProps) {
  return (
    <fieldset className="participant-selector" disabled={disabled}>
      <legend>参会人员</legend>
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

function MeetingNote({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <article>
      <h3>{label}</h3>
      <p>{value || '暂未填写。'}</p>
    </article>
  );
}

function getMeetingMemberLabel(
  members: readonly ProjectMemberDto[],
  userId: string | null,
): string {
  if (!userId) {
    return '未分配';
  }

  const member = members.find((item) => item.userId === userId);

  return member ? `${member.nickname} (@${member.username})` : userId;
}
