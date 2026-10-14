import { describe, expect, it } from 'vitest';

import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const hasher = new PasswordHasherService();

  it('hashes and verifies a password without storing plaintext', async () => {
    const password = 'password123';
    const hash = await hasher.hash(password);

    expect(hash).not.toContain(password);
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(hasher.verify(password, hash)).resolves.toBe(true);
  });

  it('generates a distinct salt for each hash', async () => {
    const first = await hasher.hash('password123');
    const second = await hasher.hash('password123');

    expect(first).not.toBe(second);
  });

  it('rejects a wrong password or malformed hash', async () => {
    const hash = await hasher.hash('password123');

    await expect(hasher.verify('wrong-password', hash)).resolves.toBe(false);
    await expect(hasher.verify('password123', 'not-a-valid-hash')).resolves.toBe(false);
  });
});
