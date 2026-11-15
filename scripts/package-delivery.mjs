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
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [portableArgument, outputArgument] = process.argv.slice(2);
assert(portableArgument && outputArgument, 'verifiedPortableZip newOutputDirectory required');
const output = resolve(outputArgument);
assert(!existsSync(output), 'Existing deliverables are preserved; choose a new directory');
mkdirSync(output, { recursive: true });
const stage = join(root, 'tmp/closeout-20261114', 'source-' + Date.now());
const docsStage = stage + '-documents';
mkdirSync(stage, { recursive: true });
mkdirSync(docsStage);
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString()
  .split('\0')
  .filter(Boolean);
const extras = [
  'scripts/package-portable.mjs',
  'scripts/package-delivery.mjs',
  'scripts/portable',
  'tests/p7/final-full-extra.mjs',
  'tests/p7/closeout-delivery.mjs',
  'tests/p7/manual-test-session.mjs',
  'tests/p7/start-manual-test.ps1',
  'docs/结项文档',
  'docs/weekly-reports/README.md',
  'docs/superpowers/plans/2026-11-14-mvp-closeout.md',
  'docs/ai-logs/root/2026-11-14.md',
  'docs/test/board-performance-fix-2026-11-14.md',
  'docs/test/recheck-2026-11-14.md',
  'docs/test/final-full-test-checklist-2026-11-12.md',
  'docs/test/final-full-test-report-2026-11-12.md',
  'docs/test/final-manual-test-guide-2026-11-12.md',
  'third_party/node-v24.18.0.LICENSE',
];
function files(path) {
  if (!existsSync(path)) return [];
  assert(!lstatSync(path).isSymbolicLink(), 'Do not package source links');
  return statSync(path).isDirectory()
    ? readdirSync(path).flatMap((entry) => files(join(path, entry)))
    : [path];
}
const selected = new Set([
  ...tracked.map((path) => join(root, path)),
  ...extras.flatMap((path) => files(join(root, path))),
]);
const sourceFiles = [];
for (const source of [...selected].sort()) {
  if (!existsSync(source) || !statSync(source).isFile()) continue;
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
  id: 'SCPC-0.1.0-closeout-20261114',
  date: '2026-11-14',
  base: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
  contentAuthority: 'SOURCE-MANIFEST.json; includes listed local closeout fixes',
  sourceFiles,
};
writeFileSync(join(stage, 'SOURCE-MANIFEST.json'), JSON.stringify(version, null, 2));
for (const path of [
  'docs/结项文档',
  'docs/需求规格说明书.md',
  'docs/P0-工程与契约约定.md',
  'docs/weekly-reports/README.md',
]) {
  const destination = join(docsStage, path);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(root, path), destination, { recursive: true });
}
writeFileSync(
  join(docsStage, 'README.txt'),
  '请从 docs/结项文档/README.md 开始阅读。正式需求原件与工程约定保持原路径。\r\n',
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
  '运行：完整解压 SCPC-Windows-Portable.zip，双击 Start.cmd，首次设置 admin 密码。文档：解压 SCPC-Documents.zip，从 docs/结项文档/README.md 阅读。源码：SCPC-Source.zip。完整性：SHA256SUMS.txt。原有项目和运行数据未被修改。\r\n',
  'utf8',
);
console.log(JSON.stringify({ output, sourceFiles: sourceFiles.length, archives }, null, 2));
