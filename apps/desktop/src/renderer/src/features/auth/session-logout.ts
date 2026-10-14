export async function completeServerLogout(
  request: () => Promise<void>,
  onSuccess: () => void,
  onFailure: (error: unknown) => void,
): Promise<void> {
  try {
    await request();
    onSuccess();
  } catch (error: unknown) {
    onFailure(error);
  }
}
