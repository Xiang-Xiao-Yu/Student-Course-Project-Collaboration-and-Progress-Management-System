import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
