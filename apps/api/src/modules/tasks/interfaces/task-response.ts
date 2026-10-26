import type { TaskPriority, TaskStatus } from '../task.constants';

export interface TaskResponse {
  assigneeId: string | null;
  completedAt: string | null;
  completionNote: string | null;
  createdAt: string;
  createdById: string;
  description: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  id: string;
  priority: TaskPriority;
  projectId: string;
  requirementId: string | null;
  status: TaskStatus;
  tagNames: string[];
  title: string;
  updatedAt: string;
}
