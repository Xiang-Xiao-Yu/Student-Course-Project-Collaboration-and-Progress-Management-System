export const ITERATION_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const;
export type IterationStatus = (typeof ITERATION_STATUSES)[number];

export const ITERATION_STATUS_TRANSITIONS: Readonly<
  Record<IterationStatus, readonly IterationStatus[]>
> = {
  NOT_STARTED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELED'],
  COMPLETED: [],
  CANCELED: [],
};
