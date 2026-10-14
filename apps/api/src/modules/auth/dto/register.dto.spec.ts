import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  it('trims valid username and nickname', async () => {
    const dto = plainToInstance(RegisterDto, {
      nickname: '  示例用户  ',
      password: 'password123',
      username: '  student01  ',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.username).toBe('student01');
    expect(dto.nickname).toBe('示例用户');
  });

  it('rejects a password shorter than eight characters', async () => {
    const dto = plainToInstance(RegisterDto, {
      nickname: '示例用户',
      password: 'short',
      username: 'student01',
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('rejects whitespace-only identity fields', async () => {
    const dto = plainToInstance(RegisterDto, {
      nickname: '   ',
      password: 'password123',
      username: '   ',
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'username')).toBe(true);
    expect(errors.some((error) => error.property === 'nickname')).toBe(true);
  });
});
