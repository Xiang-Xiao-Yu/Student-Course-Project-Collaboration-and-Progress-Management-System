import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

import { TASK_PRIORITIES, type TaskPriority } from '../../tasks/task.constants';

export class ConvertMeetingActionDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  requirementId?: string;
}
