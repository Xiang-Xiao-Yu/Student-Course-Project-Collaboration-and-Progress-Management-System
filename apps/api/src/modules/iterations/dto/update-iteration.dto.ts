import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { ITERATION_STATUSES } from '../iteration.constants';
import type { IterationStatus } from '../iteration.constants';

export class UpdateIterationDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  goal?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @IsOptional()
  @IsIn(ITERATION_STATUSES)
  status?: IterationStatus;
}
