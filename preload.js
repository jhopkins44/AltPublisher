const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pubViewer', {
  openPubFile: () => ipcRenderer.invoke('open-pub-file'),
  openProjectFile: () => ipcRenderer.invoke('open-project-file'),
  saveProjectFile: document => ipcRenderer.invoke('save-project-file', document),
  printDocument: () => ipcRenderer.invoke('print-document'),
  onPubFileLoaded: callback => {
    ipcRenderer.on('pub-file-loaded', (_event, data) => callback(data));
  },
  onProjectFileLoaded: callback => {
    ipcRenderer.on('project-file-loaded', (_event, data) => callback(data));
  },
  onSaveRequested: callback => {
    ipcRenderer.on('request-save-project', () => callback());
  },
  onDiagnosticsVisibilityChanged: callback => {
    ipcRenderer.on('set-diagnostics-visible', (_event, visible) => callback(Boolean(visible)));
  }
});
