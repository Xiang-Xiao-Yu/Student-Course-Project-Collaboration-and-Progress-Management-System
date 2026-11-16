// Run on Windows with a local Playwright package and the shipped single-file application.
/* global document, getComputedStyle -- used inside the Electron renderer's page.evaluate callback */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const [exe, playwrightManifest, destination, layout = 'portable', applicationFolder] =
  process.argv.slice(2);
assert(exe && playwrightManifest && destination, 'exe playwrightManifest newEvidenceDirectory');
assert(['portable', 'installed', 'directory'].includes(layout));
const out = resolve(destination);
mkdirSync(out, { recursive: true });
assert(!existsSync(join(out, '逐页记录.json')), 'Choose a new evidence directory');
const { _electron } = createRequire(resolve(playwrightManifest))('playwright');
const scratch = mkdtempSync(join(tmpdir(), 'scpc-ui-roles-'));
const runner = join(scratch, 'SCPC.exe');
if (layout !== 'portable') {
  const source =
    applicationFolder ??
    (layout === 'directory'
      ? dirname(dirname(resolve(exe)))
      : execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); (Get-ItemProperty -LiteralPath 'HKCU:\\Software\\SCPC\\Installer').InstallFolder",
          ],
          { encoding: 'utf8', windowsHide: true },
        ).trim());
  for (const part of ['bootstrap.mjs', 'apps']) {
    const original = join(source, part);
    if (existsSync(original)) cpSync(original, join(scratch, part), { recursive: true });
  }
} else {
  copyFileSync(exe, runner);
}
const runtime = layout !== 'portable' ? scratch : join(scratch, 'SCPC-便携版');
const binaryFolder =
  layout === 'directory'
    ? dirname(dirname(resolve(exe)))
    : layout === 'installed'
      ? dirname(resolve(exe))
      : runtime;
const client = join(binaryFolder, 'client', 'SCPC.exe');
const sessionFile = join(runtime, 'data', 'last-session.json');
const report = {
  layout,
  sha256: createHash('sha256').update(readFileSync(exe)).digest('hex'),
  roles: {},
};
const save = () => writeFileSync(join(out, '逐页记录.json'), JSON.stringify(report, null, 2));
const wait = async (check, seconds = 12) => {
  const until = Date.now() + seconds * 1000;
  do {
    const value = await check();
    if (value) return value;
    await pause(100);
  } while (Date.now() < until);
  throw Error('等待界面或文件结果超时');
};
let base;
async function api(route, token, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + route, {
    method,
    headers: {
      ...(token && { authorization: 'Bearer ' + token }),
      ...(body && { 'content-type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
    redirect: 'error',
  });
  const result = await r.json();
  assert(r.ok, route + ' ' + r.status + ' ' + result.error?.code);
  return result.data;
}
const adminPass =
  layout !== 'portable'
    ? randomBytes(18).toString('base64url')
    : process.env.SCPC_DEBUG_ADMIN_PASSWORD;
assert(adminPass, 'Set SCPC_DEBUG_ADMIN_PASSWORD for the tested portable package');
const users = { admin: { username: 'admin', password: adminPass } };
const main =
  layout !== 'portable'
    ? spawn(join(binaryFolder, 'runtime/node.exe'), ['bootstrap.mjs'], {
        cwd: scratch,
        stdio: layout === 'directory' ? ['pipe', 'ignore', 'ignore'] : 'ignore',
        windowsHide: true,
        env: {
          ...process.env,
          SCPC_BINARY_FOLDER: binaryFolder,
          SCPC_INITIAL_PASSWORD: adminPass,
          SCPC_PORTABLE_TEST_MODE: layout === 'directory' ? '1' : '',
        },
      })
    : spawn(runner, [], { cwd: scratch, stdio: 'ignore' });
const roles = ['fresh', 'admin', 'owner', 'member', 'observer'];
const firstProjectName = '新账号的第一个项目';
let firstProject;
const names = { admin: '平台管理员', owner: '项目负责人', member: '项目成员', observer: '观察者' };
const title = '四身份桌面验收项目';
let project;
let sampleTask;
async function prepare() {
  for (const who of [
    'fresh',
    'owner',
    'member',
    'observer',
    'inviteadmin',
    'inviteowner',
    'disableme',
  ]) {
    const username = 'ui-' + who;
    const password = randomBytes(18).toString('base64url');
    const user = await api('/auth/register', null, {
      username,
      password,
      nickname: names[who] ?? who,
    });
    users[who] = { ...user, username, password };
  }
  const token = (
    await api('/auth/login', null, {
      username: users.owner.username,
      password: users.owner.password,
    })
  ).accessToken;
  project = await api('/projects', token, {
    name: title,
    startDate: '2026-11-01',
    endDate: '2026-12-31',
  });
  const root = '/projects/' + project.id;
  assert.equal(project.ownerId, users.owner.id);
  for (const who of ['member', 'observer'])
    await api(root + '/members', token, { username: users[who].username, role: who.toUpperCase() });
  const req = await api(root + '/requirements', token, {
    title: '样例需求',
    description: '桌面测试',
    priority: 'MEDIUM',
    acceptanceCriteria: '可查看详情',
  });
  sampleTask = await api(root + '/tasks', token, {
    title: '样例任务',
    priority: 'MEDIUM',
    assigneeId: users.member.id,
    requirementId: req.id,
  });
  await api(root + '/iterations', token, {
    name: '样例迭代',
    startDate: '2026-11-01',
    endDate: '2026-12-01',
    goal: '查看与维护',
  });
  await api(root + '/meetings', token, {
    title: '样例会议',
    scheduledAt: '2026-11-20T10:00:00Z',
    agenda: '讨论',
    minutes: '纪要',
    decisions: '记录',
    participantIds: [users.owner.id, users.member.id],
  });
  await api(root + '/acceptances', token, {
    stageName: '样例验收',
    goal: '验证按钮',
    standards: '可读',
    acceptanceDate: '2026-11-20',
    participantIds: [users.owner.id],
    result: 'NOT_STARTED',
  });
}

async function visitAs(who) {
  const user = users[who],
    manages = ['admin', 'owner'].includes(who),
    writes = who !== 'observer';
  const result = (report.roles[who] = { pages: {}, actions: [], problems: [] });
  const env = { ...process.env, ELECTRON_API_BASE_URL: base };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const app = await _electron.launch({
    executablePath: client,
    args: ['--user-data-dir=' + join(scratch, 'profile-' + who)],
    env,
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900));
    const downloads = join(scratch, who + '-downloads');
    mkdirSync(downloads);
    await app.evaluate(({ session }, dir) => {
      session.defaultSession.on('will-download', (_e, item) =>
        item.setSavePath(dir + '\\' + item.getFilename()),
      );
    }, downloads);
    const by = (role, name, root = page) => root.getByRole(role, { name, exact: true });
    const button = (name, root) => by('button', name, root);
    const field = (name, root = page) => root.getByLabel(name, { exact: true });
    const link = (name, root) => by('link', name, root).first();
    const heading = (name) => by('heading', name).first();
    const settle = () => page.waitForLoadState('networkidle');
    const shot = async (key) => {
      await settle();
      const markers = {
        用户管理: '.admin-user-row',
        我的任务: '.task-row, .empty-state',
        项目概览: '.metric-card',
        需求管理: '.requirement-row',
        需求详情: '.comment-panel, .requirement-detail-form, .linked-task-row',
        任务看板: '.task-card',
        任务详情: '.comment-panel, .task-detail-panel',
        统计与导出: '.metric-card',
        成员管理: '#member-list-title',
        项目设置: 'form',
      };
      if (markers[key]) await page.locator(markers[key]).first().waitFor();
      await page.locator('.loading-state:visible').first().waitFor({ state: 'hidden' });
      const inventory = await page.evaluate(() => {
        const all = [...document.querySelectorAll('button, a[href], input[type=file]')].filter(
          (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden',
        );
        const collect = (pred) => [
          ...new Set(
            all
              .filter(pred)
              .map((e) =>
                (
                  e.getAttribute('aria-label') ||
                  e.innerText ||
                  e.title ||
                  e.getAttribute('type') ||
                  ''
                ).trim(),
              )
              .filter(Boolean),
          ),
        ];
        return {
          buttons: collect((e) => e.tagName === 'BUTTON' && !e.disabled),
          disabled: collect((e) => e.tagName === 'BUTTON' && e.disabled),
          links: collect((e) => e.tagName === 'A'),
          headings: [...document.querySelectorAll('h1,h2,h3')]
            .filter((e) => e.getClientRects().length)
            .map((e) => e.innerText.trim()),
          fields: [...document.querySelectorAll('label')]
            .filter((e) => e.getClientRects().length && e.querySelector('input,textarea,select'))
            .map((e) => ({
              name: e.querySelector('span')?.textContent?.trim() || e.innerText.trim(),
              disabled: e.querySelector('input,textarea,select').disabled,
            })),
        };
      });
      result.pages[key] = inventory;
    };
    const action = async (label, fn) => {
      try {
        await fn();
        result.actions.push(label);
      } catch (e) {
        await page
          .screenshot({
            path: join(out, who + '-action-' + result.actions.length + '-failure.png'),
          })
          .catch(() => {});
        result.failurePage = {
          url: page.url(),
          text: (
            await page
              .locator('body')
              .innerText()
              .catch(() => '')
          ).slice(0, 6000),
        };
        result.problems.push({ label, error: String(e.message).split('\n').slice(0, 4).join(' ') });
        console.log(who, 'CHECK', label, String(e.message).split('\n')[0]);
      }
      save();
    };
    const write = async (name, method, click, status) => {
      const pending = page.waitForResponse(
        (r) => r.request().method() === method && new URL(r.url()).pathname.endsWith(name),
        { timeout: 6500 },
      );
      const [r] = await Promise.all([pending, click()]);
      assert.equal(r.status(), status);
      await settle();
      return r;
    };
    const side = page.getByRole('navigation', { name: '项目导航' });
    const nav = async (name) => {
      await link(name, side).click();
      await heading(name).waitFor();
      await settle();
    };
    const visibleAs = async (control, allowed) =>
      assert.equal((await control.count()) > 0 && (await control.first().isVisible()), allowed);
    const gate = async (label, control, allowed, fn) =>
      action(label + (allowed ? '（点击并验证）' : '（入口隐藏）'), async () => {
        await visibleAs(control, allowed);
        if (allowed) await fn();
      });
    const formFor = (name) => button(name).locator('xpath=ancestor::form[1]');

    await link('注册').click();
    await settle();
    await shot('注册');
    await link('返回登录').click();
    await heading('登录').waitFor();
    await shot('登录');
    await field('用户名').fill(user.username);
    await field('密码').fill(user.password);
    await button('登录').click();
    await heading('项目中心').waitFor();
    await settle();
    await shot('项目中心');
    result.actions.push('从登录页进入项目中心');
    if (who === 'fresh') {
      await page.getByText('暂无项目', { exact: true }).waitFor();
      await field('项目名称').fill(firstProjectName);
      const response = await write(
        '/projects',
        'POST',
        () => button('创建并进入项目').click(),
        201,
      );
      firstProject = (await response.json()).data;
      assert.equal(firstProject.ownerId, user.id);
      assert.equal(firstProject.accessRole, 'OWNER');
      await heading('项目概览').waitFor();
      result.actions.push('零项目账号创建第一个项目并成为负责人');
      await button('退出').click();
      await heading('登录').waitFor();
      return;
    }
    if (who === 'admin') {
      await action('跨项目隐藏移交入口、拒绝移交请求并允许确认删除', async () => {
        const card = page.locator('.project-card').filter({ hasText: firstProjectName });
        await link('进入项目', card).click();
        await nav('成员管理');
        await page.getByPlaceholder('输入成员用户名').fill(users.member.username);
        await write('/members', 'POST', () => button('邀请成员').click(), 201);
        const member = page.locator('.member-row').filter({ hasText: users.member.username });
        await member.waitFor();
        assert.equal(await button('移交负责人', member).count(), 0);
        const { accessToken } = await api('/auth/login', null, {
          username: 'admin',
          password: adminPass,
        });
        const denied = await fetch(
          base + '/projects/' + firstProject.id + '/members/' + users.member.id,
          {
            method: 'PATCH',
            headers: { authorization: 'Bearer ' + accessToken, 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'OWNER' }),
          },
        );
        assert.equal(denied.status, 403);
        assert.equal(
          (await api('/projects/' + firstProject.id, accessToken)).ownerId,
          firstProject.ownerId,
        );
        await nav('项目设置');
        await button('删除项目').click();
        await field('项目名称', page.getByRole('dialog')).fill(firstProjectName);
        await write(
          '/projects/' + firstProject.id,
          'DELETE',
          () => button('确认删除').click(),
          200,
        );
        await heading('项目中心').waitFor();
      });
    }

    await link('个人资料').click();
    await field('昵称').waitFor();
    await shot('个人资料');
    await action('本人昵称可保存', async () => {
      await field('昵称').fill(names[who] + '桌测');
      const saveButton = page.getByRole('button', { name: /保存.*(昵称|资料)|保存修改/ }).first();
      await write('/users/me', 'PATCH', () => saveButton.click(), 200);
    });
    await gate(
      '平台用户管理入口与禁用普通测试账号',
      link('用户管理'),
      who === 'admin',
      async () => {
        await link('用户管理').click();
        await button('刷新列表').click();
        await settle();
        await shot('用户管理');
        const row = page.locator('.admin-user-row').filter({ hasText: '@ui-disableme' });
        await button('禁用用户', row).click();
        await write('/disable', 'POST', () => button('确认禁用').click(), 200);
        await row.getByText('已禁用', { exact: true }).waitFor();
      },
    );
    await link('我的任务').click();
    await heading('我的任务').waitFor();
    await shot('我的任务');
    await link('项目中心').click();
    await link('进入项目', page.locator('.project-card').filter({ hasText: title })).click();
    await heading('项目概览').waitFor();
    await shot('项目概览');

    await nav('需求管理');
    await shot('需求管理');
    await gate('创建需求', button('创建需求'), writes, async () => {
      const f = formFor('创建需求');
      await field('需求标题', f).fill('新需求-' + who);
      await field('验收标准', f).fill('实际桌面提交');
      await write('/requirements', 'POST', () => button('创建需求', f).click(), 201);
    });
    await action('搜索样例需求', async () => {
      const f = formFor('搜索');
      await field('需求标题', f).fill('样例需求');
      await button('搜索', f).click();
      await page.locator('.requirement-row').filter({ hasText: '样例需求' }).first().waitFor();
    });
    const detailLink = page
      .locator('.requirement-row')
      .filter({ hasText: '样例需求' })
      .getByRole('link')
      .first();
    await detailLink.click();
    await heading('需求详情').waitFor();
    await shot('需求详情');
    await gate('在需求详情保存描述', button('保存需求'), writes, async () => {
      await page.getByRole('textbox', { name: /^需求描述/ }).fill('桌面编辑-' + who);
      const [res] = await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'PATCH' && r.url().includes('/requirements/'),
        ),
        button('保存需求').click(),
      ]);
      assert.equal(res.status(), 200);
    });

    await nav('任务看板');
    await shot('任务看板');
    await action('应用看板标题筛选并清空', async () => {
      await field('标题搜索').fill('样例任务');
      for (const ctrl of ['应用筛选', '清空筛选']) {
        await Promise.all([
          page.waitForResponse(
            (r) =>
              r.request().method() === 'GET' &&
              new URL(r.url()).pathname.endsWith('/tasks') &&
              r.ok(),
          ),
          button(ctrl).click(),
        ]);
        await link('样例任务').waitFor();
        await heading('筛选任务').waitFor();
      }
    });
    await gate('创建任务', button('创建任务'), writes, async () => {
      const f = formFor('创建任务');
      await field('任务标题', f).fill('桌面任务-' + who);
      await write('/tasks', 'POST', () => button('创建任务', f).click(), 201);
      await link('桌面任务-' + who).waitFor();
    });
    const edit = page
      .locator('.task-card')
      .filter({ has: link('样例任务') })
      .getByRole('button', { name: '编辑任务' });
    await gate('打开任务编辑面板', edit, writes, async () => {
      await edit.click();
      await heading('编辑任务').waitFor();
      await shot('任务编辑面板');
      const panel = page.getByRole('dialog');
      const save = button('保存任务', panel);
      await save.hover();
      assert.equal(await save.isEnabled(), true);
      assert.notEqual(await save.evaluate((el) => getComputedStyle(el).cursor), 'wait');
      const tag = panel.getByLabel('新任务标签');
      await tag.fill('未确认标签');
      await save.click();
      assert.equal(await tag.inputValue(), '未确认标签');
      assert.equal(await tag.evaluate((el) => el.validity.patternMismatch), true);
      await tag.fill('');
      await save.click();
      await page.getByText('任务内容没有变化。', { exact: true }).waitFor();
      await edit.click();
      const description = panel.getByRole('textbox', { name: /^任务描述/ });
      const changed = '保存联测-' + who;
      await description.fill(changed);
      await write('/tasks/' + sampleTask.id, 'PATCH', () => save.click(), 200);
      await edit.click();
      assert.equal(await description.inputValue(), changed);
      await button('关闭', panel).click();
    });
    if (writes)
      await action('将本人新建任务移至待开始', async () => {
        const card = page.locator('.task-card').filter({ hasText: '桌面任务-' + who });
        if (who === 'member') {
          assert.equal(await button('编辑任务', card).count(), 0);
          await button('调整负责人', card).click();
          const panel = page.getByRole('dialog');
          await shot('调整负责人弹窗');
          await panel.getByRole('combobox').selectOption(users.member.id);
          const [response] = await Promise.all([
            page.waitForResponse(
              (r) => r.request().method() === 'PATCH' && r.url().includes('/tasks/'),
            ),
            button('确认调整', panel).click(),
          ]);
          assert.equal(response.status(), 200);
          assert.equal((await response.json()).data.assigneeId, users.member.id);
        }
        await button('编辑任务', card).click();
        await write(
          '/status',
          'PATCH',
          () => button('移至待开始', page.getByRole('dialog')).click(),
          200,
        );
        const panel = page.getByRole('dialog');
        if (await panel.isVisible()) await button('关闭', panel).click();
      });
    await link('样例任务').click();
    await heading('任务详情').waitFor();
    await shot('任务详情');
    await gate('在任务详情发表评论', button('发表评论'), writes, async () => {
      const content = '实际桌面评论-' + who;
      await field('发布评论').fill(content);
      await write('/comments', 'POST', () => button('发表评论').click(), 201);
      await page.getByText(content, { exact: true }).waitFor();
    });

    await nav('迭代计划');
    await page.getByRole('button', { name: /样例迭代/ }).click();
    await heading('样例迭代').waitFor();
    await shot('迭代计划');
    await gate('创建迭代', button('创建迭代'), manages, async () => {
      const f = formFor('创建迭代');
      await field('迭代名称', f).fill('新迭代-' + who);
      await field('开始日期', f).fill('2026-11-05');
      await field('结束日期', f).fill('2026-11-25');
      await write('/iterations', 'POST', () => button('创建迭代', f).click(), 201);
    });
    await nav('会议纪要');
    await page.getByRole('button', { name: /样例会议/ }).click();
    await heading('样例会议').waitFor();
    await shot('会议纪要');
    await gate('创建会议', button('创建会议'), writes, async () => {
      const f = formFor('创建会议');
      await field('会议主题', f).fill('新会议-' + who);
      await field('会议时间', f).fill('2026-11-21T12:00');
      await field('会议议程', f).fill('讨论交付');
      await f.getByRole('checkbox').first().check();
      await write('/meetings', 'POST', () => button('创建会议', f).click(), 201);
    });
    await nav('阶段验收');
    await page.getByRole('button', { name: /样例验收/ }).click();
    await heading('样例验收').waitFor();
    await shot('阶段验收');
    await gate('创建阶段验收', button('创建阶段验收'), manages, async () => {
      const f = formFor('创建阶段验收');
      await field('验收阶段名称', f).fill('新验收-' + who);
      await field('验收日期', f).fill('2026-11-21');
      await field('验收目标', f).fill('阶段验证');
      await field('验收标准', f).fill('经桌面提交');
      await f.getByRole('checkbox').first().check();
      await write('/acceptances', 'POST', () => button('创建阶段验收', f).click(), 201);
      await heading('新验收-' + who).waitFor();
    });
    await nav('统计与导出');
    await shot('统计与导出');
    await page.screenshot({ path: join(out, who + '-reports.png') });
    await gate('下载项目进度 CSV', button('导出项目进度报告'), manages, async () => {
      const file = join(scratch, who + '-downloads', 'progress-' + project.id + '.csv');
      await button('导出项目进度报告').click();
      await page.getByText('项目进度报告已导出。', { exact: true }).waitFor();
      await wait(() => existsSync(file) && readFileSync(file, 'utf8').includes(title));
    });
    await nav('成员管理');
    await shot('成员管理');
    await gate('邀请测试账号为观察者', button('邀请成员'), manages, async () => {
      const f = formFor('邀请成员');
      await field('用户名', f).fill('ui-invite' + who);
      await f.getByRole('combobox').selectOption('OBSERVER');
      await write('/members', 'POST', () => button('邀请成员', f).click(), 201);
    });
    await gate('进入项目设置并保存简介', link('项目设置', side), manages, async () => {
      await nav('项目设置');
      await shot('项目设置');
      await page.getByRole('textbox', { name: /^项目简介/ }).fill('桌面权限实测-' + who);
      await write('/projects/' + project.id, 'PATCH', () => button('保存基本信息').click(), 200);
    });
    await link('个人资料').click();
    await link('项目中心').click();
    await heading('项目中心').waitFor();
    await action('服务端创建权限与项目中心入口一致', async () => {
      const token = (
        await api('/auth/login', null, { username: user.username, password: user.password })
      ).accessToken;
      assert.equal((await api('/projects/creation-permission', token)).canCreate, true);
      await visibleAs(button('创建并进入项目'), true);
      await page.screenshot({ path: join(out, who + '-project-center.png') });
      await field('项目名称').fill('独立项目-' + who);
      const created = await write('/projects', 'POST', () => button('创建并进入项目').click(), 201);
      const ownProject = (await created.json()).data;
      assert.equal(ownProject.accessRole, 'OWNER');
      assert.equal(
        (await api('/projects/' + project.id, token)).accessRole,
        who === 'admin' ? 'ADMIN' : who.toUpperCase(),
      );
      await heading('项目概览').waitFor();
    });
    await button('退出').click();
    await heading('登录').waitFor();
    result.actions.push('退出后返回登录页');
  } catch (e) {
    const page = app.windows()[0];
    if (page) {
      await page.screenshot({ path: join(out, who + '-failure.png') }).catch(() => {});
      result.failurePage = {
        url: page.url(),
        text: (
          await page
            .locator('body')
            .innerText()
            .catch(() => '')
        ).slice(0, 6000),
      };
    }
    result.problems.push({
      label: '页面导航中断',
      error: e.message.split('\n').slice(0, 5).join(' '),
    });
  } finally {
    save();
    await app.close();
  }
  console.log(
    who,
    Object.keys(result.pages).length + ' pages',
    result.actions.length + ' checks',
    JSON.stringify(result.problems),
  );
}

try {
  base = await wait(() => {
    try {
      const s = JSON.parse(readFileSync(sessionFile));
      if (s.status === 'ready') return s.apiBase;
    } catch {
      // The launcher creates the session file asynchronously after starting the API.
    }
  }, 180);
  assert.equal(new URL(base).hostname, '127.0.0.1');
  await prepare();
  for (const who of roles) await visitAs(who);
  if (Object.values(report.roles).some((r) => r.problems.length)) process.exitCode = 1;
} catch (e) {
  console.error('运行错误', e.message);
  process.exitCode = 1;
} finally {
  save();
  if (layout === 'directory') {
    main.stdin.end();
  } else {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'for($i=0;$i -lt 60;$i++){$boot=Get-CimInstance Win32_Process -Filter ("ParentProcessId="+$env:SCPC_TEST_LAUNCHER) |Where-Object Name -eq "node.exe"|Select-Object -First 1;$parent=if($env:SCPC_TEST_LAYOUT -eq "installed"){[int]$env:SCPC_TEST_LAUNCHER}else{$boot.ProcessId};if($parent){$c=Get-CimInstance Win32_Process -Filter ("ParentProcessId="+$parent)|Where-Object ExecutablePath -eq $env:SCPC_TEST_CLIENT|Select-Object -First 1;if($c){$p=Get-Process -Id $c.ProcessId -ErrorAction SilentlyContinue;if($p.MainWindowHandle){[void]$p.CloseMainWindow();break}}};Start-Sleep -Milliseconds 200}',
      ],
      {
        env: {
          ...process.env,
          SCPC_TEST_CLIENT: client,
          SCPC_TEST_LAUNCHER: String(main.pid),
          SCPC_TEST_LAYOUT: layout,
        },
        windowsHide: true,
      },
    );
  }
  await wait(() => main.exitCode !== null, 25);
}
