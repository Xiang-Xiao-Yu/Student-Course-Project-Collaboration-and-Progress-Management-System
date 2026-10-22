import { IsIn } from 'class-validator';

import { PROJECT_STATUSES } from '../project.constants';
import type { ProjectStatus } from '../project.constants';

export class UpdateProjectStatusDto {
  @IsIn(PROJECT_STATUSES)
  status!: ProjectStatus;
}
