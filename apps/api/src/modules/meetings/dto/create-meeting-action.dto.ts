import { Transform } from 'class-transformer';
import { IsDateString, IsString, Length, ValidateIf } from 'class-validator';

export class CreateMeetingActionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  title!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  assigneeId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({ strict: true })
  dueDate?: string;
}
