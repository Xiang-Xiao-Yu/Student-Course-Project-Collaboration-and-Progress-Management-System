import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const HASH_ALGORITHM = 'scrypt';
const HASH_KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, HASH_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = await deriveKey(password, salt);

    return `${HASH_ALGORITHM}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const [algorithm, saltHex, hashHex] = encodedHash.split('$');

    if (algorithm !== HASH_ALGORITHM || !saltHex || !hashHex) {
      return false;
    }

    try {
      const expectedHash = Buffer.from(hashHex, 'hex');
      const derivedKey = await deriveKey(password, Buffer.from(saltHex, 'hex'));

      return expectedHash.length === derivedKey.length && timingSafeEqual(expectedHash, derivedKey);
    } catch {
      return false;
    }
  }
}
