import { describe, expect, it } from 'vitest';

import { hasUnsavedPasswordChanges, hasUnsavedProfileChanges } from './profile-form-state';

const profile = {
  nickname: '当前昵称',
};

describe('profile form dirty state', () => {
  it('normal scenario is clean when values match the saved profile', () => {
    expect(hasUnsavedProfileChanges(profile, '当前昵称')).toBe(false);
    expect(hasUnsavedPasswordChanges('', '', '')).toBe(false);
  });

  it('boundary scenario ignores surrounding nickname whitespace', () => {
    expect(hasUnsavedProfileChanges(profile, ' 当前昵称 ')).toBe(false);
    expect(hasUnsavedProfileChanges(profile, '新昵称')).toBe(true);
  });

  it('failure scenario detects any unsaved password input', () => {
    expect(hasUnsavedPasswordChanges('', 'new-password', '')).toBe(true);
  });
});
