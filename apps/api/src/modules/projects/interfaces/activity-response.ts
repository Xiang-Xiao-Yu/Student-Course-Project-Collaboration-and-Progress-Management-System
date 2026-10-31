export interface ActivityActorResponse {
  id: string;
  nickname: string;
  username: string;
}

export interface ActivityResponse {
  action: string;
  actor: ActivityActorResponse | null;
  afterValue: unknown;
  beforeValue: unknown;
  createdAt: string;
  id: string;
  targetId: string;
  targetType: string;
}
