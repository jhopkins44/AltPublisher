const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { extractStructure } = require('./parser');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-finish-load', async () => {
    const fileArg = process.argv.find(arg => arg.toLowerCase().endsWith('.pub'));
    if (fileArg && fs.existsSync(fileArg)) {
      await loadPubFile(fileArg);
    }
  });
}

async function loadPubFile(filePath) {
  const result = await extractStructure(filePath);
  mainWindow.webContents.send('pub-file-loaded', result);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-pub-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Publisher File',
    properties: ['openFile'],
    filters: [{ name: 'Publisher files', extensions: ['pub'] }, { name: 'All files', extensions: ['*'] }]
  });

  if (canceled || !filePaths.length) {
    return null;
  }

  return loadPubFile(filePaths[0]);
});
