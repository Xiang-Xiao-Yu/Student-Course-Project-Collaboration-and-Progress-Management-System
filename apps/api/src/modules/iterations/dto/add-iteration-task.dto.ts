import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class AddIterationTaskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  taskId!: string;
}
