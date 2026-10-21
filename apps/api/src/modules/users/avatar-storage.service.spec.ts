import { deflateSync } from 'node:zlib';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AvatarStorageService, MAX_AVATAR_UPLOAD_BYTES } from './avatar-storage.service';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const content = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  content.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(content), 8 + data.length);
  return chunk;
}

function createOnePixelPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const imageData = deflateSync(Buffer.from([0, 0x24, 0x69, 0xb4, 0xff]));

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', imageData),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('AvatarStorageService', () => {
  const storage = new AvatarStorageService();
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'scpc-avatar-storage-'));
  });

  afterAll(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('stores an actual PNG under a generated name and returns image data only for its owner', async () => {
    const userId = 'user-test-1';
    const buffer = createOnePixelPng();
    const reference = await storage.store(
      userId,
      { buffer, mimetype: 'image/png', size: buffer.length },
      root,
    );

    expect(reference).toMatch(/^uploaded:[0-9a-f-]{36}\.png$/);
    expect(await storage.toDataUrl(userId, reference, root)).toBe(
      `data:image/png;base64,${buffer.toString('base64')}`,
    );
    await expect(storage.toDataUrl('user-test-2', reference, root)).resolves.toBeNull();
    await expect(
      readFile(join(root, userId, reference.slice('uploaded:'.length))),
    ).resolves.toEqual(buffer);
    await storage.remove(userId, reference, root);
  });

  it('recognizes JPEG and WebP signatures and derives the stored extension from file content', async () => {
    const userId = 'user-format-test';
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const webp = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ');
    const jpegKey = await storage.store(
      userId,
      { buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length },
      root,
    );
    const webpKey = await storage.store(
      userId,
      { buffer: webp, mimetype: 'image/webp', size: webp.length },
      root,
    );

    expect(jpegKey).toMatch(/\.jpg$/);
    expect(webpKey).toMatch(/\.webp$/);
    expect(await storage.toDataUrl(userId, jpegKey, root)).toBe(
      'data:image/jpeg;base64,' + jpeg.toString('base64'),
    );
    expect(await storage.toDataUrl(userId, webpKey, root)).toBe(
      'data:image/webp;base64,' + webp.toString('base64'),
    );
    await storage.remove(userId, jpegKey, root);
    await storage.remove(userId, webpKey, root);
  });

  it('returns a safe error when the storage root cannot be used as a directory', async () => {
    const blockedRoot = join(root, 'blocked-storage-root');
    await writeFile(blockedRoot, 'regular-file-blocks-directory-creation');
    const buffer = createOnePixelPng();
    const attempt = storage.store(
      'user-storage-failure',
      { buffer, mimetype: 'image/png', size: buffer.length },
      blockedRoot,
    );

    await expect(attempt).rejects.toMatchObject({
      response: {
        code: 'AVATAR_STORAGE_FAILED',
        message: '头像保存失败，请稍后重试',
        details: null,
      },
    });
    await expect(attempt).rejects.not.toThrow(blockedRoot);
  });

  it('accepts exactly 10 MiB and rejects larger payloads', async () => {
    const userId = 'user-size-test';
    const png = createOnePixelPng();
    const atLimit = Buffer.concat([png, Buffer.alloc(MAX_AVATAR_UPLOAD_BYTES - png.length)]);
    const reference = await storage.store(
      userId,
      { buffer: atLimit, mimetype: 'image/png', size: atLimit.length },
      root,
    );
    await storage.remove(userId, reference, root);

    const tooLarge = Buffer.alloc(MAX_AVATAR_UPLOAD_BYTES + 1);
    png.copy(tooLarge);
    await expect(
      storage.store(
        userId,
        { buffer: tooLarge, mimetype: 'image/png', size: tooLarge.length },
        root,
      ),
    ).rejects.toMatchObject({ response: { code: 'AVATAR_INVALID_FILE' } });
  });

  it('rejects fake file content, mismatched MIME, and path-shaped user identifiers', async () => {
    const png = createOnePixelPng();
    const malformed = Buffer.from('not-an-image');

    await expect(
      storage.store(
        'user-test-1',
        { buffer: malformed, mimetype: 'image/png', size: malformed.length },
        root,
      ),
    ).rejects.toMatchObject({ response: { code: 'AVATAR_INVALID_FILE' } });
    await expect(
      storage.store('user-test-1', { buffer: png, mimetype: 'image/jpeg', size: png.length }, root),
    ).rejects.toMatchObject({ response: { code: 'AVATAR_INVALID_FILE' } });
    await expect(
      storage.store('../outside', { buffer: png, mimetype: 'image/png', size: png.length }, root),
    ).rejects.toMatchObject({ response: { code: 'AUTH_SESSION_EXPIRED' } });
  });
});
