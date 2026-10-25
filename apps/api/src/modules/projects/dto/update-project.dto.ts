import { Transform } from 'class-transformer';
import { IsDateString, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProjectDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 100)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  startDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  endDate?: string;
}
