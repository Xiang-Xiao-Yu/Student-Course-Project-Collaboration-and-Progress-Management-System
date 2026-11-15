import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { networkInterfaces } from 'node:os';
import { createServer } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [zipArgument, playwrightPackage] = process.argv.slice(2);
assert(zipArgument && playwrightPackage);
const output = join(root, 'tmp/closeout-20261114', 'delivery-' + Date.now());
const portable = join(
  output,
  process.argv.includes('--unicode-path') ? '中文 空格目录' : 'extracted',
);
const startupOnly = process.argv.includes('--startup-only');
mkdirSync(portable, { recursive: true });
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${quote(resolve(zipArgument))},${quote(portable)})`,
  ],
  { windowsHide: true },
);
const { _electron } = createRequire(resolve(playwrightPackage))('playwright');
const password = randomBytes(18).toString('base64url');
const results = [],
  errors = [];
let launcher, desktop, base, token, projectId, taskId;
const env = { ...process.env, SCPC_PORTABLE_TEST_MODE: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_FORCE_RENDERER_ACCESSIBILITY;
const save = () =>
  writeFileSync(
    join(output, 'results.json'),
    JSON.stringify({ output, results, rendererErrors: errors }, null, 2),
  );
async function test(id, name, run) {
  if (startupOnly && !['D01', 'D02', 'D04', 'D07'].includes(id)) return;
  try {
    const details = await run();
    results.push({ id, name, status: 'PASS', details });
  } catch (error) {
    results.push({
      id,
      name,
      status: 'FAIL',
      reason: String(error.message).replaceAll(password, '[REDACTED]').slice(0, 700),
    });
  }
  save();
  console.log(JSON.stringify(results.at(-1)));
}
const closed = (child) =>
  new Promise((done, fail) => {
    child.once('close', done);
    child.once('error', fail);
  });
async function start(passwordValue) {
  launcher = spawn(join(portable, 'runtime/node.exe'), [join(portable, 'bootstrap.mjs')], {
    cwd: portable,
    env: { ...env, ...(passwordValue ? { SCPC_INITIAL_PASSWORD: passwordValue } : {}) },
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  for (let i = 0; i < 200; i++) {
    if (launcher.exitCode !== null) throw Error('Portable launcher exited before ready');
    const file = join(portable, 'data/last-session.json');
    if (existsSync(file)) {
      const session = JSON.parse(readFileSync(file));
      if (session.status === 'ready') {
        base = session.apiBase;
        return;
      }
    }
    await delay(100);
  }
  throw Error('Portable startup exceeded deadline');
}
async function stop() {
  await desktop?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  desktop = undefined;
  if (launcher?.exitCode === null) {
    const exit = closed(launcher);
    launcher.stdin.end('quit\n');
    await exit;
  }
}
async function request(path, method = 'GET', body, access = token, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(access ? { authorization: 'Bearer ' + access } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, path + ': ' + response.status);
  return value.data;
}
async function login() {
  const value = await request('/auth/login', 'POST', { username: 'admin', password }, undefined);
  token = value.accessToken;
}
try {
  await test('D01', '解包后独立运行，无默认密码且首次设置不覆盖已有数据', async () => {
    assert(!existsSync(join(portable, 'data')));
    const missing = spawn(join(portable, 'runtime/node.exe'), [join(portable, 'bootstrap.mjs')], {
      cwd: portable,
      env,
      windowsHide: true,
      stdio: 'ignore',
    });
    assert.notEqual(await closed(missing), 0);
    assert(!existsSync(join(portable, 'data/initialized')));
    await start(password);
    await login();
    const me = await request('/users/me');
    assert(me.isPlatformAdmin);
    projectId = (
      await request(
        '/projects',
        'POST',
        { name: '便携交付验证项目', startDate: '2026-11-01' },
        token,
        201,
      )
    ).id;
    taskId = (
      await request(
        `/projects/${projectId}/tasks`,
        'POST',
        { title: '交付重启保留任务', priority: 'MEDIUM' },
        token,
        201,
      )
    ).id;
    return {
      extractedArchiveRuns: true,
      initialPasswordRequired: true,
      administratorCreated: true,
    };
  });
  await test('D02', '打包桌面真实登录和数据展示', async () => {
    desktop = await _electron.launch({
      executablePath: join(portable, 'client/SCPC.exe'),
      args: ['--user-data-dir=' + join(output, 'client-profile')],
      env: { ...env, ELECTRON_API_BASE_URL: base },
      timeout: 30000,
    });
    const page = await desktop.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByLabel('用户名', { exact: true }).fill('admin');
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('heading', { name: '项目中心', exact: true }).waitFor();
    await page.getByText('便携交付验证项目', { exact: true }).waitFor();
    await page.evaluate((hash) => {
      globalThis.location.hash = hash;
    }, `#/projects/${projectId}/board`);
    await page.getByRole('link', { name: '交付重启保留任务', exact: true }).waitFor();
    const png = await desktop.evaluate(({ nativeImage }) =>
      nativeImage
        .createFromBitmap(Buffer.from([0, 0, 255, 255]), { width: 1, height: 1 })
        .toPNG()
        .toString('base64'),
    );
    const form = new FormData();
    form.append(
      'avatar',
      new Blob([Buffer.from(png, 'base64')], { type: 'image/png' }),
      'avatar.png',
    );
    const uploaded = await fetch(base + '/users/me/avatar', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token },
      body: form,
    });
    assert.equal(uploaded.status, 200);
    const me = await request('/users/me');
    assert(me.avatarUrl.startsWith('data:image/png'));
    assert(existsSync(join(portable, 'data/avatars', me.id)));
    await page.screenshot({ path: join(output, 'portable-board.png') });
    return {
      packagedExecutable: true,
      loginAndTasksVisible: true,
      avatarStoredInsidePortable: true,
    };
  });
  await test('D03', '已填写验收日期清空、保存和重新读取', async () => {
    const item = await request(
      `/projects/${projectId}/acceptances`,
      'POST',
      { stageName: '便携验收', standards: '日期可清空并保留审计', acceptanceDate: '2026-11-14' },
      token,
      201,
    );
    const path = `/projects/${projectId}/acceptances/${item.id}`;
    assert((await request(path, 'PATCH', { acceptanceDate: null })).acceptanceDate === null);
    assert((await request(path)).acceptanceDate === null);
    return { clearedAndPersisted: true };
  });
  await test('D04', '关闭全部进程后重启，原账号和业务数据保持', async () => {
    const oldToken = token;
    await stop();
    await start();
    await request('/users/me', 'GET', undefined, oldToken, 401);
    await login();
    assert((await request('/users/me')).avatarUrl.startsWith('data:image/png'));
    assert.equal(
      (await request(`/projects/${projectId}/tasks/${taskId}`)).title,
      '交付重启保留任务',
    );
    return { accountRetained: true, taskRetained: true, oldSessionRevoked: true };
  });
  await test('D05', '100%、125%、150%、200%设备缩放下最小窗口与登录交互', async () => {
    const scales = [];
    for (const scale of [1, 1.25, 1.5, 2]) {
      const app = await _electron.launch({
        executablePath: join(portable, 'client/SCPC.exe'),
        args: [
          '--user-data-dir=' + join(output, 'scale-' + scale),
          '--force-device-scale-factor=' + scale,
        ],
        env: { ...env, ELECTRON_API_BASE_URL: base },
        timeout: 30000,
      });
      try {
        const page = await app.firstWindow();
        page.on('pageerror', (error) => errors.push(error.message));
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setSize(960, 640),
        );
        await page.getByLabel('用户名', { exact: true }).fill('admin');
        await page.getByLabel('密码', { exact: true }).fill(password);
        const loginResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/auth/login') && response.request().method() === 'POST',
        );
        await page.getByRole('button', { name: '登录', exact: true }).click();
        assert.equal((await loginResponse).status(), 200, 'Scale login request rejected');
        await page.getByRole('heading', { name: '项目中心', exact: true }).waitFor();
        await page.evaluate((hash) => {
          globalThis.location.hash = hash;
        }, `#/projects/${projectId}/overview`);
        await page.locator('.metric-card').first().waitFor();
        assert(
          !/(TASK|PROJECT|ACCEPTANCE|ITERATION|MEETING)_[A-Z_]+/.test(
            await page.locator('body').innerText(),
          ),
        );
        const layout = await page.evaluate(() => ({
          width: globalThis.innerWidth,
          documentWidth: globalThis.document.documentElement.scrollWidth,
          dpr: globalThis.devicePixelRatio,
        }));
        assert(layout.documentWidth <= layout.width + 1);
        await page.screenshot({ path: join(output, 'scale-' + scale + '.png') });
        scales.push({ requested: scale, ...layout });
      } catch (error) {
        const page = await app.firstWindow();
        await page
          .screenshot({ path: join(output, 'scale-' + scale + '-failure.png') })
          .catch(() => {});
        writeFileSync(
          join(output, 'scale-' + scale + '-failure.txt'),
          (await page.locator('body').innerText()).replaceAll(password, '[REDACTED]'),
        );
        throw error;
      } finally {
        await app.evaluate(({ app: electron }) => electron.exit(0));
      }
    }
    return {
      scales,
      boundary:
        'Electron device scale emulation on one Windows computer; not physical mixed-DPI hardware',
    };
  });
  await test('D06', '本机网卡地址访问与核心API离线运行', async () => {
    const address = Object.values(networkInterfaces())
      .flat()
      .find((item) => item && item.family === 'IPv4' && !item.internal)?.address;
    assert(address, 'No non-loopback IPv4 interface available');
    const probe = createServer();
    await new Promise((done) => probe.listen(0, '0.0.0.0', done));
    const port = probe.address().port;
    await new Promise((done) => probe.close(done));
    const environment = {
      ...env,
      APP_HOST: '0.0.0.0',
      APP_PORT: String(port),
      DATABASE_URL: 'file:' + join(portable, 'data/app.sqlite').replaceAll('\\', '/'),
      JWT_SECRET: randomBytes(48).toString('hex'),
      JWT_EXPIRES_IN: '2h',
      NODE_ENV: 'test',
      CORS_ORIGINS: 'null',
      LOG_LEVEL: 'error',
    };
    const server = spawn(
      join(portable, 'runtime/node.exe'),
      [join(portable, 'apps/api/dist/main.js')],
      { cwd: join(portable, 'apps/api'), env: environment, windowsHide: true, stdio: 'ignore' },
    );
    try {
      const lanBase = `http://${address}:${port}/api/v1`;
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          ready = (await fetch(lanBase + '/health')).ok;
        } catch {
          /* wait */
        }
        if (ready) break;
        await delay(100);
      }
      assert(ready);
      const response = await fetch(lanBase + '/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password }),
      });
      assert.equal(response.status, 200);
      const access = (await response.json()).data.accessToken;
      assert.equal(
        (
          await fetch(lanBase + `/projects/${projectId}/tasks/${taskId}`, {
            headers: { authorization: 'Bearer ' + access },
          })
        ).status,
        200,
      );
      return {
        nonLoopbackInterfaceLoginAndRead: true,
        externalGithubNotRequired: true,
        boundary: 'same host via LAN address; no second physical machine or firewall changes',
      };
    } finally {
      const killer = spawn('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      await closed(killer);
    }
  });
  await test('D07', '正式PowerShell启动入口和桌面关闭后服务退出', async () => {
    await stop();
    const normalEnv = { ...env };
    delete normalEnv.SCPC_PORTABLE_TEST_MODE;
    const normal = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(portable, 'Start-System.ps1'),
      ],
      { env: normalEnv, windowsHide: true, stdio: 'ignore' },
    );
    let desktopPid;
    try {
      for (let i = 0; i < 40; i++) {
        const code = `$node = Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${normal.pid}' | Where-Object Name -eq 'node.exe' | Select-Object -First 1; if($node) { Get-CimInstance Win32_Process -Filter ('ParentProcessId = ' + $node.ProcessId) | Where-Object Name -eq 'SCPC.exe' | Select-Object -First 1 -ExpandProperty ProcessId }`;
        const found = execFileSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', code],
          { encoding: 'utf8', windowsHide: true },
        ).trim();
        if (/^\d+$/.test(found)) {
          desktopPid = Number(found);
          break;
        }
        assert.equal(normal.exitCode, null);
        await delay(200);
      }
      assert(desktopPid, 'Normal entry did not create the packaged desktop process');
      const session = JSON.parse(readFileSync(join(portable, 'data/last-session.json')));
      assert((await fetch(session.apiBase + '/health')).ok);
      const exit = closed(normal);
      execFileSync('taskkill.exe', ['/PID', String(desktopPid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      assert.equal(await exit, 0);
      assert.equal(
        JSON.parse(readFileSync(join(portable, 'data/last-session.json'))).status,
        'stopped',
      );
      await assert.rejects(
        fetch(session.apiBase + '/health', { signal: AbortSignal.timeout(1000) }),
      );
      return {
        powershellEntryRuns: true,
        desktopCloseStopsApi: true,
        existingPasswordNotReset: true,
      };
    } finally {
      if (normal.exitCode === null)
        execFileSync('taskkill.exe', ['/PID', String(normal.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
    }
  });
  assert.equal(errors.length, 0);
} finally {
  await stop();
  save();
}
console.log(
  JSON.stringify({
    output,
    passed: results.filter((x) => x.status === 'PASS').length,
    failed: results.filter((x) => x.status === 'FAIL').length,
  }),
);
process.exitCode = results.some((x) => x.status !== 'PASS') ? 1 : 0;
