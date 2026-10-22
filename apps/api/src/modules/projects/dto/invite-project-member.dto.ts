import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';

export class InviteProjectMemberDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsIn(['MEMBER', 'OBSERVER'])
  role!: 'MEMBER' | 'OBSERVER';
}
