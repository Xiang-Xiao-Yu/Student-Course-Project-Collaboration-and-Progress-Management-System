import { IsIn, IsString, MaxLength, ValidateIf } from 'class-validator';

import { TASK_STATUSES } from '../task.constants';
import type { TaskStatus } from '../task.constants';

export class UpdateTaskStatusDto {
  @IsIn(TASK_STATUSES)
  status!: TaskStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  completionNote?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  reopenReason?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}
