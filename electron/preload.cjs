const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('riftcastPreview', Object.freeze({
  embed: (kind, bounds) => ipcRenderer.invoke('riftcast-preview:embed', kind, bounds),
  position: (kind, bounds) => ipcRenderer.invoke('riftcast-preview:position', kind, bounds),
  release: kind => ipcRenderer.invoke('riftcast-preview:release', kind),
}));
