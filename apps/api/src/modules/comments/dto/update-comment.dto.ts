import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class UpdateCommentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  content!: string;
}
