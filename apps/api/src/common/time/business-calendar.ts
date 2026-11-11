export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
export const BUSINESS_TIME_ZONE_OFFSET_MINUTES = 8 * 60;
export const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
});

export function businessDayKey(value: Date): string {
  const parts = dayFormatter.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}-${month}-${day}`;
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MILLISECONDS);
}

export function dayKeyToUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function parseBusinessDateRange(value: string): { endExclusive: Date; start: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDay = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDay.getUTCFullYear() !== year ||
    utcDay.getUTCMonth() !== month - 1 ||
    utcDay.getUTCDate() !== day
  ) {
    return null;
  }

  const start = new Date(utcDay.getTime() - BUSINESS_TIME_ZONE_OFFSET_MINUTES * 60 * 1000);
  const endExclusive = new Date(start.getTime() + DAY_MILLISECONDS);
  return { endExclusive, start };
}

export function enumerateDayKeys(startKey: string, endKey: string, limit: number): string[] {
  const keys: string[] = [];
  let current = dayKeyToUtcDate(startKey);
  const end = dayKeyToUtcDate(endKey);

  while (current <= end && keys.length < limit) {
    keys.push(current.toISOString().slice(0, 10));
    current = new Date(current.getTime() + DAY_MILLISECONDS);
  }

  return keys;
}

export function differenceInDays(startKey: string, endKey: string): number {
  return Math.round(
    (dayKeyToUtcDate(endKey).getTime() - dayKeyToUtcDate(startKey).getTime()) / DAY_MILLISECONDS,
  );
}
