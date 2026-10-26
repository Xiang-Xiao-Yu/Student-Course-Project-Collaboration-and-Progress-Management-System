import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateProjectDto } from './create-project.dto';
import { UpdateProjectDto } from './update-project.dto';

describe('project DTO null handling', () => {
  it('rejects null optional fields instead of silently skipping validation', async () => {
    const dto = plainToInstance(UpdateProjectDto, {
      description: null,
      endDate: null,
      name: null,
      startDate: null,
    });
    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining(['description', 'endDate', 'name', 'startDate']),
    );
  });

  it('keeps omitted optional fields valid', async () => {
    const updateDto = plainToInstance(UpdateProjectDto, {});
    const createDto = plainToInstance(CreateProjectDto, { name: '课程项目' });

    await expect(validate(updateDto)).resolves.toHaveLength(0);
    await expect(validate(createDto)).resolves.toHaveLength(0);
  });

  it('accepts legal values and rejects invalid dates', async () => {
    const validDto = plainToInstance(UpdateProjectDto, {
      description: '新描述',
      endDate: '2026-12-31',
      name: '新名称',
      startDate: '2026-10-01',
    });
    const invalidDto = plainToInstance(UpdateProjectDto, {
      endDate: 'not-a-date',
    });

    await expect(validate(validDto)).resolves.toHaveLength(0);
    await expect(validate(invalidDto)).resolves.toHaveProperty('length', 1);
  });
});
