import { describe, expect, it } from 'vitest';

import { SHARED_SCAFFOLD_VERSION } from './index';

describe('packages/shared 脚手架', () => {
  it('可以导出占位常量，证明 vitest 已接通', () => {
    expect(SHARED_SCAFFOLD_VERSION).toBe('0.1.0');
  });
});
