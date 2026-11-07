import type { ApiClient } from '../../lib/api/client';

export type CommentTargetType = 'MEETING' | 'REQUIREMENT' | 'TASK';

export interface CommentAuthorDto {
  readonly avatarUrl: string | null;
  readonly id: string;
  readonly nickname: string;
  readonly username: string;
}

export interface CommentDto {
  readonly author: CommentAuthorDto;
  readonly content: string;
  readonly createdAt: string;
  readonly id: string;
  readonly targetType: CommentTargetType;
  readonly updatedAt: string;
}

export interface CreateCommentInput {
  readonly content: string;
  readonly targetId: string;
  readonly targetType: CommentTargetType;
}

export interface UpdateCommentInput {
  readonly content: string;
}

function commentsPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/comments`;
}

function commentPath(projectId: string, commentId: string): string {
  return `${commentsPath(projectId)}/${encodeURIComponent(commentId)}`;
}

export function listComments(
  api: Pick<ApiClient, 'get'>,
  projectId: string,
  targetType: CommentTargetType,
  targetId: string,
): Promise<CommentDto[]> {
  const params = new URLSearchParams({ targetId, targetType });

  return api.get<CommentDto[]>(`${commentsPath(projectId)}?${params.toString()}`);
}

export function createComment(
  api: Pick<ApiClient, 'post'>,
  projectId: string,
  input: CreateCommentInput,
): Promise<CommentDto> {
  return api.post<CommentDto, CreateCommentInput>(commentsPath(projectId), input);
}

export function updateComment(
  api: Pick<ApiClient, 'patch'>,
  projectId: string,
  commentId: string,
  input: UpdateCommentInput,
): Promise<CommentDto> {
  return api.patch<CommentDto, UpdateCommentInput>(commentPath(projectId, commentId), input);
}

export function deleteComment(
  api: Pick<ApiClient, 'delete'>,
  projectId: string,
  commentId: string,
): Promise<{ deleted: true }> {
  return api.delete<{ deleted: true }>(commentPath(projectId, commentId));
}
