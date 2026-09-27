import { randomUUID } from 'node:crypto';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(value: unknown): string {
  if (typeof value === 'string' && SAFE_REQUEST_ID_PATTERN.test(value)) {
    return value;
  }

  return randomUUID();
}

export { REQUEST_ID_HEADER };
