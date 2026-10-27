import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateTaskDto } from './create-task.dto';
import { UpdateTaskStatusDto } from './update-task-status.dto';
import { UpdateTaskDto } from './update-task.dto';

describe('task DTO validation', () => {
  it('validates a complete create payload', async () => {
    const dto = plainToInstance(CreateTaskDto, {
      dueDate: '2026-10-30',
      priority: 'HIGH',
      tagNames: [' backend ', 'api'],
      title: '任务标题',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.tagNames).toEqual(['backend', 'api']);
  });

  it('rejects null and invalid updater values', async () => {
    const dto = plainToInstance(UpdateTaskDto, {
      dueDate: null,
      priority: 'URGENT',
      title: null,
    });
    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(['dueDate', 'priority', 'title']));
  });

  it('rejects invalid status payload values', async () => {
    const dto = plainToInstance(UpdateTaskStatusDto, {
      status: 'DONE',
    });

    await expect(validate(dto)).resolves.toHaveProperty('length', 1);
  });

  it.each([
    ['create', CreateTaskDto],
    ['update', UpdateTaskDto],
  ] as const)('rejects null tags and empty relation IDs (%s)', async (_name, Dto) => {
    for (const field of ['tagNames', 'assigneeId', 'requirementId']) {
      const dto = plainToInstance(Dto, {
        title: '任务',
        priority: 'MEDIUM',
        [field]: field === 'tagNames' ? null : '   ',
      });
      expect((await validate(dto)).map((error) => error.property)).toContain(field);
    }
  });

  it.each([
    ['create', CreateTaskDto],
    ['update', UpdateTaskDto],
  ] as const)('rejects impossible calendar dates (%s)', async (_name, Dto) => {
    for (const dueDate of ['2026-02-31', '2026-04-31', '2025-02-29']) {
      const dto = plainToInstance(Dto, { title: '任务', priority: 'MEDIUM', dueDate });
      expect((await validate(dto)).map((error) => error.property)).toContain('dueDate');
    }
    const leapDay = plainToInstance(Dto, {
      title: '任务',
      priority: 'MEDIUM',
      dueDate: '2028-02-29',
    });
    expect(await validate(leapDay)).toHaveLength(0);
  });
});
