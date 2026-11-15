// Package only installed, locked runtimes and dependencies; no install/download.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [targetArgument, electronDirectory] = process.argv.slice(2);
assert(targetArgument && electronDirectory, 'targetDirectory electronDirectory required');
const target = resolve(targetArgument);
assert(!existsSync(target), 'Use a new output directory; existing output is preserved');
assert(
  existsSync(join(root, 'apps/api/dist/main.js')) &&
    existsSync(join(root, 'apps/desktop/out/main/index.js')),
  'Build both applications first',
);
mkdirSync(target, { recursive: true });
const server = join(target, 'apps/api');
mkdirSync(server, { recursive: true });
cpSync(join(root, 'apps/api/dist'), join(server, 'dist'), { recursive: true });
mkdirSync(join(server, 'prisma'));
cpSync(join(root, 'prisma/schema.prisma'), join(server, 'prisma/schema.prisma'));
cpSync(join(root, 'prisma/migrations'), join(server, 'prisma/migrations'), { recursive: true });
const apiManifest = JSON.parse(readFileSync(join(root, 'apps/api/package.json')));
writeFileSync(
  join(server, 'package.json'),
  JSON.stringify({ name: apiManifest.name, version: apiManifest.version, private: true }, null, 2),
);
const roots = new Map();
const packages = [];
function packageFile(require, name) {
  try {
    return realpathSync(require.resolve(name + '/package.json'));
  } catch {
    let directory = dirname(realpathSync(require.resolve(name)));
    while (true) {
      const file = join(directory, 'package.json');
      if (existsSync(file) && JSON.parse(readFileSync(file)).name === name) return file;
      const parent = dirname(directory);
      assert(parent !== directory, 'Cannot locate package ' + name);
      directory = parent;
    }
  }
}
function copyPackage(file, parent) {
  const manifest = JSON.parse(readFileSync(file));
  const installed = roots.get(manifest.name);
  if (installed === manifest.version) return;
  const destination = installed
    ? join(parent, 'node_modules', manifest.name)
    : join(server, 'node_modules', manifest.name);
  if (!installed) roots.set(manifest.name, manifest.version);
  if (existsSync(join(destination, 'package.json'))) return;
  cpSync(dirname(file), destination, {
    recursive: true,
    dereference: true,
    filter: (path) =>
      path === dirname(file) ||
      !path
        .slice(dirname(file).length + 1)
        .split(/[\\/]/)
        .includes('node_modules'),
  });
  packages.push({ name: manifest.name, version: manifest.version });
  const require = createRequire(file);
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    let dependency;
    try {
      dependency = packageFile(require, name);
    } catch (error) {
      if (name in (manifest.optionalDependencies ?? {})) continue;
      throw error;
    }
    copyPackage(dependency, destination);
  }
}
const apiRequire = createRequire(join(root, 'apps/api/package.json'));
for (const name of Object.keys(apiManifest.dependencies))
  copyPackage(packageFile(apiRequire, name), server);
const rootRequire = createRequire(join(root, 'package.json'));
copyPackage(packageFile(rootRequire, 'prisma'), server);
const clientSource = dirname(packageFile(apiRequire, '@prisma/client'));
const generated = join(dirname(dirname(clientSource)), '.prisma/client');
assert(existsSync(join(generated, 'index.js')), 'Generate the Prisma client before packaging');
cpSync(generated, join(server, 'node_modules/.prisma/client'), {
  recursive: true,
  dereference: true,
});
mkdirSync(join(target, 'runtime'));
cpSync(process.execPath, join(target, 'runtime/node.exe'));
const nodeLicense = join(root, 'third_party', 'node-v' + process.versions.node + '.LICENSE');
assert(existsSync(nodeLicense), 'Include the matching Node.js license before distributing');
cpSync(nodeLicense, join(target, 'runtime/Node-LICENSE.txt'));
cpSync(resolve(electronDirectory), join(target, 'client'), {
  recursive: true,
  dereference: true,
  filter: (path) => path !== join(resolve(electronDirectory), 'electron.exe'),
});
cpSync(join(resolve(electronDirectory), 'electron.exe'), join(target, 'client/SCPC.exe'));
const appDirectory = join(target, 'client/resources/app');
mkdirSync(appDirectory, { recursive: true });
cpSync(join(root, 'apps/desktop/out'), join(appDirectory, 'out'), { recursive: true });
writeFileSync(
  join(appDirectory, 'package.json'),
  JSON.stringify(
    { name: 'scpc-desktop', version: apiManifest.version, main: 'out/main/index.js' },
    null,
    2,
  ),
);
cpSync(join(root, 'scripts/portable/bootstrap.mjs'), join(target, 'bootstrap.mjs'));
writeFileSync(
  join(target, 'Start-System.ps1'),
  '\uFEFF' +
    readFileSync(join(root, 'scripts/portable/Start-System.ps1'), 'utf8').replace(/^\uFEFF/, ''),
  'utf8',
);
writeFileSync(
  join(target, 'Start.cmd'),
  '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-System.ps1"\r\n',
  'ascii',
);
writeFileSync(
  join(target, 'runtime-packages.json'),
  JSON.stringify({ node: process.version, packages }, null, 2),
);
writeFileSync(
  join(target, '使用说明.txt'),
  '双击 Start.cmd。首次设置管理员密码，用户名 admin；随后每次启动保留本目录 data 中的数据。关闭桌面窗口会停止服务。仅本机访问，无需安装 Node 或数据库。不要只复制 SCPC.exe，请保留全部目录。版本、测试和技术限制见交付文档。\r\n',
  'utf8',
);
console.log(JSON.stringify({ target, packages: packages.length, sourceDependenciesOnly: true }));
