import type { RequirementPriority, RequirementStatus } from '../requirement.constants';

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
  title: string;
  updatedAt: string;
}
