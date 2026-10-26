import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { TASK_PRIORITIES } from '../task.constants';
import type { TaskPriority } from '../task.constants';

function trimStringArray(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => (typeof item === 'string' ? item.trim() : item));
}

export class UpdateTaskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 100)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  assigneeId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  requirementId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  dueDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000)
  estimatedHours?: number;

  @IsOptional()
  @Transform(({ value }) => trimStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  tagNames?: string[];
}
