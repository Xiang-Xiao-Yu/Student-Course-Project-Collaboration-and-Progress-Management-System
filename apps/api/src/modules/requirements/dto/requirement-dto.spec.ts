import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateRequirementDto } from './create-requirement.dto';
import { UpdateRequirementDto } from './update-requirement.dto';

describe('requirement DTO validation', () => {
  it('accepts a valid create payload', async () => {
    const dto = plainToInstance(CreateRequirementDto, {
      acceptanceCriteria: '必须可验收',
      priority: 'HIGH',
      title: '需求标题',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects null and invalid update values', async () => {
    const dto = plainToInstance(UpdateRequirementDto, {
      description: null,
      priority: 'URGENT',
      status: 'DONE',
      title: null,
    });
    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining(['description', 'priority', 'status', 'title']),
    );
  });
});
