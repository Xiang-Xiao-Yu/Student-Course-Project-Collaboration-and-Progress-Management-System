import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const prefix = 'docs/ai-logs/';
const required = ['README.md', 'root', 'codex-backend', 'deepseek-frontend'];
const dailyLog = /^(root|codex-backend|deepseek-frontend)\/\d{4}-\d{2}-\d{2}\.md$/;

export function inspectLogPaths(paths) {
  const present = new Set();
  const unexpected = [];

  for (const path of paths) {
    if (!path.startsWith(prefix)) {
      unexpected.push(path);
      continue;
    }
    const relative = path.slice(prefix.length);
    if (relative === 'README.md') {
      present.add(relative);
      continue;
    }
    const match = dailyLog.exec(relative);
    if (match) {
      present.add(match[1]);
    } else {
      unexpected.push(path);
    }
  }

  return { unexpected, missing: required.filter((item) => !present.has(item)) };
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'docs/ai-logs'],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) {
    console.error('Unable to inspect AI log paths:', result.error?.message ?? result.stderr);
    process.exitCode = 1;
    return;
  }

  const paths = result.stdout.split('\0').filter(Boolean);
  const { unexpected, missing } = inspectLogPaths(paths);
  if (unexpected.length || missing.length) {
    if (unexpected.length) console.error('Unexpected AI log paths:', unexpected.join(', '));
    if (missing.length) console.error('Missing required AI logs:', missing.join(', '));
    process.exitCode = 1;
    return;
  }
  console.log('AI log layout is valid.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
