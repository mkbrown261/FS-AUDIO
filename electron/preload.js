const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  importAudioFile: () => ipcRenderer.invoke('audio:import-file'),
  exportProject: (opts) => ipcRenderer.invoke('audio:export', opts),
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  loadProject: () => ipcRenderer.invoke('project:load'),
  onMenuAction: (cb) => ipcRenderer.on('menu:action', (_, ...args) => cb(...args)),
  platform: process.platform,

  // ── Sample cache system ──────────────────────────────────────────────────
  // Check which filenames are already cached for an instrument
  // Returns: { [filename]: localPath | null }
  sampleCheckCache: (instrumentId, filenames) =>
    ipcRenderer.invoke('samples:check-cache', { instrumentId, filenames }),

  // Read a cached sample as Uint8Array (convert to ArrayBuffer in renderer)
  sampleReadCached: (instrumentId, filename) =>
    ipcRenderer.invoke('samples:read-cached', { instrumentId, filename }),

  // Download a single sample from URL and cache it to disk
  // Returns: { ok, cached, path }
  sampleDownload: (instrumentId, filename, url) =>
    ipcRenderer.invoke('samples:download', { instrumentId, filename, url }),

  // Get the local cache directory path
  sampleCacheDir: (instrumentId) =>
    ipcRenderer.invoke('samples:cache-dir', { instrumentId }),

  // Listen to per-file download progress events from main process
  // cb({ instrumentId, filename, pct, received, total })
  onSampleProgress: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('samples:progress', handler)
    // Return unsubscribe function
    return () => ipcRenderer.removeListener('samples:progress', handler)
  },
})
