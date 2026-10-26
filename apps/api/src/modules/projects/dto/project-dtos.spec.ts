import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateProjectDto } from './create-project.dto';
import { UpdateProjectDto } from './update-project.dto';

describe('Project DTO null semantics', () => {
  it.each(['name', 'description', 'startDate', 'endDate'] as const)(
    'rejects null UpdateProjectDto.%s while omitted fields remain valid',
    async (field) => {
      const invalid = plainToInstance(UpdateProjectDto, { [field]: null });
      const valid = plainToInstance(UpdateProjectDto, { name: '课程项目' });

      await expect(validate(invalid)).resolves.not.toHaveLength(0);
      await expect(validate(valid)).resolves.toHaveLength(0);
    },
  );

  it.each(['description', 'startDate', 'endDate'] as const)(
    'rejects null CreateProjectDto.%s while omission and empty description are valid',
    async (field) => {
      const invalid = plainToInstance(CreateProjectDto, {
        name: '课程项目',
        [field]: null,
      });
      const omitted = plainToInstance(CreateProjectDto, { name: '课程项目' });
      const emptyDescription = plainToInstance(CreateProjectDto, {
        description: '',
        name: '课程项目',
      });

      await expect(validate(invalid)).resolves.not.toHaveLength(0);
      await expect(validate(omitted)).resolves.toHaveLength(0);
      await expect(validate(emptyDescription)).resolves.toHaveLength(0);
    },
  );
});
