const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('riftcastPreview', Object.freeze({
  embed: (kind, bounds) => ipcRenderer.invoke('riftcast-preview:embed', kind, bounds),
  position: (kind, bounds) => ipcRenderer.invoke('riftcast-preview:position', kind, bounds),
  release: kind => ipcRenderer.invoke('riftcast-preview:release', kind),
}));

contextBridge.exposeInMainWorld('riftcastDesktop', Object.freeze({
  choosePath: kind => ipcRenderer.invoke('riftcast:choose-path', kind),
  openLogs: () => ipcRenderer.invoke('riftcast:open-logs'),
}));
