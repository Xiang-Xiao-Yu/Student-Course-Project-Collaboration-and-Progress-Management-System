export interface SessionUser {
  id: string;
  nickname: string;
  username: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
  user: SessionUser;
}

export interface LogoutResponse {
  loggedOut: true;
}
