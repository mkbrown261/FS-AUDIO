const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  importAudioFile: () => ipcRenderer.invoke('audio:import-file'),
  exportProject: (opts) => ipcRenderer.invoke('audio:export', opts),
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  loadProject: () => ipcRenderer.invoke('project:load'),
  onMenuAction: (cb) => ipcRenderer.on('menu:action', (_, ...args) => cb(...args)),
  platform: process.platform,
})
