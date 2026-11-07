import type { IterationStatus } from '../iteration.constants';
import type { TaskStatus } from '../../tasks/task.constants';

export interface IterationTaskSummary {
  completedAt: string | null;
  dueDate: string | null;
  id: string;
  status: TaskStatus;
  title: string;
}

export interface IterationResponse {
  createdAt: string;
  endDate: string;
  goal: string | null;
  id: string;
  name: string;
  projectId: string;
  startDate: string;
  status: IterationStatus;
  taskCount: number;
  updatedAt: string;
}

export interface IterationDetailResponse extends IterationResponse {
  tasks: IterationTaskSummary[];
}

export interface IterationStatsResponse {
  blocked: number;
  completed: number;
  completionRate: number;
  inProgress: number;
  overdue: number;
  total: number;
}
