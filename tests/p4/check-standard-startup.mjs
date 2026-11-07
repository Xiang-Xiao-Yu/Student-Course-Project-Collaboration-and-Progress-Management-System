// Record whether an unmodified Electron build remains running with its standard sandbox.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [electronArgument, mainArgument, profileArgument] = process.argv.slice(2);
assert(
  electronArgument && mainArgument && profileArgument,
  'Required: electron.exe main.js profile',
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  resolve(electronArgument),
  [resolve(mainArgument), `--user-data-dir=${resolve(profileArgument)}`],
  { env, windowsHide: true, stdio: 'ignore' },
);
const outcome = await Promise.race([
  new Promise((done) => {
    child.once('error', (error) => done({ error: error.message, running: false }));
    child.once('exit', (code, signal) => done({ exitCode: code, running: false, signal }));
  }),
  delay(5000).then(() => ({ running: true })),
]);
if (outcome.running) child.kill();
console.log(JSON.stringify(outcome));
if (!outcome.running) process.exitCode = 1;
