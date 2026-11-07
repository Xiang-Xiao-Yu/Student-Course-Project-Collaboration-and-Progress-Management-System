// Record whether an unmodified Electron build remains running with its standard sandbox.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [electronArgument, mainArgument, profileArgument] = process.argv.slice(2);
assert(
  electronArgument && mainArgument && profileArgument,
  'Required: electron.exe main.js profile',
);
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
const electronPath = resolve(electronArgument);
const mainPath = resolve(mainArgument);
const rendererPath = resolve(dirname(mainPath), '../renderer/index.html');
const [electronSha256, mainSha256, rendererHtmlSha256] = await Promise.all([
  sha256(electronPath),
  sha256(mainPath),
  sha256(rendererPath),
]);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, [mainPath, `--user-data-dir=${resolve(profileArgument)}`], {
  env,
  windowsHide: true,
  stdio: 'ignore',
});
const outcome = await Promise.race([
  new Promise((done) => {
    child.once('error', (error) => done({ error: error.message, running: false }));
    child.once('exit', (code, signal) => done({ exitCode: code, running: false, signal }));
  }),
  delay(5000).then(() => ({ running: true })),
]);
if (outcome.running) child.kill();
console.log(JSON.stringify({ ...outcome, electronSha256, mainSha256, rendererHtmlSha256 }));
if (!outcome.running) process.exitCode = 1;
