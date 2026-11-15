import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = dirname(fileURLToPath(import.meta.url));
const data = join(root, 'data');
mkdirSync(data, { recursive: true });
const database = join(data, 'app.sqlite');
if (!existsSync(database)) writeFileSync(database, '', { flag: 'wx' });
const probe = createServer();
await new Promise((done) => probe.listen(0, '127.0.0.1', done));
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const apiBase = `http://127.0.0.1:${port}/api/v1`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: 'file:' + database.replaceAll('\\', '/'),
  JWT_SECRET: randomBytes(48).toString('hex'),
  APP_HOST: '127.0.0.1',
  APP_PORT: String(port),
  JWT_EXPIRES_IN: '2h',
  CORS_ORIGINS: 'null',
  ELECTRON_API_BASE_URL: apiBase,
  ELECTRON_RENDERER_URL: '',
  LOG_LEVEL: 'error',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_FORCE_RENDERER_ACCESSIBILITY;
const binaryFolder = process.env.SCPC_BINARY_FOLDER || root;
const node = join(binaryFolder, 'runtime/node.exe');
const server = join(root, 'apps/api');
const sessionFile = join(data, 'last-session.json');
let api, desktop;
const children = new Set();
function start(args, cwd = server, executable = node) {
  const child = spawn(executable, args, {
    cwd,
    env,
    windowsHide: executable === node,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  children.add(child);
  child.once('close', () => children.delete(child));
  return child;
}
const closed = (child) =>
  new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', done);
  });
async function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  await closed(killer);
}
let closing = false;
async function cleanup() {
  if (closing) return;
  closing = true;
  for (const child of [...children]) await stop(child);
  writeFileSync(sessionFile, JSON.stringify({ status: 'stopped', port, apiBase }, null, 2));
}
process.once('SIGINT', () => {
  void cleanup().then(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void cleanup().then(() => process.exit(0));
});
try {
  const migration = start([
    join(server, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    join(server, 'prisma/schema.prisma'),
  ]);
  if ((await closed(migration)) !== 0)
    throw Error('数据库升级失败；已有数据保持原位，请使用交付说明排查。');
  const { PrismaClient } = createRequire(join(server, 'package.json'))('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    if ((await prisma.user.count()) === 0) {
      const password = process.env.SCPC_INITIAL_PASSWORD;
      if (!password || password.length < 8 || password.length > 128)
        throw Error('首次运行需要设置8～128位管理员密码。');
      const salt = randomBytes(16);
      const passwordHash = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
      await prisma.user.create({
        data: { username: 'admin', nickname: '项目管理员', passwordHash, isPlatformAdmin: true },
      });
    }
    writeFileSync(join(data, 'initialized'), 'initialized\n');
  } finally {
    await prisma.$disconnect();
  }
  delete env.SCPC_INITIAL_PASSWORD;
  delete process.env.SCPC_INITIAL_PASSWORD;
  api = start([join(server, 'dist/main.js')]);
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (api.exitCode !== null) break;
    try {
      healthy = (await fetch(apiBase + '/health', { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      /* bounded startup */
    }
    if (healthy) break;
    await delay(100);
  }
  if (!healthy) throw Error('服务启动失败，请保留 data 目录并重试。');
  writeFileSync(
    sessionFile,
    JSON.stringify({ status: 'ready', port, apiBase, pid: api.pid }, null, 2),
  );
  console.log('系统已启动。关闭桌面窗口后，服务会一同停止；数据保存在本便携目录的 data 文件夹。');
  if (process.env.SCPC_PORTABLE_TEST_MODE === '1') {
    await new Promise((done) => {
      process.stdin.once('data', done);
      process.stdin.once('end', done);
    });
  } else {
    desktop = start(
      ['--user-data-dir=' + join(data, 'client-profile')],
      join(binaryFolder, 'client'),
      join(binaryFolder, 'client/SCPC.exe'),
    );
    if ((await closed(desktop)) !== 0)
      throw Error('桌面客户端异常退出。请检查安装包版本及运行环境。');
  }
} catch (error) {
  console.error(
    [
      '首次运行需要设置8～128位管理员密码。',
      '数据库升级失败；已有数据保持原位，请使用交付说明排查。',
      '服务启动失败，请保留 data 目录并重试。',
      '桌面客户端异常退出。请检查安装包版本及运行环境。',
    ].includes(error.message)
      ? error.message
      : '启动失败，请检查目录权限及交付文件是否完整。',
  );
  process.exitCode = 1;
} finally {
  await cleanup();
}
