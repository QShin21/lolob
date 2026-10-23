const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('riftcastPreview', Object.freeze({
  embed: (kind, bounds) => ipcRenderer.invoke('riftcast-preview:embed', kind, bounds),
  position: (kind, bounds) => ipcRenderer.invoke('riftcast-preview:position', kind, bounds),
  release: kind => ipcRenderer.invoke('riftcast-preview:release', kind),
}));

contextBridge.exposeInMainWorld('riftcastDesktop', Object.freeze({
  programWindow: action => ipcRenderer.invoke('riftcast:program-window', action),
  choosePath: kind => ipcRenderer.invoke('riftcast:choose-path', kind),
  openLogs: () => ipcRenderer.invoke('riftcast:open-logs'),
  update: action => ipcRenderer.invoke('riftcast:update', action),
  globalShortcuts: request => ipcRenderer.invoke('riftcast:global-shortcuts', request),
  onGlobalShortcut: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('riftcast:global-shortcut', listener);
    return () => ipcRenderer.removeListener('riftcast:global-shortcut', listener);
  },
  onGlobalShortcutStatus: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('riftcast:global-shortcut-status', listener);
    return () => ipcRenderer.removeListener('riftcast:global-shortcut-status', listener);
  },
}));
