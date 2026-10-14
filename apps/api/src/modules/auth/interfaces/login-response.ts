import type { AuthenticatedUser } from '../../../common/http/authenticated-request';

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
  user: AuthenticatedUser;
}

export interface LogoutResponse {
  loggedOut: true;
}
