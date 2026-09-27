import {
  EnvironmentVariables,
  LOG_LEVELS,
  LogLevel,
  NODE_ENVIRONMENTS,
  NodeEnvironment,
} from './environment';

function readString(config: Record<string, unknown>, key: string, fallback?: string): string {
  const rawValue = config[key];
  const value = rawValue === undefined || rawValue === '' ? fallback : String(rawValue).trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function readNodeEnvironment(config: Record<string, unknown>): NodeEnvironment {
  const value = readString(config, 'NODE_ENV', 'development');

  if (!NODE_ENVIRONMENTS.includes(value as NodeEnvironment)) {
    throw new Error(`NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(', ')}`);
  }

  return value as NodeEnvironment;
}

function readPort(config: Record<string, unknown>): number {
  const value = readString(config, 'APP_PORT', '3000');
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('APP_PORT must be an integer between 1 and 65535');
  }

  return port;
}

function readLogLevel(config: Record<string, unknown>): LogLevel {
  const value = readString(config, 'LOG_LEVEL', 'info');

  if (!LOG_LEVELS.includes(value as LogLevel)) {
    throw new Error(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`);
  }

  return value as LogLevel;
}

function readCorsOrigins(config: Record<string, unknown>, nodeEnv: NodeEnvironment): string[] {
  const rawValue = readString(config, 'CORS_ORIGINS', 'http://localhost:5173');
  const origins = rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin');
  }

  if (nodeEnv === 'production' && origins.includes('*')) {
    throw new Error('CORS_ORIGINS cannot contain * in production');
  }

  return origins;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const nodeEnv = readNodeEnvironment(config);
  const jwtSecret = readString(config, 'JWT_SECRET');

  if (nodeEnv === 'production' && jwtSecret === 'replace-with-local-secret') {
    throw new Error('JWT_SECRET must not use the placeholder value in production');
  }

  return {
    APP_HOST: readString(config, 'APP_HOST', '127.0.0.1'),
    APP_PORT: readPort(config),
    CORS_ORIGINS: readCorsOrigins(config, nodeEnv),
    DATABASE_URL: readString(config, 'DATABASE_URL'),
    JWT_EXPIRES_IN: readString(config, 'JWT_EXPIRES_IN', '2h'),
    JWT_SECRET: jwtSecret,
    LOG_LEVEL: readLogLevel(config),
    NODE_ENV: nodeEnv,
  };
}
