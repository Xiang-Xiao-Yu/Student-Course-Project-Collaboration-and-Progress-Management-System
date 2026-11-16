// Assemble local, verified deliverables without Git mutation or user data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [portableArgument, outputArgument, deliveryId = 'SCPC-0.1.10-maintenance-20261116'] =
  process.argv.slice(2);
assert(portableArgument && outputArgument, 'verifiedPortableZip newOutputDirectory required');
const output = resolve(outputArgument);
assert(!existsSync(output), 'Existing deliverables are preserved; choose a new directory');
mkdirSync(output, { recursive: true });
const stage = join(root, 'tmp/closeout-20261116', 'source-' + Date.now());
const docsStage = stage + '-documents';
const documentIndex = existsSync(join(root, 'docs/结项文档/README.md'))
  ? 'docs/结项文档/README.md'
  : 'docs/README.md';
mkdirSync(stage, { recursive: true });
mkdirSync(docsStage);
const tracked = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root },
)
  .toString()
  .split('\0')
  .filter(Boolean);
const selected = new Set(tracked.map((path) => join(root, path)));
const sourceFiles = [];
for (const source of [...selected].sort()) {
  if (!existsSync(source) || !statSync(source).isFile()) continue;
  assert(!lstatSync(source).isSymbolicLink(), 'Do not package source links');
  const path = relative(root, source).replaceAll('\\', '/');
  if (
    /^(?:\.git\/|node_modules\/|release\/|deliverables\/|tmp\/|data\/)/.test(path) ||
    /(?:^|\/)(?:node_modules|out|dist|coverage)(?:\/|$)/.test(path)
  )
    continue;
  if (/(?:^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example')) continue;
  if (/\.(?:sqlite3?|db)(?:$|[-.])|\.(?:log|tmp)$/.test(path)) continue;
  const destination = join(stage, path);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
  sourceFiles.push({
    path,
    bytes: statSync(source).size,
    sha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
  });
}
const version = {
  id: deliveryId,
  date: '2026-11-16',
  base: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
  contentAuthority: 'SOURCE-MANIFEST.json; tracked and unignored project files only',
  sourceFiles,
};
writeFileSync(join(stage, 'SOURCE-MANIFEST.json'), JSON.stringify(version, null, 2));
for (const path of ['docs', 'README.md', 'tests/README.md']) {
  const destination = join(docsStage, path);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(root, path), destination, { recursive: true });
}
writeFileSync(
  join(docsStage, 'README.txt'),
  `请从 ${documentIndex} 开始阅读。正式需求和工程文档保持原路径；本地资料包可能另含未提交的课程材料，分发范围按项目组长授权确定。需要打开源码引用时，将 SCPC-Source.zip 解压到相同目录。\r\n`,
  'utf8',
);
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
function zip(directory, name) {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${quote(directory)},${quote(join(output, name))},[IO.Compression.CompressionLevel]::Optimal,$false)`,
    ],
    { windowsHide: true, timeout: 300000, stdio: 'pipe' },
  );
}
cpSync(resolve(portableArgument), join(output, 'SCPC-Windows-Portable.zip'));
zip(stage, 'SCPC-Source.zip');
zip(docsStage, 'SCPC-Documents.zip');
const archives = ['SCPC-Windows-Portable.zip', 'SCPC-Source.zip', 'SCPC-Documents.zip'].map(
  (name) => ({
    name,
    bytes: statSync(join(output, name)).size,
    sha256: createHash('sha256')
      .update(readFileSync(join(output, name)))
      .digest('hex'),
  }),
);
writeFileSync(
  join(output, 'SHA256SUMS.txt'),
  archives.map((file) => file.sha256 + '  ' + file.name).join('\r\n') + '\r\n',
  'ascii',
);
writeFileSync(
  join(output, 'delivery-manifest.json'),
  JSON.stringify(
    {
      ...version,
      sourceStage: relative(root, stage).replaceAll('\\', '/'),
      archives,
      dataIncluded: false,
      runtimePolicy: 'portable zip is byte-identical to independently verified input; no user data',
    },
    null,
    2,
  ),
);
writeFileSync(
  join(output, '开始使用.txt'),
  `运行：完整解压 SCPC-Windows-Portable.zip，双击 Start.cmd，首次设置 admin 密码。文档：解压 SCPC-Documents.zip，从 ${documentIndex} 阅读。源码：SCPC-Source.zip。完整性：SHA256SUMS.txt。原有项目和运行数据未被修改。\r\n`,
  'utf8',
);
console.log(JSON.stringify({ output, sourceFiles: sourceFiles.length, archives }, null, 2));
