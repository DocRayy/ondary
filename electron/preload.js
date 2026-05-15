const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ondaryDesktop', {
  isDesktop: () => ipcRenderer.invoke('ondary:is-desktop'),
  notify: (payload) => ipcRenderer.invoke('ondary:notify', payload),
});
