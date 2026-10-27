import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ListActivityQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  targetType?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  targetId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
