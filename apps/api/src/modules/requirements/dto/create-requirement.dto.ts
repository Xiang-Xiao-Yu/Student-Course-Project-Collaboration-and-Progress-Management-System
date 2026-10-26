import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

import { REQUIREMENT_PRIORITIES } from '../requirement.constants';
import type { RequirementPriority } from '../requirement.constants';

export class CreateRequirementDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  title!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsIn(REQUIREMENT_PRIORITIES)
  priority!: RequirementPriority;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 5000)
  acceptanceCriteria!: string;
}
