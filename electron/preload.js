const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Local file operations ───────────────────────────────────────────────────
  importAudioFile: () => ipcRenderer.invoke('audio:import-file'),
  exportProject: (opts) => ipcRenderer.invoke('audio:export', opts),

  // project:save — shows Save dialog if no path yet (Save As), or writes to
  // the existing path directly (Save).  Returns { filePath } or null on cancel.
  saveProject: (data) => ipcRenderer.invoke('project:save', data),

  // project:save-as — always shows the Save dialog regardless of current path.
  saveProjectAs: (data) => ipcRenderer.invoke('project:save-as', data),

  // project:save-to-path — write directly to a known path without a dialog.
  saveProjectToPath: (filePath, data) => ipcRenderer.invoke('project:save-to-path', filePath, data),

  // project:load — shows Open dialog, returns parsed project JSON + filePath.
  loadProject: () => ipcRenderer.invoke('project:load'),

  // project:load-from-path — read a .fsa file at a known path (recent files).
  loadProjectFromPath: (filePath) => ipcRenderer.invoke('project:load-from-path', filePath),

  // audio:copy-to-project — copies an audio blob / file into the project _audio
  // folder so it survives the session.  Returns the new absolute file:// path.
  copyAudioToProject: (srcBlobOrPath, projectFilePath, fileName) =>
    ipcRenderer.invoke('audio:copy-to-project', srcBlobOrPath, projectFilePath, fileName),

  // audio:read-file — reads a file at an absolute path and returns an ArrayBuffer.
  readAudioFile: (filePath) => ipcRenderer.invoke('audio:read-file', filePath),

  // audio:write-audio-buffer — write raw bytes to projectFilePath/_audio/fileName
  // Returns absolute path to the written file.
  writeAudioBuffer: (projectFilePath, fileName, uint8Array) =>
    ipcRenderer.invoke('audio:write-audio-buffer', projectFilePath, fileName, uint8Array),

  onMenuAction: (cb) => ipcRenderer.on('menu:action', (_, ...args) => cb(...args)),
  platform: process.platform,

  // ── FlowState Auth ──────────────────────────────────────────────────────────
  startAuth: (state) => ipcRenderer.invoke('gate:start-auth', state),
  openExternal: (url) => ipcRenderer.invoke('gate:open-external', url),
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
