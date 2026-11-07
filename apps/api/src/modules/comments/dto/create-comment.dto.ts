import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';

import { COMMENT_TARGET_TYPES } from '../comment.constants';
import type { CommentTargetType } from '../comment.constants';

export class CreateCommentDto {
  @IsIn(COMMENT_TARGET_TYPES)
  targetType!: CommentTargetType;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  targetId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  content!: string;
}
