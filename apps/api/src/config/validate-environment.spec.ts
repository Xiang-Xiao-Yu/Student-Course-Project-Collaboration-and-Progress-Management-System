import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './validate-environment';

const validEnvironment: Record<string, unknown> = {
  APP_HOST: '127.0.0.1',
  APP_PORT: '3100',
  CORS_ORIGINS: 'http://localhost:5173, http://127.0.0.1:5173',
  DATABASE_URL: 'file:../data/test.db',
  JWT_EXPIRES_IN: '15m',
  JWT_SECRET: 'test-only-secret',
  LOG_LEVEL: 'warn',
  NODE_ENV: 'test',
};

describe('validateEnvironment', () => {
  it('parses valid values into typed configuration', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.APP_PORT).toBe(3100);
    expect(environment.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
    expect(environment.NODE_ENV).toBe('test');
  });

  it('rejects an invalid port without echoing the value', () => {
    const input = {
      ...validEnvironment,
      APP_PORT: '70000',
    };

    expect(() => validateEnvironment(input)).toThrowError(/APP_PORT/);
    expect(() => validateEnvironment(input)).not.toThrowError(/70000/);
  });

  it('rejects a missing JWT secret', () => {
    const input = {
      ...validEnvironment,
      JWT_SECRET: undefined,
    };

    expect(() => validateEnvironment(input)).toThrowError(/JWT_SECRET/);
  });
});
