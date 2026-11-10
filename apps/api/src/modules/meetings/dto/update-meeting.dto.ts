import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

function trimStringArray(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => (typeof item === 'string' ? item.trim() : item));
}

export class UpdateMeetingDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 120)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({ strict: true })
  scheduledAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  agenda?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  minutes?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  decisions?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => trimStringArray(value))
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  participantIds?: string[];
}
