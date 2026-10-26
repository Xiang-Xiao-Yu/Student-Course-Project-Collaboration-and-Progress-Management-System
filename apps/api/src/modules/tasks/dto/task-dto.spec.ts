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
});
