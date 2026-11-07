import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateIterationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  goal?: string;

  @IsDateString({ strict: true })
  startDate!: string;

  @IsDateString({ strict: true })
  endDate!: string;
}
