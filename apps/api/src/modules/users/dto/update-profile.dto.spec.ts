import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  it('trims nickname and avatar URL', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      avatarUrl: '  https://example.com/avatar.png  ',
      nickname: '  新昵称  ',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.nickname).toBe('新昵称');
    expect(dto.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('treats an empty avatar URL as a clear operation', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      avatarUrl: '',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.avatarUrl).toBeNull();
  });

  it('rejects an empty nickname', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      nickname: '   ',
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'nickname')).toBe(true);
  });
});
