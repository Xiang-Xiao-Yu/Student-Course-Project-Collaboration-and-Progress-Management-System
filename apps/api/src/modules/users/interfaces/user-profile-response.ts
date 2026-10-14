export interface UserProfileResponse {
  avatarUrl: string | null;
  createdAt: string;
  id: string;
  nickname: string;
  status: string;
  updatedAt: string;
  username: string;
}

export interface UserTaskItem {
  dueDate: string | null;
  id: string;
  priority: string;
  projectId: string;
  projectName: string;
  status: string;
  title: string;
  updatedAt: string;
}
