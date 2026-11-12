import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = process.env.P7_EVIDENCE_ROOT
  ? resolve(process.env.P7_EVIDENCE_ROOT)
  : join(root, 'tmp/p7-final-2026-11-12');
const output = join(evidence, 'quality');
mkdirSync(output, { recursive: true });
const baseline = process.env.P7_ACCEPTANCE_BASE ?? '2d4d6004ceffdf2099f8bb75f10f01f0cb94800c';
execFileSync(
  'git',
  [
    'diff',
    '--exit-code',
    baseline,
    '--',
    'apps',
    'packages',
    'prisma',
    'package.json',
    'pnpm-lock.yaml',
  ],
  { cwd: root, stdio: 'pipe' },
);
const results = [];
async function run(name, cwd, args) {
  const child = spawn(process.execPath, args, {
    cwd: join(root, cwd),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  child.stdout.on('data', (data) => {
    text += data;
  });
  child.stderr.on('data', (data) => {
    text += data;
  });
  const start = Date.now();
  const code = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', done);
  });
  writeFileSync(join(output, `${name}.txt`), text);
  const result = { name, cwd, args, code, milliseconds: Date.now() - start };
  results.push(result);
  writeFileSync(
    join(output, 'summary.json'),
    JSON.stringify({ baseline, node: process.version, results }, null, 2),
  );
  console.log(JSON.stringify(result));
  return code;
}
await Promise.all([
  ...['api', 'desktop'].map((name) =>
    run(`${name}-tests`, `apps/${name}`, [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${join(output, `${name}-tests.json`)}`,
    ]),
  ),
  run('shared-tests', 'packages/shared', [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--reporter=json',
    `--outputFile=${join(output, 'shared-tests.json')}`,
  ]),
  run('log-tests', '.', ['--test', 'tests/ai-logs/check-ai-log-layout.test.mjs']),
  ...['apps/api', 'apps/desktop', 'packages/shared'].map((pkg) =>
    run(`${pkg.split('/').at(-1)}-typecheck`, '.', [
      'node_modules/typescript/bin/tsc',
      '-p',
      `${pkg}/tsconfig.json`,
      '--noEmit',
    ]),
  ),
  run('eslint', '.', ['node_modules/eslint/bin/eslint.js', '.']),
  run('prettier', '.', ['node_modules/prettier/bin/prettier.cjs', '--check', '.']),
  run('log-layout', '.', ['scripts/check-ai-log-layout.mjs']),
]);
await run('api-build', 'apps/api', ['node_modules/@nestjs/cli/bin/nest.js', 'build']);
await run('desktop-build', 'apps/desktop', [
  'node_modules/electron-vite/bin/electron-vite.js',
  'build',
]);
process.exitCode = results.some((result) => result.code !== 0) ? 1 : 0;
