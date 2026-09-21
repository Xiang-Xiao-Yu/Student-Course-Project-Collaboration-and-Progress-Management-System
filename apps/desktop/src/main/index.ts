// P0 脚手架占位实现：只提供可启动的最小 Electron 窗口，证明工作区、构建和启动链路可用。
// 窗口尺寸、菜单、路由骨架、统一布局和安全策略由 T-02 在 P0.1 中实现并替换本文件。
import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';

const PRELOAD_PATH = join(__dirname, '../preload/index.js');
const RENDERER_HTML_PATH = join(__dirname, '../renderer/index.html');

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL'];

  if (rendererDevServerUrl) {
    void window.loadURL(rendererDevServerUrl);
  } else {
    void window.loadFile(RENDERER_HTML_PATH);
  }
}

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
