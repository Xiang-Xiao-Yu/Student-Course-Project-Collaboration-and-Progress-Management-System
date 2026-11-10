import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { ACCEPTANCE_RESULTS, type AcceptanceResult } from '../acceptance.constants';

function trimStringArray(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => (typeof item === 'string' ? item.trim() : item));
}

export class UpdateAcceptanceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 100)
  stageName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  goal?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({ strict: true })
  acceptanceDate?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 5000)
  standards?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => trimStringArray(value))
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  participantIds?: string[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(ACCEPTANCE_RESULTS)
  result?: AcceptanceResult;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  failureReason?: string;
}
