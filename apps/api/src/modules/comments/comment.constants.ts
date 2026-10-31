export const COMMENT_TARGET_TYPES = ['REQUIREMENT', 'TASK', 'MEETING'] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];
