const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pubViewer', {
  openFile: () => ipcRenderer.invoke('open-pub-file'),
  onFileLoaded: callback => {
    ipcRenderer.on('pub-file-loaded', (_event, data) => callback(data));
  }
});
