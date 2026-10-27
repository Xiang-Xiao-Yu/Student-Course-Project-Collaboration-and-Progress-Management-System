import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

import { REQUIREMENT_PRIORITIES, REQUIREMENT_STATUSES } from '../requirement.constants';
import type { RequirementPriority, RequirementStatus } from '../requirement.constants';

export class UpdateRequirementDto {
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
  @IsIn(REQUIREMENT_PRIORITIES)
  priority?: RequirementPriority;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 5000)
  acceptanceCriteria?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(REQUIREMENT_STATUSES)
  status?: RequirementStatus;
}
