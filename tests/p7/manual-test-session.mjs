// Disposable manual-test environment. Password comes only from the caller's environment.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = resolve(process.argv[2] ?? root);
const smoke = process.argv.includes('--smoke');
const password = process.env.P7_MANUAL_PASSWORD;
assert(typeof password === 'string' && password.length >= 8, '请先设置至少8位的测试密码');
delete process.env.P7_MANUAL_PASSWORD;
const electronExe = join(source, 'apps/desktop/node_modules/electron/dist/electron.exe');
for (const file of [
  electronExe,
  join(source, 'apps/api/dist/main.js'),
  join(source, 'apps/desktop/out/main/index.js'),
])
  assert(existsSync(file), '请先完成独立测试源码的安装和构建');
const directory = join(root, 'tmp/final-full-2026-11-12', `manual-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const database = join(directory, 'manual.sqlite');
writeFileSync(database, '', { flag: 'wx' });
const probe = createServer();
await new Promise((done) => probe.listen(0, '127.0.0.1', done));
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  APP_HOST: '127.0.0.1',
  APP_PORT: String(port),
  DATABASE_URL: 'file:' + database.replaceAll('\\', '/'),
  JWT_SECRET: randomBytes(48).toString('hex'),
  JWT_EXPIRES_IN: '2h',
  CORS_ORIGINS: 'null,http://localhost:5173',
  LOG_LEVEL: 'error',
  ELECTRON_RENDERER_URL: '',
  ELECTRON_API_BASE_URL: `http://127.0.0.1:${port}/api/v1`,
};
delete env.ELECTRON_RUN_AS_NODE;
const { PrismaClient } = createRequire(join(source, 'package.json'))('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const children = [];
let terminal;
async function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  await new Promise((done) => {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    killer.once('close', done);
    killer.once('error', () => {
      child.kill();
      done();
    });
  });
}
async function cleanup() {
  for (const child of [...children].reverse()) await stop(child);
  await prisma.$disconnect();
  terminal?.close();
}
async function client() {
  // This visible window is the interface the user requested for manual testing.
  const child = spawn(
    electronExe,
    [
      join(source, 'apps/desktop/out/main/index.js'),
      '--user-data-dir=' + join(directory, 'profile-' + children.length),
    ],
    { cwd: source, env, windowsHide: true, stdio: 'ignore' },
  );
  children.push(child);
}
try {
  const migration = spawn(
    process.execPath,
    [
      join(source, 'node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      join(source, 'prisma/schema.prisma'),
    ],
    { cwd: source, env, windowsHide: true, stdio: 'ignore' },
  );
  assert.equal(
    await new Promise((done, fail) => {
      migration.once('error', fail);
      migration.once('close', done);
    }),
    0,
    '测试库迁移失败',
  );
  const salt = randomBytes(16);
  const passwordHash = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
  for (const [id, nickname] of [
    ['admin', '平台管理员'],
    ['owner', '项目负责人'],
    ['member', '项目成员'],
    ['observer', '观察者'],
    ['other', '非成员'],
  ])
    await prisma.user.create({
      data: {
        id: 'manual-' + id,
        username: 'manual_' + id,
        nickname: '人工测试' + nickname,
        passwordHash,
        isPlatformAdmin: id === 'admin',
      },
    });
  for (const [id, name] of [
    ['normal', '人工测试普通项目'],
    ['capacity', '人工测试万任务项目'],
  ]) {
    await prisma.project.create({
      data: {
        id: 'manual-' + id,
        name,
        ownerId: 'manual-owner',
        status: 'ACTIVE',
        startDate: new Date('2026-11-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    await prisma.projectMember.createMany({
      data: [
        ['owner', 'OWNER'],
        ['member', 'MEMBER'],
        ['observer', 'OBSERVER'],
      ].map(([user, role]) => ({ projectId: 'manual-' + id, userId: 'manual-' + user, role })),
    });
  }
  for (let offset = 0; offset < 10000; offset += 1000)
    await prisma.task.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({
        projectId: 'manual-capacity',
        createdById: 'manual-owner',
        assigneeId: 'manual-member',
        title: 'capacity-' + String(offset + i).padStart(5, '0'),
        status: 'TODO',
      })),
    });
  const api = spawn(process.execPath, [join(source, 'apps/api/dist/main.js')], {
    cwd: join(source, 'apps/api'),
    env,
    windowsHide: true,
    stdio: 'ignore',
  });
  children.push(api);
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    try {
      healthy = (
        await fetch(env.ELECTRON_API_BASE_URL + '/health', { signal: AbortSignal.timeout(1000) })
      ).ok;
    } catch {
      /* Wait for this isolated API only. */
    }
    if (healthy) break;
    assert.equal(api.exitCode, null, '测试服务启动失败');
    await delay(100);
  }
  assert(healthy, '测试服务未就绪');
  writeFileSync(
    join(directory, 'session.json'),
    JSON.stringify(
      {
        baseline: '0932ae204533ec50ec0237b81a2343e39e15dd43',
        source,
        database,
        api: env.ELECTRON_API_BASE_URL,
        accounts: [
          'manual_admin',
          'manual_owner',
          'manual_member',
          'manual_observer',
          'manual_other',
        ],
        disposable: true,
      },
      null,
      2,
    ),
  );
  if (smoke) {
    for (const username of [
      'manual_admin',
      'manual_owner',
      'manual_member',
      'manual_observer',
      'manual_other',
    ]) {
      const response = await fetch(env.ELECTRON_API_BASE_URL + '/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      assert.equal(response.status, 200);
    }
    console.log(
      JSON.stringify({
        smoke: 'PASS',
        accounts: 5,
        capacityTasks: await prisma.task.count({ where: { projectId: 'manual-capacity' } }),
        session: join(directory, 'session.json'),
      }),
    );
  } else {
    console.log(
      '人工测试环境已启动。账号：manual_admin / manual_owner / manual_member / manual_observer / manual_other；密码均为刚才设置的测试密码。',
    );
    console.log('测试资料保存在：' + directory);
    console.log(
      '每次启动创建全新测试库；本次窗口内刷新、退出重登均保留数据。结束前请保存测试记录。',
    );
    await client();
    terminal = createInterface({ input: process.stdin, output: process.stdout });
    while (true) {
      const answer = (await terminal.question('输入 n 打开另一客户端，输入 q 结束本轮测试：'))
        .trim()
        .toLowerCase();
      if (answer === 'q') break;
      if (answer === 'n') await client();
    }
  }
} catch {
  console.error('人工测试环境准备失败，请核对独立源码的依赖、构建和运行文件；未修改现有业务库。');
  process.exitCode = 1;
} finally {
  await cleanup();
}
