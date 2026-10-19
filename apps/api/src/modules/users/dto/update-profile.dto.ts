import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 50)
  nickname?: string;

  @Transform(({ value }) => {
    if (value === '') {
      return null;
    }

    return typeof value === 'string' ? value.trim() : value;
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string | null;
}
