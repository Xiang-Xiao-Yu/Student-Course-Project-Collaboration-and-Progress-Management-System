// Real Electron + isolated API smoke test for FR-01 AC-11.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(process.argv[2] ?? '');
const runtimeModules = process.argv[3];
const electronExe = process.argv[4];
const expectedHead = process.argv[5];
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: root,
  encoding: 'utf8',
});

if (!/^[a-f0-9]{40}$/.test(expectedHead ?? '') || head.stdout.trim() !== expectedHead) {
  throw new Error('HEAD does not match the requested base commit');
}

if (status.status !== 0) {
  throw new Error('Unable to inspect the worktree state');
}

const workingTreeDirty = status.stdout.trim().length > 0;

const require = createRequire(join(root, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const { _electron } = createRequire(join(runtimeModules, 'package.json'))('playwright');
const runDirectory = join(root, 'data', 'p1-avatar-e2e-' + Date.now());
mkdirSync(runDirectory, { recursive: true });
const databasePath = join(runDirectory, 'avatar.db');
writeFileSync(databasePath, '', { flag: 'wx' });

const environment = {
  ...process.env,
  APP_HOST: '127.0.0.1',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: 'file:' + databasePath.replaceAll(String.fromCharCode(92), '/'),
  JWT_EXPIRES_IN: '2h',
  JWT_SECRET: randomBytes(48).toString('hex'),
  NODE_ENV: 'test',
};
delete environment.ELECTRON_RUN_AS_NODE;

const prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
const results = [];
const network = [];
let uploadRequestCount = 0;
let apiProcess;
let electronApp;
let page;
let apiBaseUrl;

function check(condition, label) {
  if (!condition) throw new Error(label);
}

async function captureScreenshot(filename) {
  const options = {
    path: join(runDirectory, filename),
    animations: 'disabled',
    timeout: 15000,
  };
  await page.bringToFront();
  try {
    await page.screenshot(options);
  } catch {
    console.log('Retrying screenshot capture: ' + filename);
    await page.bringToFront();
    await page.screenshot(options);
  }
}

function runSetup(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
  });
  check(result.status === 0, 'Database migration failed');
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const content = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  content.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(content), 8 + data.length);
  return chunk;
}

function createOnePixelPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.from([0, 0x24, 0x69, 0xb4, 0xff]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', require('node:zlib').deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function runCase(name, operation) {
  await operation();
  results.push({ name, status: 'PASS' });
  console.log(name + ': PASS');
}

try {
  runSetup([
    join(root, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    'prisma/schema.prisma',
  ]);
  const port = await new Promise((done) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const value = probe.address().port;
      probe.close(() => done(value));
    });
  });
  apiBaseUrl = 'http://127.0.0.1:' + port + '/api/v1';
  apiProcess = spawn(process.execPath, ['dist/main.js'], {
    cwd: join(root, 'apps/api'),
    env: { ...environment, APP_PORT: String(port) },
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(apiBaseUrl + '/health')).ok) break;
    } catch {
      // Wait for the isolated API to become ready.
    }
    check(apiProcess.exitCode === null, 'API exited before readiness');
    await delay(100);
  }
  check(apiProcess.exitCode === null, 'API did not start');

  electronApp = await _electron.launch({
    executablePath: electronExe,
    args: [
      join(root, 'apps/desktop/out/main/index.js'),
      '--user-data-dir=' + join(runDirectory, 'electron-profile'),
    ],
    env: { ...environment, ELECTRON_API_BASE_URL: apiBaseUrl },
    timeout: 20000,
  });
  page = await electronApp.firstWindow();
  page.setDefaultTimeout(8000);
  page.on('dialog', (dialog) => void dialog.accept().catch(() => {}));
  async function checkWorkspaceAvatar(preview) {
    await page.getByRole('link', { name: '返回项目', exact: true }).click();
    const headerAvatar = page.locator('.user-chip__avatar img');
    await headerAvatar.waitFor();
    check((await headerAvatar.getAttribute('src')) === preview, 'Header shows a different avatar');
    await page.waitForFunction(() => {
      const image = globalThis.document.querySelector('.user-chip__avatar img');
      return (
        image instanceof globalThis.HTMLImageElement && image.complete && image.naturalWidth > 0
      );
    });
    await page.reload();
    await page.locator('.user-chip__avatar img').waitFor();
    check(
      (await page.locator('.user-chip__avatar img').getAttribute('src')) === preview,
      'Header lost the avatar after reload',
    );
    check(
      await page.evaluate(
        () => !globalThis.sessionStorage.getItem('scpc.auth.session')?.includes('data:image/'),
      ),
      'Avatar bytes were written into session storage',
    );
    await captureScreenshot('header-avatar.png');
    await page.getByRole('link', { name: '个人资料', exact: true }).click();
    await page.getByRole('button', { name: '保存资料', exact: true }).waitFor();
  }
  page.on('response', (response) => {
    if (response.url().startsWith(apiBaseUrl)) {
      network.push({
        method: response.request().method(),
        path: response.url().slice(apiBaseUrl.length),
        status: response.status(),
      });
    }
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === apiBaseUrl + '/users/me/avatar') {
      uploadRequestCount += 1;
    }
  });

  const username = 'avatar-' + Date.now();
  let password = randomBytes(16).toString('hex');
  await page.getByRole('link', { name: '注册', exact: true }).click();
  await page.getByRole('heading', { name: '注册', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('昵称', { exact: true }).fill('头像测试用户');
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).waitFor();
  await page.getByRole('link', { name: '个人资料', exact: true }).click();
  await page.getByRole('button', { name: '保存资料', exact: true }).waitFor();

  await runCase('Only the file picker is available for editing avatars', async () => {
    check((await page.locator('input[type="file"]').count()) === 1, 'Multiple file inputs found');
    check(
      (await page.getByText('或输入头像 URL', { exact: true }).count()) === 0 &&
        (await page.getByPlaceholder('https://example.com/avatar.png').count()) === 0,
      'The removed avatar URL editor is still visible',
    );
    check(
      (await page.getByRole('button', { name: '上传头像', exact: true }).count()) === 0,
      'The removed manual upload button is still visible',
    );
  });

  await runCase('Canceling the native file chooser leaves the avatar unchanged', async () => {
    const requestsBefore = uploadRequestCount;
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByLabel('选择头像图片', { exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles([]);
    check(uploadRequestCount === requestsBefore, 'Canceling the picker started an upload');
    check(
      (await page.locator('img.avatar-preview').count()) === 0,
      'Cancel changed the avatar preview',
    );
  });

  let persistedReference;
  const png = createOnePixelPng();

  await runCase(
    'Selecting a file uploads once, preserves unsaved nickname and persists after reload and login',
    async () => {
      const requestsBefore = uploadRequestCount;
      await page.getByLabel('昵称', { exact: true }).fill('保存头像回归');
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByLabel('选择头像图片', { exact: true }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({ name: '../../avatar.jpg', mimeType: 'image/png', buffer: png });
      await page.getByText('头像已更新。', { exact: true }).waitFor();
      check(
        uploadRequestCount === requestsBefore + 1,
        'Selection did not trigger exactly one upload',
      );
      check(
        (await page.getByLabel('昵称', { exact: true }).inputValue()) === '保存头像回归',
        'Automatic upload discarded the unsaved nickname',
      );
      check(
        (await prisma.user.findUniqueOrThrow({ where: { username } })).nickname === '头像测试用户',
        'Automatic upload unexpectedly saved the nickname',
      );
      await page.getByRole('button', { name: '保存资料', exact: true }).click();
      await page.getByText('个人资料已更新。', { exact: true }).waitFor();
      check(
        (await page.locator('.avatar-editor__filename').count()) === 0,
        'Automatic upload left a pending filename',
      );
      check(
        uploadRequestCount === requestsBefore + 1,
        'Saving the nickname uploaded the image again',
      );
      const preview = await page.locator('img.avatar-preview').getAttribute('src');
      check(
        preview === 'data:image/png;base64,' + png.toString('base64'),
        'Uploaded preview does not match file bytes',
      );

      const user = await prisma.user.findUniqueOrThrow({ where: { username } });
      check(user.nickname === '保存头像回归', 'Saving the avatar lost the nickname change');
      persistedReference = user.avatarUrl;
      check(
        user.avatarUrl?.startsWith('uploaded:') && user.avatarUrl.endsWith('.png'),
        'Server did not generate an opaque avatar key',
      );
      const storedBytes = await readFile(
        join(root, 'data/avatars', user.id, user.avatarUrl.slice('uploaded:'.length)),
      );
      check(storedBytes.equals(png), 'Server stored different image bytes');
      await checkWorkspaceAvatar(preview);
      await captureScreenshot('avatar-upload-success.png');

      await page.reload();
      await page.getByRole('button', { name: '保存资料', exact: true }).waitFor();
      check(
        (await page.locator('img.avatar-preview').getAttribute('src')) === preview,
        'Avatar did not persist after reload',
      );
      await page.getByRole('button', { name: '保存资料', exact: true }).click();
      await page.getByText('个人资料已更新。', { exact: true }).waitFor();
      check(
        (await prisma.user.findUniqueOrThrow({ where: { username } })).avatarUrl ===
          persistedReference,
        'Saving without a new file cleared the persisted avatar',
      );
      check(uploadRequestCount === requestsBefore + 1, 'Repeated save uploaded the avatar again');
      await page.getByRole('button', { name: '退出', exact: true }).click();
      await page.getByLabel('用户名', { exact: true }).fill(username);
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByRole('link', { name: '个人资料', exact: true }).click();
      await page.getByRole('button', { name: '保存资料', exact: true }).waitFor();
      await checkWorkspaceAvatar(preview);
      check(
        (await page.locator('img.avatar-preview').getAttribute('src')) === preview,
        'Avatar did not persist after logging in again',
      );
      check(
        network.some(
          (entry) =>
            entry.method === 'POST' && entry.path === '/users/me/avatar' && entry.status === 200,
        ),
        'Upload route did not return HTTP 200',
      );
    },
  );

  await runCase('The camera button opens the picker and the selected avatar uploads', async () => {
    const requestsBefore = uploadRequestCount;
    const oldPreview = await page.locator('img.avatar-preview').getAttribute('src');
    const camera = page.getByRole('button', { name: '选择头像文件', exact: true });
    const cancelChooserPromise = page.waitForEvent('filechooser');
    await camera.click();
    await (await cancelChooserPromise).setFiles([]);
    check(
      (await page.locator('img.avatar-preview').getAttribute('src')) === oldPreview,
      'Canceling the camera picker changed the saved avatar',
    );
    check(uploadRequestCount === requestsBefore, 'Canceling the camera picker triggered upload');
    const chooserPromise = page.waitForEvent('filechooser');
    await camera.focus();
    await camera.press('Enter');
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'separate-upload.png', mimeType: 'image/png', buffer: png });
    await page.getByText('头像已更新。', { exact: true }).waitFor();
    check(uploadRequestCount === requestsBefore + 1, 'Camera selection uploaded more than once');
    const user = await prisma.user.findUniqueOrThrow({ where: { username } });
    check(user.avatarUrl !== persistedReference, 'Separate upload did not replace the stored file');
    persistedReference = user.avatarUrl;
    check(
      (await page.locator('img.avatar-preview').getAttribute('src')) ===
        'data:image/png;base64,' + png.toString('base64'),
      'Separate upload lost the avatar preview',
    );
    await checkWorkspaceAvatar('data:image/png;base64,' + png.toString('base64'));
  });

  await runCase('Unsupported, empty and oversized files are refused before upload', async () => {
    const oldPreview = await page.locator('img.avatar-preview').getAttribute('src');
    const requestsBefore = uploadRequestCount;
    const invalidFiles = [
      {
        name: 'unsupported.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg/>'),
        message: '请选择 JPEG、PNG 或 WebP 图片。',
      },
      {
        name: 'empty.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(0),
        message: '所选图片为空文件。',
      },
      {
        name: 'large.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
        message: '头像图片不能超过 10 MiB。',
      },
    ];
    for (const { message, ...file } of invalidFiles) {
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '选择头像文件', exact: true }).click();
      await (await chooserPromise).setFiles(file);
      await page.getByText(message, { exact: true }).waitFor();
      check(
        (await page.locator('img.avatar-preview').getAttribute('src')) === oldPreview,
        'Invalid file changed the saved preview',
      );
      check(
        await page.getByRole('button', { name: '选择头像文件', exact: true }).isEnabled(),
        'Invalid file left the picker disabled',
      );
    }
    check(uploadRequestCount === requestsBefore, 'Invalid files reached the upload API');
  });

  await runCase('Automatic upload during a network failure preserves the old avatar', async () => {
    const previousPreview = await page.locator('img.avatar-preview').getAttribute('src');
    const userBeforeFailure = await prisma.user.findUniqueOrThrow({ where: { username } });
    const uploadUrl = apiBaseUrl + '/users/me/avatar';
    const requestsBeforeFailure = network.length;
    let controlsDisabled = false;
    await page.route(uploadUrl, async (route) => {
      try {
        await page.waitForFunction(() => {
          const selectors = [
            'button[aria-label="选择头像文件"]',
            'input[type="file"]',
            '.profile-form button[type="submit"]',
          ];
          return selectors.every(
            (selector) => globalThis.document.querySelector(selector)?.disabled,
          );
        });
        controlsDisabled = true;
      } catch {
        controlsDisabled = false;
      }
      await route.abort();
    });
    try {
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByLabel('选择头像图片', { exact: true }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: 'replacement.png',
        mimeType: 'image/png',
        buffer: createOnePixelPng(),
      });
      await page.getByText('无法连接到服务，请检查网络后重试。', { exact: true }).waitFor();
      check(controlsDisabled, 'Avatar controls remained active while the upload was pending');
      check(
        (await page.locator('img.avatar-preview').getAttribute('src')) === previousPreview,
        'Network failure changed the avatar preview',
      );
      const userAfterFailure = await prisma.user.findUniqueOrThrow({ where: { username } });
      check(
        userAfterFailure.avatarUrl === userBeforeFailure.avatarUrl,
        'Network failure changed the stored avatar',
      );
      check(
        !network.slice(requestsBeforeFailure).some((entry) => entry.method === 'PATCH'),
        'Saving continued after the avatar upload failed',
      );
    } finally {
      await page.unroute(uploadUrl);
    }
  });

  await runCase(
    'A damaged PNG with a valid signature is rejected before upload and preserves the old avatar',
    async () => {
      const requestsBefore = uploadRequestCount;
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByLabel('选择头像图片', { exact: true }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: 'fake.png',
        mimeType: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      });
      await page.getByText('图片内容已损坏或无法识别，请重新选择。', { exact: true }).waitFor();
      check(uploadRequestCount === requestsBefore, 'The damaged PNG reached the upload API');
      check(
        (await page.locator('img.avatar-preview').getAttribute('src')) ===
          'data:image/png;base64,' + png.toString('base64'),
        'Failed upload changed the old preview',
      );
      check(
        (await page.locator('.avatar-editor__filename').count()) === 0,
        'Rejected file remained selected',
      );
      const user = await prisma.user.findUniqueOrThrow({ where: { username } });
      check(user.avatarUrl === persistedReference, 'Failed upload changed the stored avatar');
      await captureScreenshot('avatar-upload-rejected.png');
    },
  );
  await runCase('Password change rotates the session and preserves the saved avatar', async () => {
    const oldToken = await page.evaluate(
      () => JSON.parse(globalThis.sessionStorage.getItem('scpc.auth.session')).accessToken,
    );
    const nextPassword = randomBytes(16).toString('hex');
    await page.getByLabel('当前密码', { exact: true }).fill(password);
    await page.getByLabel('新密码', { exact: true }).fill(nextPassword);
    await page.getByLabel('确认新密码', { exact: true }).fill(nextPassword);
    await page.getByRole('button', { name: '更新密码', exact: true }).click();
    await page.getByText('密码已更新，当前会话已刷新。', { exact: true }).waitFor();
    const nextToken = await page.evaluate(
      () => JSON.parse(globalThis.sessionStorage.getItem('scpc.auth.session')).accessToken,
    );
    check(nextToken !== oldToken, 'Password change did not rotate the session token');
    check(
      (await fetch(apiBaseUrl + '/users/me', { headers: { Authorization: 'Bearer ' + oldToken } }))
        .status === 401,
      'The old session remained usable after changing the password',
    );
    check(
      (await fetch(apiBaseUrl + '/users/me', { headers: { Authorization: 'Bearer ' + nextToken } }))
        .status === 200,
      'The new session cannot query the profile',
    );
    await page.getByRole('button', { name: '退出', exact: true }).click();
    await page.getByLabel('用户名', { exact: true }).fill(username);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByText('用户名或密码错误', { exact: true }).waitFor();
    password = nextPassword;
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('link', { name: '个人资料', exact: true }).click();
    await page.getByRole('button', { name: '保存资料', exact: true }).waitFor();
    await checkWorkspaceAvatar('data:image/png;base64,' + png.toString('base64'));
  });

  await runCase(
    'Switching to an account without an avatar clears the previous header image',
    async () => {
      await page.getByRole('button', { name: '退出', exact: true }).click();
      const otherUsername = 'other-' + Date.now();
      await page.getByRole('link', { name: '注册', exact: true }).click();
      await page.getByRole('heading', { name: '注册', exact: true }).waitFor();
      await page.getByLabel('用户名', { exact: true }).fill(otherUsername);
      await page.getByLabel('昵称', { exact: true }).fill('隔离测试');
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByLabel('确认密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '注册', exact: true }).click();
      await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
      await page.getByLabel('用户名', { exact: true }).fill(otherUsername);
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByRole('link', { name: '个人资料', exact: true }).click();
      await page.getByRole('button', { name: '保存资料', exact: true }).waitFor();
      await page.getByRole('link', { name: '返回项目', exact: true }).click();
      check(
        (await page.locator('.user-chip__avatar img').count()) === 0,
        'The new account inherited the previous avatar',
      );
      check(
        (await page.locator('.user-chip__avatar').textContent()) === '隔',
        'An account without an avatar did not show its own initials',
      );
    },
  );
} catch (error) {
  console.log('HARNESS: FAIL ' + error.message.split('\n')[0].slice(0, 140));
  console.log(error.message.split('\n').slice(1, 6).join('\n'));
  if (page) {
    console.log('Failure page: ' + (await page.locator('body').innerText()).slice(0, 650));
    await captureScreenshot('failure.png').catch(() => {});
  }
  results.push({
    name: 'HARNESS',
    status: 'FAIL',
    reason: error.message.split('\n')[0].slice(0, 140),
  });
} finally {
  if (electronApp) {
    await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
  if (apiProcess && apiProcess.exitCode === null) {
    await new Promise((done) => {
      apiProcess.once('exit', done);
      apiProcess.kill();
    });
  }
  await prisma.$disconnect();
  writeFileSync(
    join(runDirectory, 'avatar-upload-results.json'),
    JSON.stringify(
      { baseCommit: expectedHead, workingTreeDirty, cases: results, network },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      runDirectory,
      passed: results.filter((result) => result.status === 'PASS').length,
      failed: results.filter((result) => result.status === 'FAIL').length,
    }),
  );
  if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
}
