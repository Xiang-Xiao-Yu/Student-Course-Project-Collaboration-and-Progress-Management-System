import { BrowserWindow, app, session } from 'electron';
import { join } from 'node:path';

const APP_USER_MODEL_ID = 'com.scpc.desktop';
const PRELOAD_PATH = join(__dirname, '../preload/index.js');
const RENDERER_HTML_PATH = join(__dirname, '../renderer/index.html');

function getApiOrigin(): string {
  const apiBaseUrl = process.env['ELECTRON_API_BASE_URL'] ?? 'http://127.0.0.1:3000/api/v1';

  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

function configureContentSecurityPolicy(): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return;
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${getApiOrigin()}`,
        ],
      },
    });
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  window.setMenuBarVisibility(false);

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

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => {
    event.preventDefault();
  });
});

void app.whenReady().then(() => {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  configureContentSecurityPolicy();
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
