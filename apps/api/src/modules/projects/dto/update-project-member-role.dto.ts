import { IsIn } from 'class-validator';

import { PROJECT_ROLES } from '../project.constants';
import type { ProjectRole } from '../project.constants';

export class UpdateProjectMemberRoleDto {
  @IsIn(PROJECT_ROLES)
  role!: ProjectRole;
}
