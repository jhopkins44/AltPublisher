const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { extractStructure } = require('./parser');

let mainWindow;
let diagnosticsPanelVisible = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
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
    mainWindow.webContents.send('set-diagnostics-visible', diagnosticsPanelVisible);
    const fileArg = process.argv.find(arg => arg.toLowerCase().endsWith('.pub'));
    if (fileArg && fs.existsSync(fileArg)) {
      await loadPubFile(fileArg);
    }
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open .pub...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            openPubDialog().catch(error => showError(error));
          }
        },
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            openProjectDialog().catch(error => showError(error));
          }
        },
        {
          label: 'Save Project...',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('request-save-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            printCurrentView().catch(error => showError(error));
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Show Unsupported Records Panel',
          type: 'checkbox',
          checked: diagnosticsPanelVisible,
          click: item => {
            diagnosticsPanelVisible = Boolean(item.checked);
            mainWindow?.webContents.send('set-diagnostics-visible', diagnosticsPanelVisible);
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showError(error) {
  dialog.showErrorBox('AltPublisher Error', error?.message || String(error));
}

async function loadPubFile(filePath) {
  const result = await extractStructure(filePath);
  mainWindow.webContents.send('pub-file-loaded', result);
  return result;
}

async function openPubDialog() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Publisher File',
    properties: ['openFile'],
    filters: [
      { name: 'Publisher files', extensions: ['pub'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (canceled || !filePaths.length) {
    return null;
  }

  return loadPubFile(filePaths[0]);
}

async function openProjectDialog() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open AltPublisher Project',
    properties: ['openFile'],
    filters: [
      { name: 'AltPublisher project', extensions: ['json'] },
      { name: 'JSON files', extensions: ['json'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (canceled || !filePaths.length) {
    return null;
  }

  const filePath = filePaths[0];
  const raw = await fs.promises.readFile(filePath, 'utf8');
  const document = JSON.parse(raw);
  mainWindow.webContents.send('project-file-loaded', {
    filePath,
    fileName: path.basename(filePath),
    kind: 'altpub-project',
    document
  });
  return true;
}

async function saveProjectDocument(documentData) {
  if (!documentData || typeof documentData !== 'object') {
    throw new Error('No project data was provided.');
  }

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save AltPublisher Project',
    defaultPath: `${documentData?.meta?.title || 'document'}.altpub.json`,
    filters: [
      { name: 'AltPublisher project', extensions: ['json'] },
      { name: 'JSON files', extensions: ['json'] }
    ]
  });

  if (canceled || !filePath) {
    return null;
  }

  const serialized = JSON.stringify(documentData, null, 2);
  await fs.promises.writeFile(filePath, `${serialized}\n`, 'utf8');
  return filePath;
}

function printCurrentView() {
  return new Promise((resolve, reject) => {
    if (!mainWindow) {
      reject(new Error('No active window to print.'));
      return;
    }

    mainWindow.webContents.print({ printBackground: true }, (success, errorType) => {
      if (!success) {
        reject(new Error(errorType || 'Print request failed.'));
        return;
      }
      resolve(true);
    });
  });
}

app.whenReady().then(() => {
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-pub-file', async () => openPubDialog());
ipcMain.handle('open-project-file', async () => openProjectDialog());
ipcMain.handle('save-project-file', async (_event, documentData) => saveProjectDocument(documentData));
ipcMain.handle('print-document', async () => printCurrentView());
