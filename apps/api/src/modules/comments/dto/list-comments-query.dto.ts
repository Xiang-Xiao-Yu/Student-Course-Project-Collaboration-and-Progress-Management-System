import { IsIn, IsString, Length } from 'class-validator';

import { COMMENT_TARGET_TYPES } from '../comment.constants';
import type { CommentTargetType } from '../comment.constants';

export class ListCommentsQueryDto {
  @IsIn(COMMENT_TARGET_TYPES)
  targetType!: CommentTargetType;

  @IsString()
  @Length(1, 64)
  targetId!: string;
}
