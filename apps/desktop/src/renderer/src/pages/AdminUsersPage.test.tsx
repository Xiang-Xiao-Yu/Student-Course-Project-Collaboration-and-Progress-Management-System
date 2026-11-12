import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminUserRows } from './AdminUsersPage';

const base = {
  id: 'user',
  username: 'student',
  nickname: '学生',
  status: 'ACTIVE',
  isPlatformAdmin: false,
  updatedAt: '2026-11-12T00:00:00Z',
};
describe('administrator disable actions', () => {
  it('offers the action for an active ordinary user', () => {
    expect(
      renderToStaticMarkup(<AdminUserRows users={[base]} pending={false} onDisable={vi.fn()} />),
    ).toContain('禁用用户</button>');
  });
  it('protects administrator accounts and shows disabled users without another action', () => {
    const html = renderToStaticMarkup(
      <AdminUserRows
        users={[
          { ...base, isPlatformAdmin: true },
          { ...base, id: 'disabled', status: 'DISABLED' },
        ]}
        pending={false}
        onDisable={vi.fn()}
      />,
    );
    expect(html).toContain('管理员账号受保护');
    expect(html).toContain('已禁用');
    expect(html).not.toContain('<button');
  });
  it('disables conflicting actions while a disable request is pending', () => {
    expect(
      renderToStaticMarkup(<AdminUserRows users={[base]} pending onDisable={vi.fn()} />),
    ).toContain('disabled=""');
  });
});
