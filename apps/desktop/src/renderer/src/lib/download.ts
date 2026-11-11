import type { ApiDownload } from './api/client';

export function saveDownload(download: ApiDownload): void {
  const objectUrl = URL.createObjectURL(download.blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = download.filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
