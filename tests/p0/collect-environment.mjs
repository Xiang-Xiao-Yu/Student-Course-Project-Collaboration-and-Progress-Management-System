import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';

function commandVersion(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function expectedPackageManager() {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(cwd(), 'package.json'), 'utf8'));
    return typeof packageJson.packageManager === 'string' ? packageJson.packageManager : null;
  } catch {
    return null;
  }
}

function actualPnpmVersion() {
  const userAgent = process.env['npm_config_user_agent'] ?? '';
  const userAgentVersion = /^pnpm\/([^\s]+)/.exec(userAgent)?.[1];

  if (userAgentVersion) {
    return userAgentVersion;
  }

  const pnpmEntrypoint = process.env['npm_execpath'];

  if (pnpmEntrypoint) {
    const version = commandVersion(process.execPath, [pnpmEntrypoint, '--version']);

    if (version) {
      return version;
    }
  }

  return commandVersion('pnpm', ['--version']);
}

const packageManager = expectedPackageManager();
const pnpmVersion = actualPnpmVersion();
const environment = {
  collectedAt: new Date().toISOString(),
  node: process.version,
  pnpm: pnpmVersion,
  expectedPackageManager: packageManager,
  packageManagerMatches: packageManager === `pnpm@${pnpmVersion}`,
  gitCommit: commandVersion('git', ['rev-parse', 'HEAD']),
  gitBranch: commandVersion('git', ['branch', '--show-current']),
  platform: process.platform,
  architecture: process.arch,
  envPresence: {
    DATABASE_URL: Boolean(process.env['DATABASE_URL']),
    JWT_SECRET: Boolean(process.env['JWT_SECRET']),
    ELECTRON_API_BASE_URL: Boolean(process.env['ELECTRON_API_BASE_URL']),
  },
};

console.log(JSON.stringify(environment, null, 2));

if (!environment.packageManagerMatches) {
  process.exitCode = 1;
}
