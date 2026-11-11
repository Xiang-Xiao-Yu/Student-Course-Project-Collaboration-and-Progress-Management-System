import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

export class ListRequirementsQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  search?: string;
}
