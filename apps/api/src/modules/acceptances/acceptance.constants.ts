export const ACCEPTANCE_RESULTS = ['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED'] as const;
export type AcceptanceResult = (typeof ACCEPTANCE_RESULTS)[number];
