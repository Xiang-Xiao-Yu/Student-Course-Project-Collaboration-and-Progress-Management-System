export const REQUIREMENT_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];

export const REQUIREMENT_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'PENDING_ACCEPTANCE',
  'COMPLETED',
  'REJECTED',
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_STATUS_TRANSITIONS: Readonly<
  Record<RequirementStatus, readonly RequirementStatus[]>
> = {
  DRAFT: ['CONFIRMED'],
  CONFIRMED: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['PENDING_ACCEPTANCE'],
  PENDING_ACCEPTANCE: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};
