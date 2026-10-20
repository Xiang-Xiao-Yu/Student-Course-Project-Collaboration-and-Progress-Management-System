import { describe, expect, it } from 'vitest';

import { hasUnsavedPasswordChanges, hasUnsavedProfileChanges } from './profile-form-state';

const profile = {
  avatarUrl: 'https://example.com/avatar.png',
  nickname: '当前昵称',
};

describe('profile form dirty state', () => {
  it('normal scenario is clean when values match the saved profile', () => {
    expect(hasUnsavedProfileChanges(profile, '当前昵称', 'https://example.com/avatar.png')).toBe(
      false,
    );
    expect(hasUnsavedPasswordChanges('', '', '')).toBe(false);
  });

  it('boundary scenario ignores surrounding whitespace and treats empty avatar as null', () => {
    expect(
      hasUnsavedProfileChanges({ avatarUrl: null, nickname: '当前昵称' }, ' 当前昵称 ', ''),
    ).toBe(false);
    expect(hasUnsavedProfileChanges(profile, '新昵称', '')).toBe(true);
  });

  it('failure scenario detects any unsaved password input', () => {
    expect(hasUnsavedPasswordChanges('', 'new-password', '')).toBe(true);
  });
});
