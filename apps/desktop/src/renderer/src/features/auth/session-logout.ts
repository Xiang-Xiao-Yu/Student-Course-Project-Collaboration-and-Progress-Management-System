export type ServerLogoutResult =
  { readonly status: 'completed' } | { readonly error: unknown; readonly status: 'failed' };

export async function requestServerLogout(
  request: () => Promise<void>,
): Promise<ServerLogoutResult> {
  try {
    await request();
    return { status: 'completed' };
  } catch (error: unknown) {
    return { error, status: 'failed' };
  }
}
