import { Transform } from 'class-transformer';
import { IsString, Length, ValidateIf } from 'class-validator';

export class AddIterationTaskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  taskId!: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  expectedIterationId?: string | null;
}
