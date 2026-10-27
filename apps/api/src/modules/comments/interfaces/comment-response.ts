import type { CommentTargetType } from '../comment.constants';

export interface CommentResponse {
  author: {
    avatarUrl: string | null;
    id: string;
    nickname: string;
    username: string;
  };
  content: string;
  createdAt: string;
  id: string;
  targetType: CommentTargetType;
  updatedAt: string;
}
