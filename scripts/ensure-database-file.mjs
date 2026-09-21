// P0 脚手架脚本：在执行 Prisma 迁移或种子命令前，确保本地 SQLite 目录和数据库文件存在。
//
// `DATABASE_URL=file:../data/app.db` 相对于 `prisma/schema.prisma` 解析为仓库根目录下的 `data/`。
// SQLite 迁移引擎不会自动补建缺失的目录，也不会自动创建缺失的数据库文件，
// 两种情况都会直接抛出 `Error: Schema engine error:`（无进一步提示），因此这里先补齐。
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(scriptDir, '..', 'data');
const databaseFile = resolve(dataDir, 'app.db');

mkdirSync(dataDir, { recursive: true });

if (!existsSync(databaseFile)) {
  // 0 字节文件是合法的空 SQLite 数据库，后续 Migration 会在其上执行。
  closeSync(openSync(databaseFile, 'w'));
  console.log('已创建本地空数据库：data/app.db');
}
