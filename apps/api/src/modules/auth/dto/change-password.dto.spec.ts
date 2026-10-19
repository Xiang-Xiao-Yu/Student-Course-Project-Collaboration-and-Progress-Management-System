import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ChangePasswordDto } from './change-password.dto';

describe('ChangePasswordDto', () => {
  it('accepts valid current and new passwords', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a new password shorter than eight characters', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'old-password',
      newPassword: 'short',
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });
});
