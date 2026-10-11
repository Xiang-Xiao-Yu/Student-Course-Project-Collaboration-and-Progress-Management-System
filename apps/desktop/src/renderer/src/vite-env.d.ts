/// <reference types="vite/client" />

interface DesktopRuntimeConfig {
  readonly platform: string;
  readonly apiBaseUrl: string;
}

interface Window {
  readonly desktopRuntime?: DesktopRuntimeConfig;
}
