import type { Response } from 'express';

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;

  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export function createCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return `\uFEFF${rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n')}\r\n`;
}

export function setCsvDownloadHeaders(response: Response, filename: string): void {
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, '_');

  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  response.setHeader('Cache-Control', 'no-store');
}
