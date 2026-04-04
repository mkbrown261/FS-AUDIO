const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f1a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Flowstate Audio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // allow local audio file loading
    },
    icon: path.join(__dirname, '../public/icon.png'),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ label: 'Flowstate Audio', submenu: [
      { label: 'About Flowstate Audio', click: () => { mainWindow?.webContents.send('menu:action', 'about') } },
      { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' }
    ] }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:action', 'new-project') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: async () => {
          const res = await dialog.showOpenDialog(mainWindow, { filters: [{ name: 'Flowstate Audio', extensions: ['fsa', 'json'] }], properties: ['openFile'] })
          if (!res.canceled && res.filePaths[0]) {
            const data = fs.readFileSync(res.filePaths[0], 'utf8')
            mainWindow?.webContents.send('menu:action', 'load-project', data)
          }
        }},
        { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu:action', 'save-project') },
        { label: 'Save Project As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu:action', 'save-project-as') },
        { type: 'separator' },
        { label: 'Import Audio File…', accelerator: 'CmdOrCtrl+I', click: () => mainWindow?.webContents.send('menu:action', 'import-audio') },
        { type: 'separator' },
        { label: 'Export / Bounce…', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('menu:action', 'export') },
        { label: 'Export Stems…', click: () => mainWindow?.webContents.send('menu:action', 'export-stems') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow?.webContents.send('menu:action', 'undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => mainWindow?.webContents.send('menu:action', 'redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Select All Clips', accelerator: 'CmdOrCtrl+A', click: () => mainWindow?.webContents.send('menu:action', 'select-all') },
        { label: 'Deselect All', accelerator: 'Escape', click: () => mainWindow?.webContents.send('menu:action', 'deselect-all') },
        { type: 'separator' },
        { label: 'Split at Playhead', accelerator: 'CmdOrCtrl+T', click: () => mainWindow?.webContents.send('menu:action', 'split-at-playhead') },
        { label: 'Delete Selected', accelerator: 'Backspace', click: () => mainWindow?.webContents.send('menu:action', 'delete-selected') },
      ]
    },
    {
      label: 'Track',
      submenu: [
        { label: 'Add Audio Track', accelerator: 'CmdOrCtrl+Shift+A', click: () => mainWindow?.webContents.send('menu:action', 'add-audio-track') },
        { label: 'Add MIDI Track', accelerator: 'CmdOrCtrl+Shift+M', click: () => mainWindow?.webContents.send('menu:action', 'add-midi-track') },
        { label: 'Add Bus Track', click: () => mainWindow?.webContents.send('menu:action', 'add-bus-track') },
        { type: 'separator' },
        { label: 'Duplicate Selected Track', accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('menu:action', 'duplicate-track') },
        { label: 'Delete Selected Track', click: () => mainWindow?.webContents.send('menu:action', 'delete-track') },
        { type: 'separator' },
        { label: 'Mute Track', accelerator: 'M', click: () => mainWindow?.webContents.send('menu:action', 'mute-track') },
        { label: 'Solo Track', accelerator: 'S', click: () => mainWindow?.webContents.send('menu:action', 'solo-track') },
        { label: 'Arm for Recording', accelerator: 'R', click: () => mainWindow?.webContents.send('menu:action', 'arm-track') },
        { label: 'Freeze Track', click: () => mainWindow?.webContents.send('menu:action', 'freeze-track') },
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Show Mixer', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.send('menu:action', 'show-mixer') },
        { label: 'Show Piano Roll', accelerator: 'CmdOrCtrl+4', click: () => mainWindow?.webContents.send('menu:action', 'show-piano-roll') },
        { label: 'Show Clawbot', accelerator: 'CmdOrCtrl+9', click: () => mainWindow?.webContents.send('menu:action', 'show-clawbot') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => mainWindow?.webContents.send('menu:action', 'zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow?.webContents.send('menu:action', 'zoom-out') },
        { label: 'Fit to Window', accelerator: 'CmdOrCtrl+0', click: () => mainWindow?.webContents.send('menu:action', 'zoom-fit') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
      ]
    },
    {
      label: 'Transport',
      submenu: [
        { label: 'Play / Pause', accelerator: 'Space', click: () => mainWindow?.webContents.send('menu:action', 'play-pause') },
        { label: 'Stop', accelerator: 'Return', click: () => mainWindow?.webContents.send('menu:action', 'stop') },
        { label: 'Record', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.send('menu:action', 'record') },
        { label: 'Toggle Loop', accelerator: 'L', click: () => mainWindow?.webContents.send('menu:action', 'toggle-loop') },
        { label: 'Go to Start', accelerator: 'Home', click: () => mainWindow?.webContents.send('menu:action', 'go-to-start') },
        { label: 'Go to End', accelerator: 'End', click: () => mainWindow?.webContents.send('menu:action', 'go-to-end') },
        { type: 'separator' },
        { label: 'Toggle Metronome', accelerator: 'K', click: () => mainWindow?.webContents.send('menu:action', 'toggle-metronome') },
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Flowstate Audio Documentation', click: () => shell.openExternal('https://github.com/mkbrown261/FS-AUDIO') },
        { label: 'Flowstate Hub', click: () => shell.openExternal('https://flowstate-67g.pages.dev') },
        { label: 'Report an Issue', click: () => shell.openExternal('https://github.com/mkbrown261/FS-AUDIO/issues') },
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('audio:import-file', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Audio File',
    filters: [
      { name: 'Audio Files', extensions: ['wav', 'mp3', 'aiff', 'flac', 'm4a', 'ogg'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  })
  return res.canceled ? null : res.filePaths
})

ipcMain.handle('audio:export', async (_, opts) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export / Bounce',
    defaultPath: (opts?.name || 'flowstate-audio-export') + '.wav',
    filters: [
      { name: 'WAV', extensions: ['wav'] },
      { name: 'MP3', extensions: ['mp3'] },
      { name: 'AIFF', extensions: ['aiff'] },
    ]
  })
  return res.canceled ? null : res.filePath
})

ipcMain.handle('project:save', async (_, data) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: (data?.name || 'untitled') + '.fsa',
    filters: [{ name: 'Flowstate Audio Project', extensions: ['fsa'] }]
  })
  if (!res.canceled && res.filePath) {
    fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2))
    return res.filePath
  }
  return null
})

ipcMain.handle('project:load', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: 'Flowstate Audio Project', extensions: ['fsa', 'json'] }],
    properties: ['openFile']
  })
  if (!res.canceled && res.filePaths[0]) {
    return JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'))
  }
  return null
})

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
