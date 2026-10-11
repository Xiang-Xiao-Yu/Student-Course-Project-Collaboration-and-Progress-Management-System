import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const STARTUP_ENVIRONMENT = {
  APP_HOST: '127.0.0.1',
  APP_PORT: '46131',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: 'file:../data/startup-error-test.db',
  JWT_EXPIRES_IN: '2h',
  JWT_SECRET: '',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development',
};

describe('API startup error handling', () => {
  it('reports a missing JWT secret without exposing paths or stack frames', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ...STARTUP_ENVIRONMENT,
      },
      timeout: 20_000,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const timedOut = result.error instanceof Error && result.error.message.includes('ETIMEDOUT');

    expect(timedOut).toBe(false);
    expect(result.status).toBe(1);
    expect(output.includes('API startup failed: JWT_SECRET is required')).toBe(true);
    expect(/(?:[A-Za-z]:\\|\\\\|\/(?:home|Users|workspace)\/)/.test(output)).toBe(false);
    expect(/^\s+at\s+\S+/m.test(output)).toBe(false);
    expect(output.includes('replace-with-local-secret')).toBe(false);
  }, 25_000);
});
