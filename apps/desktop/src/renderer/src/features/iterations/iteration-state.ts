import type { IterationFormValues } from './iteration-validation';
import { hasUnsavedIterationChanges } from './iteration-validation';

export function isIterationResponseCurrent(
  targetIterationId: string | null,
  currentIterationId: string | null,
): boolean {
  return targetIterationId === currentIterationId;
}

export function requiresIterationSwitchConfirmation(
  initial: IterationFormValues,
  current: IterationFormValues,
): boolean {
  return hasUnsavedIterationChanges(initial, current);
}

export type IterationStatsRefreshResult<T> =
  | { readonly status: 'fulfilled'; readonly value: T }
  | { readonly status: 'rejected'; readonly message: string };

export function resolveIterationStatsRefresh<T>(
  currentStats: T,
  result: IterationStatsRefreshResult<T>,
): { readonly error: string | null; readonly stats: T } {
  return result.status === 'fulfilled'
    ? { error: null, stats: result.value }
    : { error: result.message, stats: currentStats };
}
