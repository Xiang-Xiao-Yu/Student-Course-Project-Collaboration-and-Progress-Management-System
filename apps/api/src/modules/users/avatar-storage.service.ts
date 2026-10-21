import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';

import { AppException } from '../../common/errors/app.exception';

export const MAX_AVATAR_UPLOAD_BYTES = 10 * 1024 * 1024;
export const SERVER_AVATAR_PREFIX = 'uploaded:';

export interface AvatarUploadFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
}

interface DetectedImage {
  readonly extension: 'jpg' | 'png' | 'webp';
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

const avatarRoot = resolve(__dirname, '../../../../../data/avatars');
const storedAvatarPattern =
  /^uploaded:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i;
const safeUserIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectImage(buffer: Buffer): DetectedImage | null {
  if (buffer.length >= pngSignature.length && buffer.subarray(0, 8).equals(pngSignature)) {
    return { extension: 'png', mimeType: 'image/png' };
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { extension: 'webp', mimeType: 'image/webp' };
  }

  return null;
}

function getUserDirectory(userId: string, root = avatarRoot): string {
  if (!safeUserIdPattern.test(userId)) {
    throw new AppException(
      HttpStatus.UNAUTHORIZED,
      'AUTH_SESSION_EXPIRED',
      '登录会话已失效，请重新登录',
    );
  }

  const resolvedRoot = resolve(root);
  const userDirectory = resolve(resolvedRoot, userId);

  if (!userDirectory.startsWith(`${resolvedRoot}${sep}`)) {
    throw new AppException(HttpStatus.BAD_REQUEST, 'AVATAR_INVALID_FILE', '头像文件无效');
  }

  return userDirectory;
}

function getStoredFilename(reference: string): string | null {
  const match = storedAvatarPattern.exec(reference);
  return match ? basename(`${match[1]}.${match[2]}`) : null;
}

@Injectable()
export class AvatarStorageService {
  async store(userId: string, file: AvatarUploadFile, storageRoot = avatarRoot): Promise<string> {
    const detectedImage = detectImage(file.buffer);

    if (
      file.buffer.length === 0 ||
      file.buffer.length > MAX_AVATAR_UPLOAD_BYTES ||
      file.size !== file.buffer.length ||
      !detectedImage ||
      (file.mimetype !== '' && file.mimetype !== detectedImage.mimeType)
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'AVATAR_INVALID_FILE',
        '请选择有效的 JPEG、PNG 或 WebP 图片（不超过 10 MiB）',
      );
    }

    const userDirectory = getUserDirectory(userId, storageRoot);
    const fileId = randomUUID();
    const filename = `${fileId}.${detectedImage.extension}`;
    const storedReference = `${SERVER_AVATAR_PREFIX}${filename}`;
    const targetPath = join(userDirectory, filename);
    const temporaryPath = join(userDirectory, `.tmp-${fileId}`);

    try {
      await mkdir(userDirectory, { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, file.buffer, { flag: 'wx', mode: 0o600 });
      await rename(temporaryPath, targetPath);
      return storedReference;
    } catch {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'AVATAR_STORAGE_FAILED',
        '头像保存失败，请稍后重试',
      );
    }
  }

  async toDataUrl(
    userId: string,
    avatarUrl: string | null,
    storageRoot = avatarRoot,
  ): Promise<string | null> {
    if (!avatarUrl?.startsWith(SERVER_AVATAR_PREFIX)) {
      return avatarUrl;
    }

    const filename = getStoredFilename(avatarUrl);

    if (!filename) {
      return null;
    }

    const userDirectory = getUserDirectory(userId, storageRoot);

    try {
      const buffer = await readFile(join(userDirectory, filename));
      const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
      const mimeType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }

      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'AVATAR_STORAGE_FAILED',
        '头像读取失败，请稍后重试',
      );
    }
  }

  async remove(userId: string, avatarUrl: string | null, storageRoot = avatarRoot): Promise<void> {
    if (!avatarUrl?.startsWith(SERVER_AVATAR_PREFIX)) {
      return;
    }

    const filename = getStoredFilename(avatarUrl);

    if (!filename) {
      return;
    }

    await rm(join(getUserDirectory(userId, storageRoot), filename), { force: true });
  }
}
