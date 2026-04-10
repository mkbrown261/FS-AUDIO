const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Local file operations ───────────────────────────────────────────────────
  importAudioFile: () => ipcRenderer.invoke('audio:import-file'),
  exportProject: (opts) => ipcRenderer.invoke('audio:export', opts),
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  loadProject: () => ipcRenderer.invoke('project:load'),
  onMenuAction: (cb) => ipcRenderer.on('menu:action', (_, ...args) => cb(...args)),
  platform: process.platform,

  // ── FlowState Auth ──────────────────────────────────────────────────────────
  startAuth: (state) => ipcRenderer.invoke('flowstate:start-auth', state),
  getVersion: () => ipcRenderer.invoke('flowstate:get-version'),
  getUser: () => ipcRenderer.invoke('flowstate:get-user'),
  getToken: () => ipcRenderer.invoke('flowstate:get-token'),
  signOut: () => ipcRenderer.invoke('flowstate:sign-out'),

  // ── Cloud Save / Load (R2 Storage) ──────────────────────────────────────────
  cloudSave: (projectData) => ipcRenderer.invoke('cloud:save', projectData),
  cloudList: () => ipcRenderer.invoke('cloud:list'),
  cloudLoad: (r2Key) => ipcRenderer.invoke('cloud:load', r2Key),
  cloudDelete: (r2Key) => ipcRenderer.invoke('cloud:delete', r2Key),

  // ── AI Tools (proxied through FlowState backend) ────────────────────────────
  aiGenerate: (params) => ipcRenderer.invoke('ai:generate', params),
  aiStatus: () => ipcRenderer.invoke('ai:status'),
})
