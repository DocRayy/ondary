const { app, BrowserWindow, Notification, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.ELECTRON_DEV === 'true';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:4200');
    return;
  }

  win.loadFile(path.join(__dirname, '../dist/ondary/browser/index.html'));
}

ipcMain.handle('ondary:is-desktop', () => true);
ipcMain.handle('ondary:notify', (_event, payload) => {
  if (!Notification.isSupported()) {
    return false;
  }

  new Notification({
    title: payload?.title || 'Ondary',
    body: payload?.body || payload?.message || '',
  }).show();

  return true;
});

app.whenReady().then(() => {
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
