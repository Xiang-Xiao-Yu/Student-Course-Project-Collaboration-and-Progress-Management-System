import { contextBridge } from 'electron';

const desktopRuntime = Object.freeze({
  platform: process.platform,
});

contextBridge.exposeInMainWorld('desktopRuntime', desktopRuntime);

export type DesktopRuntime = typeof desktopRuntime;
