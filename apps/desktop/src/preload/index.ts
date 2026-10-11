import { contextBridge } from 'electron';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000/api/v1';

function getApiBaseUrl(): string {
  const configuredBaseUrl = process.env['ELECTRON_API_BASE_URL'] ?? DEFAULT_API_BASE_URL;

  try {
    return new URL(configuredBaseUrl).toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

const desktopRuntime = Object.freeze({
  platform: process.platform,
  apiBaseUrl: getApiBaseUrl(),
});

contextBridge.exposeInMainWorld('desktopRuntime', desktopRuntime);

export type DesktopRuntime = typeof desktopRuntime;
