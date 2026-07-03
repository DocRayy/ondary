const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage } = require('electron');
const path = require('path');

const isDev = process.env.ELECTRON_DEV === 'true';
const iconCandidates = isDev
  ? [path.join(__dirname, '../public/images/ondary-logo-white.png')]
  : [
      path.join(__dirname, '../dist/ondary/browser/images/ondary-logo-white.png'),
      path.join(__dirname, '../public/images/ondary-logo-white.png'),
    ];
const fallbackIconDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAK0lEQVR4AWNkYGD4z0ABYBw1gBsw4pHEgGnAqEbiAKMGjGokDQAAo2sCHV/L1S0AAAAASUVORK5CYII=';
const appIcon = getAppIconPath();
let mainWindow = null;
let tray = null;
let isQuitting = false;

function getAppIconPath() {
  return iconCandidates.find((candidate) => {
    const image = nativeImage.createFromPath(candidate);
    return !image.isEmpty();
  });
}

function getAppIconImage() {
  if (appIcon) {
    const image = nativeImage.createFromPath(appIcon);
    if (!image.isEmpty()) {
      return image;
    }
  }

  return nativeImage.createFromDataURL(fallbackIconDataUrl);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    icon: getAppIconImage(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
    return;
  }

  mainWindow.loadFile(path.join(__dirname, '../dist/ondary/browser/index.html'));
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(getAppIconImage());
  tray.setToolTip('Ondary');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Ondary', click: showMainWindow },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showMainWindow);
}

ipcMain.handle('ondary:is-desktop', () => true);
ipcMain.handle('ondary:notify', (_event, payload) => {
  if (!Notification.isSupported()) {
    return false;
  }

  const notification = new Notification({
    title: payload?.title || 'Ondary',
    body: payload?.body || payload?.message || '',
    icon: getAppIconImage(),
  });

  notification.on('click', showMainWindow);
  notification.show();

  return true;
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.ondary.app');
  createWindow();
  createTray();

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});
