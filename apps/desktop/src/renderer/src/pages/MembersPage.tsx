import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { buildProjectPath } from '../app/navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice } from '../components/ErrorNotice';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { useSession } from '../features/auth/session';
import type { ProjectDto, ProjectMemberDto, ProjectRole } from '../features/projects/project-api';
import {
  getProject,
  inviteProjectMember,
  listProjectMembers,
  removeProjectMember,
  updateProjectMemberRole,
} from '../features/projects/project-api';
import {
  canManageMembers,
  formatProjectDate,
  getProjectRoleLabel,
  getProjectStatusLabel,
  isProjectArchived,
} from '../features/projects/project-presentation';
import type { MemberInviteFormErrors } from '../features/projects/project-validation';
import {
  hasMemberInviteFormErrors,
  validateMemberInviteForm,
} from '../features/projects/project-validation';
import { getUserFacingError } from '../lib/api/errors';

interface MembersPageData {
  readonly members: ProjectMemberDto[];
  readonly project: ProjectDto;
}

type MembersPageState =
  | { readonly status: 'loading' }
  | { readonly data: MembersPageData; readonly status: 'ready' }
  | { readonly message: string; readonly status: 'error' };

function sortMembers(members: ProjectMemberDto[]): ProjectMemberDto[] {
  const roleOrder: Record<ProjectRole, number> = {
    OWNER: 0,
    MEMBER: 1,
    OBSERVER: 2,
  };

  return [...members].sort(
    (left, right) =>
      roleOrder[left.role] - roleOrder[right.role] ||
      left.nickname.localeCompare(right.nickname, 'zh-CN'),
  );
}

function MemberAvatar({ member }: { readonly member: ProjectMemberDto }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="member-avatar">
      {member.avatarUrl && !failed ? (
        <img
          alt={`${member.nickname}的头像`}
          onError={() => setFailed(true)}
          src={member.avatarUrl}
        />
      ) : (
        <span aria-hidden="true">{member.nickname.slice(0, 1) || member.username.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function MembersPage() {
  const { api, session } = useSession();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [inviteErrors, setInviteErrors] = useState<MemberInviteFormErrors>({});
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'OBSERVER'>('MEMBER');
  const [inviteUsername, setInviteUsername] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<ProjectMemberDto | null>(null);
  const [memberToTransfer, setMemberToTransfer] = useState<ProjectMemberDto | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<MembersPageState>({ status: 'loading' });

  useEffect(() => {
    if (!projectId) {
      setState({ message: '没有可加载的项目。', status: 'error' });
      return;
    }

    let isCancelled = false;

    setState({ status: 'loading' });
    void Promise.all([getProject(api, projectId), listProjectMembers(api, projectId)])
      .then(([project, members]) => {
        if (!isCancelled) {
          setState({
            data: {
              members: sortMembers(members),
              project,
            },
            status: 'ready',
          });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({
            message: getUserFacingError(error),
            status: 'error',
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api, projectId, retryVersion]);

  async function handleInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (state.status !== 'ready' || isInviting) {
      return;
    }

    const nextErrors = validateMemberInviteForm({
      role: inviteRole,
      username: inviteUsername,
    });

    setInviteErrors(nextErrors);
    setActionError(null);
    setActionMessage(null);

    if (hasMemberInviteFormErrors(nextErrors)) {
      return;
    }

    setIsInviting(true);

    try {
      const member = await inviteProjectMember(api, state.data.project.id, {
        role: inviteRole,
        username: inviteUsername.trim(),
      });

      setState({
        data: {
          ...state.data,
          members: sortMembers([...state.data.members, member]),
        },
        status: 'ready',
      });
      setInviteUsername('');
      setActionMessage(`已邀请 ${member.nickname} 加入项目。`);
    } catch (error) {
      setActionError(getUserFacingError(error));
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRoleChange(
    member: ProjectMemberDto,
    nextRole: Exclude<ProjectRole, 'OWNER'>,
  ): Promise<void> {
    if (state.status !== 'ready' || busyUserId) {
      return;
    }

    setBusyUserId(member.userId);
    setActionError(null);
    setActionMessage(null);

    try {
      const updatedMember = await updateProjectMemberRole(
        api,
        state.data.project.id,
        member.userId,
        nextRole,
      );

      setState({
        data: {
          ...state.data,
          members: sortMembers(
            state.data.members.map((item) =>
              item.userId === updatedMember.userId ? updatedMember : item,
            ),
          ),
        },
        status: 'ready',
      });
      setActionMessage(`${updatedMember.nickname} 的角色已更新。`);
    } catch (error) {
      setActionError(getUserFacingError(error));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleTransferOwnership(): Promise<void> {
    if (state.status !== 'ready' || !memberToTransfer || busyUserId) {
      return;
    }

    setBusyUserId(memberToTransfer.userId);
    setActionError(null);
    setActionMessage(null);

    try {
      const updatedMember = await updateProjectMemberRole(
        api,
        state.data.project.id,
        memberToTransfer.userId,
        'OWNER',
      );

      setMemberToTransfer(null);
      setActionMessage(`项目负责人已转移给 ${updatedMember.nickname}。`);
      setRetryVersion((version) => version + 1);
    } catch (error) {
      setMemberToTransfer(null);
      setActionError(getUserFacingError(error));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemoveMember(): Promise<void> {
    if (state.status !== 'ready' || !memberToRemove || busyUserId) {
      return;
    }

    setBusyUserId(memberToRemove.userId);
    setActionError(null);
    setActionMessage(null);

    try {
      await removeProjectMember(api, state.data.project.id, memberToRemove.userId);
      const removedName = memberToRemove.nickname;

      setState({
        data: {
          ...state.data,
          members: state.data.members.filter((member) => member.userId !== memberToRemove.userId),
        },
        status: 'ready',
      });
      setMemberToRemove(null);
      setActionMessage(`已将 ${removedName} 移出项目。`);
    } catch (error) {
      setMemberToRemove(null);
      setActionError(getUserFacingError(error));
    } finally {
      setBusyUserId(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader title="成员管理" description="查看成员角色和项目访问权限。" />
        <LoadingState label="正在加载项目成员" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader title="成员管理" description="查看成员角色和项目访问权限。" />
        <ErrorState
          actionLabel="重试"
          message={state.message}
          onAction={() => setRetryVersion((version) => version + 1)}
          title="成员列表加载失败"
        />
      </div>
    );
  }

  const { members, project } = state.data;
  const manager = canManageMembers(project.accessRole);
  const archived = isProjectArchived(project.status);
  const canWriteMembers = manager && !archived;

  return (
    <div className="page-stack projects-page">
      <div className="page-heading-with-action">
        <PageHeader title="成员管理" description="查看成员角色和项目访问权限。" />
        <Link className="secondary-link" to={buildProjectPath(project.id, 'overview')}>
          返回项目
        </Link>
      </div>

      {archived ? <div className="session-notice">项目已归档，成员和角色信息仅可查看。</div> : null}
      {!manager ? (
        <div className="read-only-inline">
          当前角色为 {getProjectRoleLabel(project.accessRole)}，成员管理操作仅对项目负责人开放。
        </div>
      ) : null}
      {actionError ? <ErrorNotice message={actionError} /> : null}
      {actionMessage ? <div className="success-notice">{actionMessage}</div> : null}

      {canWriteMembers ? (
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>邀请成员</h2>
              <p>通过已有账号的用户名邀请成员加入当前项目。</p>
            </div>
          </div>
          <form className="member-invite-form" onSubmit={(event) => void handleInvite(event)}>
            <label className="form-field">
              <span>用户名</span>
              <input
                disabled={isInviting}
                maxLength={64}
                onChange={(event) => setInviteUsername(event.target.value)}
                placeholder="输入成员用户名"
                value={inviteUsername}
              />
              {inviteErrors.username ? <small>{inviteErrors.username}</small> : null}
            </label>
            <label className="form-field">
              <span>项目角色</span>
              <select
                disabled={isInviting}
                onChange={(event) =>
                  setInviteRole(event.target.value === 'OBSERVER' ? 'OBSERVER' : 'MEMBER')
                }
                value={inviteRole}
              >
                <option value="MEMBER">项目成员</option>
                <option value="OBSERVER">观察者</option>
              </select>
              {inviteErrors.role ? <small>{inviteErrors.role}</small> : null}
            </label>
            <button className="primary-button" disabled={isInviting} type="submit">
              {isInviting ? '正在邀请...' : '邀请成员'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="member-list-section" aria-labelledby="member-list-title">
        <div className="section-heading">
          <div>
            <h2 id="member-list-title">项目成员</h2>
            <p>
              项目状态：{getProjectStatusLabel(project.status)} · 共 {members.length} 人
            </p>
          </div>
        </div>

        {members.length === 0 ? (
          <section className="panel panel--large">
            <EmptyState description="邀请成员后，可以在这里查看角色和加入时间。" title="暂无成员" />
          </section>
        ) : (
          <div className="member-list">
            {members.map((member) => {
              const isCurrentUser = member.userId === session?.user.id;
              const isOwner = member.role === 'OWNER';
              const isBusy = busyUserId === member.userId;

              return (
                <article className="member-row" key={member.userId}>
                  <div className="member-row__identity">
                    <MemberAvatar member={member} />
                    <div>
                      <strong>
                        {member.nickname}
                        {isCurrentUser ? (
                          <span className="current-user-label">当前账号</span>
                        ) : null}
                      </strong>
                      <span>@{member.username}</span>
                    </div>
                  </div>

                  <div className="member-row__joined">
                    <span>加入时间</span>
                    <strong>{formatProjectDate(member.joinedAt)}</strong>
                  </div>

                  <div className="member-row__role">
                    {canWriteMembers && !isOwner ? (
                      <select
                        aria-label={`修改 ${member.nickname} 的项目角色`}
                        disabled={Boolean(busyUserId)}
                        onChange={(event) =>
                          void handleRoleChange(
                            member,
                            event.target.value === 'OBSERVER' ? 'OBSERVER' : 'MEMBER',
                          )
                        }
                        value={member.role}
                      >
                        <option value="MEMBER">项目成员</option>
                        <option value="OBSERVER">观察者</option>
                      </select>
                    ) : (
                      <span className={`member-role member-role--${member.role.toLowerCase()}`}>
                        {getProjectRoleLabel(member.role)}
                      </span>
                    )}
                  </div>

                  <div className="member-row__actions">
                    {canWriteMembers && !isOwner ? (
                      <>
                        <button
                          className="secondary-button"
                          disabled={Boolean(busyUserId)}
                          onClick={() => setMemberToTransfer(member)}
                          type="button"
                        >
                          移交负责人
                        </button>
                        <button
                          className="danger-text-button"
                          disabled={Boolean(busyUserId)}
                          onClick={() => setMemberToRemove(member)}
                          type="button"
                        >
                          {isBusy ? '正在处理...' : '移除'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {memberToTransfer ? (
        <ConfirmDialog
          confirmLabel="确认移交"
          isPending={Boolean(busyUserId)}
          message={`移交后你将成为普通成员，${memberToTransfer.nickname} 将获得项目负责人权限。`}
          onCancel={() => setMemberToTransfer(null)}
          onConfirm={() => void handleTransferOwnership()}
          title="移交项目负责人"
          tone="danger"
        />
      ) : null}

      {memberToRemove ? (
        <ConfirmDialog
          confirmLabel="确认移除"
          isPending={Boolean(busyUserId)}
          message={`移除 ${memberToRemove.nickname} 后，该账号将不能继续访问此项目。`}
          onCancel={() => setMemberToRemove(null)}
          onConfirm={() => void handleRemoveMember()}
          title="移除项目成员"
          tone="danger"
        />
      ) : null}
    </div>
  );
}
