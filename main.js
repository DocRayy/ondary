const { app, BrowserWindow, Menu, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const remoteMain = require('@electron/remote/main');
const { screen } = require('electron');

// web host
const host =
  process.env.NODE_ENV === 'production' ? 'http://localhost:4200' : 'http://localhost:4201';

remoteMain.initialize();

let mainWindow;

const createWindow = () => {
  // fullsize
  const maxWidht = screen.getPrimaryDisplay().workAreaSize.width;
  const maxHeight = screen.getPrimaryDisplay().workAreaSize.height;
  mainWindow = new BrowserWindow({
    width: maxWidht,
    height: maxHeight,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      preload: path.join(app.getAppPath(), 'preload.js'),
    },
  });

  mainWindow.loadURL(host); // Your app's URL

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Function to create a window dynamically if not already created
const getOrCreateWindow = (name) => {
  switch (name) {
    case 'main':
      if (!mainWindow) {
        createWindow();
      }
      return mainWindow;
    default:
      return null;
  }
};

ipcMain.on('show-context-menu', (event) => {
  const template = [
    {
      label: 'View', // detail, short, default
      submenu: [],
    },
    { type: 'separator' },
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

// Listener for focusing a window
ipcMain.on('window-focus', (event, windowName) => {
  const win = getOrCreateWindow(windowName);
  if (win) win.focus();
});

// Listener for resizing a window
ipcMain.on('window-size', (event, windowName, width, height, position) => {
  const win = getOrCreateWindow(windowName);

  if (win) {
    const { width: maxWidth, height: maxHeight } = screen.getPrimaryDisplay().workAreaSize;
    const halfWidth = Math.floor(maxWidth / 2);
    const halfHeight = Math.floor(maxHeight / 2);

    let positionX = win.getBounds().x;
    let positionY = win.getBounds().y;

    // Adjust width and height based on input
    if (width === 'max') {
      width = maxWidth;
    } else if (width === 'half') {
      width = halfWidth;
    }

    if (height === 'max') {
      height = maxHeight;
    } else if (height === 'half') {
      height = halfHeight;
    }

    // Determine position
    switch (position) {
      case 'top-left':
        positionX = 0;
        positionY = 0;
        break;
      case 'top-right':
        positionX = Math.floor(maxWidth - width);
        positionY = 0;
        break;
      case 'bottom-left':
        positionX = 0;
        positionY = Math.floor(maxHeight - height);
        break;
      case 'bottom-right':
        positionX = Math.floor(maxWidth - width);
        positionY = Math.floor(maxHeight - height);
        break;
      case 'center':
        positionX = Math.floor((maxWidth - width) / 2);
        positionY = Math.floor((maxHeight - height) / 2);
        break;
      default:
        break;
    }

    // Set the new window bounds
    win.setBounds({
      x: parseInt(positionX, 10),
      y: parseInt(positionY, 10),
      width: parseInt(width, 10),
      height: parseInt(height, 10),
    });
  }
});

// Listener for setting window position
ipcMain.on('window-position', (event, windowName, valueAddedX, valueAddedY) => {
  const win = getOrCreateWindow(windowName);

  if (valueAddedX == 'current') {
    valueAddedX = win.getBounds().x;
  }
  if (valueAddedY == 'current') {
    valueAddedY = win.getBounds().y;
  }
  if (win)
    win.setBounds({
      x: parseInt(valueAddedX, 10),
      y: parseInt(valueAddedY, 10),
      width: win.getBounds().width,
      height: win.getBounds().height,
    });
});

// Listener for closing a window
ipcMain.on('window-toggle', (event, windowName) => {
  const win = getOrCreateWindow(windowName);
  if (win) {
    if (win.isVisible()) {
      win.close();
    } else {
      win.show();
    }
  }
});

// Listener for navigating a window to a specific URL
ipcMain.on('window-navigate', (event, windowName, url) => {
  const win = getOrCreateWindow(windowName);
  console.log('window-navigate', windowName, url);
  if (win) {
    win.focus();
    win.loadURL(host + url);
  }
});

app.whenReady().then(() => {
  // createWindow();
  createWindow();

  // Recreate window when activated (for macOS)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Clean up windows on app close
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    getOrCreateWindow('main');
  }
});
