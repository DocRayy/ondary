const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Send an event to show the context menu
  showContextMenu: () => {
    try {
      ipcRenderer.send('show-context-menu');
    } catch (error) {
      console.error('Failed to send show-context-menu event:', error);
    }
  },

  // Listen for context menu commands from the main process
  onContextMenuCommand: (callback) => {
    try {
      const listener = (event, command) => callback(command);

      // Add listener
      ipcRenderer.on('context-menu-command', listener);

      // Return a cleanup function
      return () => {
        ipcRenderer.removeListener('context-menu-command', listener);
      };
    } catch (error) {
      console.error('Failed to set up context menu command listener:', error);
    }
  },
});
