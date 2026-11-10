export const MEETING_ACTION_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const;
export type MeetingActionStatus = (typeof MEETING_ACTION_STATUSES)[number];
