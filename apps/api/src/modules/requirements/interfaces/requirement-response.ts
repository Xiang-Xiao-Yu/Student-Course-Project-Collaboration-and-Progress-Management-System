import type { RequirementPriority, RequirementStatus } from '../requirement.constants';

export interface RequirementTaskSummary {
  assigneeId: string | null;
  id: string;
  status: string;
  title: string;
}

export interface RequirementResponse {
  acceptanceCriteria: string;
  createdAt: string;
  creatorId: string;
  description: string | null;
  id: string;
  number: string;
  priority: RequirementPriority;
  projectId: string;
  status: RequirementStatus;
  tasks: RequirementTaskSummary[];
  title: string;
  updatedAt: string;
}
