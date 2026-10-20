export function shouldClearSessionForUnauthorized(
  currentRequestToken: string | null,
  unauthorizedRequestToken: string | null,
): boolean {
  return unauthorizedRequestToken !== null && unauthorizedRequestToken === currentRequestToken;
}
