import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorNotice } from '../../components/ErrorNotice';
import type { ApiClient } from '../../lib/api/client';
import { getUserFacingError } from '../../lib/api/errors';
import type { CommentDto, CommentTargetType } from './comment-api';
import { createComment, deleteComment, updateComment } from './comment-api';
import {
  COMMENT_MAX_LENGTH,
  normalizeCommentContent,
  validateCommentContent,
} from './comment-validation';

interface CommentPanelProps {
  readonly api: Pick<ApiClient, 'delete' | 'patch' | 'post'>;
  readonly canComment: boolean;
  readonly currentUserId: string | null | undefined;
  readonly initialComments: readonly CommentDto[];
  readonly projectId: string;
  readonly targetId: string;
  readonly targetType: CommentTargetType;
  readonly title?: string;
}

type PendingAction = 'create' | 'delete' | 'update' | null;

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '时间无效';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function CommentPanel({
  api,
  canComment,
  currentUserId,
  initialComments,
  projectId,
  targetId,
  targetType,
  title = '评论',
}: CommentPanelProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [comments, setComments] = useState<readonly CommentDto[]>(initialComments);
  const [commentToDelete, setCommentToDelete] = useState<CommentDto | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [newContent, setNewContent] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    setComments(initialComments);
    setActionError(null);
    setActionMessage(null);
    setCommentToDelete(null);
    setCreateError(null);
    setEditError(null);
    setEditingCommentId(null);
    setEditingContent('');
    setNewContent('');
    setPendingAction(null);
  }, [initialComments, projectId, targetId, targetType]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canComment || pendingAction) {
      return;
    }

    const error = validateCommentContent(newContent);

    setCreateError(error);
    setActionError(null);
    setActionMessage(null);

    if (error) {
      return;
    }

    setPendingAction('create');

    try {
      const comment = await createComment(api, projectId, {
        content: normalizeCommentContent(newContent),
        targetId,
        targetType,
      });

      setComments((current) => [...current, comment]);
      setNewContent('');
      setActionMessage('评论已发布。');
    } catch (requestError) {
      setActionError(getUserFacingError(requestError));
    } finally {
      setPendingAction(null);
    }
  }

  function startEditing(comment: CommentDto): void {
    setEditingCommentId(comment.id);
    setEditingContent(comment.content);
    setEditError(null);
    setActionError(null);
    setActionMessage(null);
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!editingCommentId || !canComment || pendingAction) {
      return;
    }

    const error = validateCommentContent(editingContent);

    setEditError(error);
    setActionError(null);
    setActionMessage(null);

    if (error) {
      return;
    }

    setPendingAction('update');

    try {
      const comment = await updateComment(api, projectId, editingCommentId, {
        content: normalizeCommentContent(editingContent),
      });

      setComments((current) => current.map((item) => (item.id === comment.id ? comment : item)));
      setEditingCommentId(null);
      setEditingContent('');
      setActionMessage('评论已更新。');
    } catch (requestError) {
      setActionError(getUserFacingError(requestError));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!commentToDelete || !canComment || pendingAction) {
      return;
    }

    setPendingAction('delete');
    setActionError(null);
    setActionMessage(null);

    try {
      await deleteComment(api, projectId, commentToDelete.id);
      setComments((current) => current.filter((item) => item.id !== commentToDelete.id));
      setCommentToDelete(null);
      setActionMessage('评论已删除。');
    } catch (requestError) {
      setCommentToDelete(null);
      setActionError(getUserFacingError(requestError));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="panel comment-panel">
      <div className="panel__header">
        <div>
          <h2>{title}</h2>
          <p>共 {comments.length} 条评论</p>
        </div>
      </div>

      {actionError ? <ErrorNotice message={actionError} /> : null}
      {actionMessage ? <div className="success-notice">{actionMessage}</div> : null}

      {canComment ? (
        <form className="comment-compose" onSubmit={(event) => void handleCreate(event)}>
          <label className="form-field">
            <span>发布评论</span>
            <textarea
              disabled={pendingAction !== null}
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(event) => setNewContent(event.target.value)}
              placeholder="记录问题、决定或后续行动"
              rows={3}
              value={newContent}
            />
            {createError ? <small>{createError}</small> : null}
          </label>
          <div className="form-actions">
            <button
              className="primary-button"
              disabled={pendingAction !== null || !newContent.trim()}
              type="submit"
            >
              {pendingAction === 'create' ? '正在发布...' : '发表评论'}
            </button>
          </div>
        </form>
      ) : (
        <div className="read-only-inline">当前角色只能查看评论。</div>
      )}

      {comments.length === 0 ? (
        <div className="linked-task-empty">暂无评论</div>
      ) : (
        <div className="comment-list">
          {comments.map((comment) => {
            const canManageComment = canComment && comment.author.id === currentUserId;
            const isEditing = editingCommentId === comment.id;

            return (
              <article className="comment-row comment-row--editable" key={comment.id}>
                <div className="comment-row__header">
                  <strong>{comment.author.nickname}</strong>
                  <span>@{comment.author.username}</span>
                  <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                </div>

                {isEditing ? (
                  <form
                    className="comment-edit-form"
                    onSubmit={(event) => void handleUpdate(event)}
                  >
                    <textarea
                      disabled={pendingAction !== null}
                      maxLength={COMMENT_MAX_LENGTH}
                      onChange={(event) => setEditingContent(event.target.value)}
                      rows={3}
                      value={editingContent}
                    />
                    {editError ? <small>{editError}</small> : null}
                    <div className="button-row">
                      <button
                        className="primary-button"
                        disabled={pendingAction !== null || !editingContent.trim()}
                        type="submit"
                      >
                        {pendingAction === 'update' ? '正在保存...' : '保存评论'}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={pendingAction !== null}
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditingContent('');
                          setEditError(null);
                        }}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p>{comment.content}</p>
                    <div className="comment-row__footer">
                      {comment.updatedAt !== comment.createdAt ? (
                        <span>已编辑 {formatDateTime(comment.updatedAt)}</span>
                      ) : null}
                      {canManageComment ? (
                        <div className="button-row">
                          <button
                            className="secondary-button"
                            disabled={pendingAction !== null}
                            onClick={() => startEditing(comment)}
                            type="button"
                          >
                            编辑
                          </button>
                          <button
                            className="danger-text-button"
                            disabled={pendingAction !== null}
                            onClick={() => setCommentToDelete(comment)}
                            type="button"
                          >
                            删除
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {commentToDelete ? (
        <ConfirmDialog
          confirmLabel="确认删除"
          isPending={pendingAction === 'delete'}
          message="删除后无法恢复，其他成员也将无法查看这条评论。"
          onCancel={() => setCommentToDelete(null)}
          onConfirm={() => void handleDelete()}
          title="删除评论"
          tone="danger"
        />
      ) : null}
    </section>
  );
}
