import type { RequestWithId } from './request.types';

export interface AuthenticatedUser {
  id: string;
  nickname: string;
  username: string;
}

export interface AuthenticatedRequest extends RequestWithId {
  authUser?: AuthenticatedUser;
}
