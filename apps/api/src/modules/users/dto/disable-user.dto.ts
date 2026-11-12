import { IsString, Length } from 'class-validator';

export class DisableUserDto {
  @IsString()
  @Length(1, 100)
  confirmUsername!: string;
}
