const FALLBACK_API_BASE_URL = 'http://127.0.0.1:3000/api/v1';

export interface DesktopRuntimeConfig {
  readonly platform: string;
  readonly apiBaseUrl: string;
}

export function getDesktopRuntimeConfig(): DesktopRuntimeConfig {
  if (typeof window !== 'undefined' && window.desktopRuntime) {
    return window.desktopRuntime;
  }

  return {
    platform: 'browser',
    apiBaseUrl: FALLBACK_API_BASE_URL,
  };
}
