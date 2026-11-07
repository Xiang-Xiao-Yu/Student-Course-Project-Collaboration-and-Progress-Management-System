import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

import { ITERATION_STATUSES } from '../iteration.constants';
import type { IterationStatus } from '../iteration.constants';

export class UpdateIterationDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  goal?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({ strict: true })
  startDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({ strict: true })
  endDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(ITERATION_STATUSES)
  status?: IterationStatus;
}
