import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsString, Length, ValidateIf } from 'class-validator';

import { MEETING_ACTION_STATUSES, type MeetingActionStatus } from '../meeting.constants';

export class UpdateMeetingActionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 100)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  assigneeId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({ strict: true })
  dueDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(MEETING_ACTION_STATUSES)
  status?: MeetingActionStatus;
}
