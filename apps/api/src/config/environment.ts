export interface EnvironmentVariables {
  APP_HOST: string;
  APP_PORT: number;
  CORS_ORIGINS: string[];
  DATABASE_URL: string;
  JWT_EXPIRES_IN: string;
  JWT_SECRET: string;
  LOG_LEVEL: LogLevel;
  NODE_ENV: NodeEnvironment;
}

export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
