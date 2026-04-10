/**
 * FLOWSTATE AUDIO — Electron Main Process (UPDATED)
 * ===================================================
 * Changes from original:
 * 1. Added FlowState auth gate (mirrors 264 Pro pattern)
 * 2. Added cloud save/load for .fsa projects via FLOWSTATE R2
 * 3. Added deep-link handler (fsaudio://auth)
 * 4. Token stored in userData/fs_token.txt
 * 5. All AI tool calls proxy through FLOWSTATE backend
 *
 * Drop-in replacement for electron/main.js in FS-AUDIO repo.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ── FlowState Integration ─────────────────────────────────────────────────────
const FS_BASE_URL    = 'https://flowst8.cc'
const FS_VERIFY_URL  = `${FS_BASE_URL}/api/fsaudio/verify-token`
const TOKEN_FILE     = () => path.join(app.getPath('userData'), 'fs_token.txt')

let mainWindow = null
let gateWindow = null
let pendingAuthState = null

// ── Read/write token from userData ───────────────────────────────────────────
async function readToken() {
  try { return fs.readFileSync(TOKEN_FILE(), 'utf8').trim() } catch { return null }
}
async function writeToken(token) {
  fs.writeFileSync(TOKEN_FILE(), token, 'utf8')
}
async function clearToken() {
  try { fs.writeFileSync(TOKEN_FILE(), '', 'utf8') } catch {}
}

// ── Verify token with FLOWSTATE backend ──────────────────────────────────────
async function verifyToken(token) {
  try {
    const res = await fetch(FS_VERIFY_URL, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    return await res.json()
  } catch {
    return { valid: false }
  }
}

// ── Proxy all API calls through FLOWSTATE backend ────────────────────────────
async function flowstateApiCall(path, method = 'GET', body = null) {
  const token = await readToken()
  if (!token) throw new Error('Not authenticated')

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  }
  if (body) options.body = JSON.stringify(body)

  const res = await fetch(`${FS_BASE_URL}${path}`, options)
  return res.json()
}

// ─── Gate Window (sign-in screen) ────────────────────────────────────────────
function createGateWindow() {
  gateWindow = new BrowserWindow({
    width: 580,
    height: 480,
    resizable: false,
    center: true,
    frame: false,
    backgroundColor: '#0f0f1a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'FlowState Audio — Sign In',
  })

  // Inline gate HTML — no separate file needed
  const gateHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: #0f0f1a;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100vh; gap: 24px;
  -webkit-app-region: drag;
}
.logo { font-size: 2.2rem; font-weight: 800; color: #a855f7; letter-spacing: -0.02em; }
.sub  { font-size: 0.9rem; color: rgba(255,255,255,0.5); text-align: center; max-width: 340px; line-height: 1.5; }
.btn  {
  -webkit-app-region: no-drag;
  background: #a855f7; color: #fff; border: none; border-radius: 10px;
  padding: 12px 32px; font-size: 1rem; font-weight: 600; cursor: pointer;
  transition: background 0.18s;
}
.btn:hover { background: #9333ea; }
.status { font-size: 0.82rem; color: rgba(255,255,255,0.4); min-height: 20px; }
.version { position: absolute; bottom: 18px; font-size: 0.75rem; color: rgba(255,255,255,0.2); }
</style>
</head>
<body>
<div class="logo">FlowState Audio</div>
<div class="sub">Sign in with your FlowState account to access AI tools and cloud storage.</div>
<button class="btn" id="signInBtn">Sign In with FlowState</button>
<div class="status" id="status"></div>
<div class="version" id="ver"></div>
<script>
  const btn = document.getElementById('signInBtn')
  const status = document.getElementById('status')
  const ver = document.getElementById('ver')

  window.electronAPI?.getVersion?.().then(v => { ver.textContent = 'v' + v })

  btn.addEventListener('click', async () => {
    btn.disabled = true
    btn.textContent = 'Opening browser…'
    status.textContent = 'Waiting for sign-in…'
    const state = Math.random().toString(36).slice(2)
    await window.electronAPI?.startAuth?.(state)
  })

  // Listen for auth result from main process
  window.addEventListener('message', e => {
    if (e.data?.type === 'auth-result') {
      if (e.data.success) {
        status.textContent = 'Signed in! Opening FlowState Audio…'
      } else {
        status.textContent = 'Sign-in failed: ' + (e.data.error || 'Unknown error')
        btn.disabled = false
        btn.textContent = 'Try Again'
      }
    }
  })
</script>
</body>
</html>`

  gateWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gateHtml)}`)

  gateWindow.on('closed', () => {
    gateWindow = null
    if (BrowserWindow.getAllWindows().length === 0) app.quit()
  })

  return gateWindow
}

// ─── Main editor window ───────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f1a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'FlowState Audio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // allow local audio file loading
    },
    icon: path.join(__dirname, '../public/icon.png'),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(err => {
      dialog.showErrorBox('Dev Server Not Running',
        'Could not connect to Vite dev server at http://localhost:5173\n\nRun: npm run dev')
      app.quit()
    })
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    if (!fs.existsSync(indexPath)) {
      dialog.showErrorBox('Build Not Found', 'Run: npm run build')
      app.quit()
      return
    }
    mainWindow.loadFile(indexPath).catch(err => console.error('[Electron] Load failed:', err))
  }

  // Close guard
  let closeRequested = false
  mainWindow.on('close', (e) => {
    if (!closeRequested) {
      e.preventDefault()
      closeRequested = true
      mainWindow.webContents.executeJavaScript('window.__checkUnsaved ? window.__checkUnsaved() : false')
        .then(hasUnsaved => {
          if (hasUnsaved) {
            const choice = dialog.showMessageBoxSync(mainWindow, {
              type: 'question',
              buttons: ['Save', "Don't Save", 'Cancel'],
              title: 'Unsaved Changes',
              message: 'Save changes before closing?',
              defaultId: 0, cancelId: 2,
            })
            if (choice === 0) {
              mainWindow.webContents.send('menu:action', 'save-project')
              setTimeout(() => mainWindow.close(), 600)
            } else if (choice === 1) { closeRequested = false; mainWindow.destroy() }
            else closeRequested = false
          } else { closeRequested = false; mainWindow.destroy() }
        })
        .catch(() => { closeRequested = false; mainWindow.destroy() })
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── Launch flow ──────────────────────────────────────────────────────────────
// FS-Audio is a FREE desktop DAW — it opens immediately without any sign-in.
// Sign-in is only required when the user tries to use AI tools (ClawBot,
// Suno, MusicGen) or cloud save/load. Those features check the token at
// call-time and prompt for auth if needed — they do NOT block startup.
async function launch() {
  buildMenu()
  createMainWindow()

  // Silently verify token in the background (no UI shown on failure).
  // This warms up the auth state so AI features feel instant when used.
  const token = await readToken()
  if (token) {
    const result = await verifyToken(token)
    if (!result.valid) {
      // Token expired/revoked — clear it silently. User will be prompted
      // when they actually try to use an AI feature.
      await clearToken()
    }
  }
  // No token at all is fine — app works fully for local DAW use.
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ label: 'FlowState Audio', submenu: [
      { label: 'About FlowState Audio', click: () => mainWindow?.webContents.send('menu:action', 'about') },
      { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' },
    ]}] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project',          accelerator: 'CmdOrCtrl+N',       click: () => mainWindow?.webContents.send('menu:action', 'new-project') },
        { label: 'Open Project…',        accelerator: 'CmdOrCtrl+O',       click: () => mainWindow?.webContents.send('menu:action', 'open-project') },
        { label: 'Open from Cloud…',     accelerator: 'CmdOrCtrl+Shift+O', click: () => mainWindow?.webContents.send('menu:action', 'cloud-open') },
        { label: 'Save Project',         accelerator: 'CmdOrCtrl+S',       click: () => mainWindow?.webContents.send('menu:action', 'save-project') },
        { label: 'Save to Cloud',        accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu:action', 'cloud-save') },
        { label: 'Save Project As…',     click: () => mainWindow?.webContents.send('menu:action', 'save-project-as') },
        { type: 'separator' },
        { label: 'Import Audio File…',   accelerator: 'CmdOrCtrl+I',       click: () => mainWindow?.webContents.send('menu:action', 'import-audio') },
        { type: 'separator' },
        { label: 'Export / Bounce…',     accelerator: 'CmdOrCtrl+B',       click: () => mainWindow?.webContents.send('menu:action', 'export') },
        { label: 'Export Stems…',        click: () => mainWindow?.webContents.send('menu:action', 'export-stems') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo',              accelerator: 'CmdOrCtrl+Z',       click: () => mainWindow?.webContents.send('menu:action', 'undo') },
        { label: 'Redo',              accelerator: 'CmdOrCtrl+Shift+Z', click: () => mainWindow?.webContents.send('menu:action', 'redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Select All Clips', accelerator: 'CmdOrCtrl+A',       click: () => mainWindow?.webContents.send('menu:action', 'select-all') },
        { label: 'Deselect All',     accelerator: 'Escape',            click: () => mainWindow?.webContents.send('menu:action', 'deselect-all') },
        { type: 'separator' },
        { label: 'Split at Playhead',accelerator: 'CmdOrCtrl+T',       click: () => mainWindow?.webContents.send('menu:action', 'split-at-playhead') },
        { label: 'Delete Selected',  accelerator: 'Backspace',         click: () => mainWindow?.webContents.send('menu:action', 'delete-selected') },
      ],
    },
    {
      label: 'Track',
      submenu: [
        { label: 'Add Audio Track',         accelerator: 'CmdOrCtrl+Shift+A', click: () => mainWindow?.webContents.send('menu:action', 'add-audio-track') },
        { label: 'Add MIDI Track',          accelerator: 'CmdOrCtrl+Shift+M', click: () => mainWindow?.webContents.send('menu:action', 'add-midi-track') },
        { label: 'Add Bus Track',           click: () => mainWindow?.webContents.send('menu:action', 'add-bus-track') },
        { type: 'separator' },
        { label: 'Duplicate Selected Track',accelerator: 'CmdOrCtrl+D',       click: () => mainWindow?.webContents.send('menu:action', 'duplicate-track') },
        { label: 'Delete Selected Track',   click: () => mainWindow?.webContents.send('menu:action', 'delete-track') },
        { type: 'separator' },
        { label: 'Mute Track',   accelerator: 'M', click: () => mainWindow?.webContents.send('menu:action', 'mute-track') },
        { label: 'Solo Track',   accelerator: 'S', click: () => mainWindow?.webContents.send('menu:action', 'solo-track') },
        { label: 'Arm for Recording', accelerator: 'R', click: () => mainWindow?.webContents.send('menu:action', 'arm-track') },
        { label: 'Freeze Track', click: () => mainWindow?.webContents.send('menu:action', 'freeze-track') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Show Mixer',      accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.send('menu:action', 'show-mixer') },
        { label: 'Show Piano Roll', accelerator: 'CmdOrCtrl+4', click: () => mainWindow?.webContents.send('menu:action', 'show-piano-roll') },
        { label: 'Show Clawbot',    accelerator: 'CmdOrCtrl+9', click: () => mainWindow?.webContents.send('menu:action', 'show-clawbot') },
        { label: 'Cloud Projects',  accelerator: 'CmdOrCtrl+Shift+C', click: () => mainWindow?.webContents.send('menu:action', 'show-cloud-projects') },
        { type: 'separator' },
        { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: () => mainWindow?.webContents.send('menu:action', 'zoom-in') },
        { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: () => mainWindow?.webContents.send('menu:action', 'zoom-out') },
        { label: 'Fit to Window', accelerator: 'CmdOrCtrl+0', click: () => mainWindow?.webContents.send('menu:action', 'zoom-fit') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Transport',
      submenu: [
        { label: 'Play / Pause',    accelerator: 'Space',        click: () => mainWindow?.webContents.send('menu:action', 'play-pause') },
        { label: 'Stop',            accelerator: 'Return',       click: () => mainWindow?.webContents.send('menu:action', 'stop') },
        { label: 'Record',          accelerator: 'CmdOrCtrl+R',  click: () => mainWindow?.webContents.send('menu:action', 'record') },
        { label: 'Toggle Loop',     accelerator: 'L',            click: () => mainWindow?.webContents.send('menu:action', 'toggle-loop') },
        { label: 'Go to Start',     accelerator: 'Home',         click: () => mainWindow?.webContents.send('menu:action', 'go-to-start') },
        { label: 'Go to End',       accelerator: 'End',          click: () => mainWindow?.webContents.send('menu:action', 'go-to-end') },
        { type: 'separator' },
        { label: 'Toggle Metronome', accelerator: 'K', click: () => mainWindow?.webContents.send('menu:action', 'toggle-metronome') },
      ],
    },
    {
      label: 'Account',
      submenu: [
        { label: 'My FlowState Account', click: () => shell.openExternal('https://flowst8.cc') },
        { label: 'Subscription & Billing', click: () => shell.openExternal('https://flowst8.cc/#billing') },
        { type: 'separator' },
        { label: 'Sign Out', click: async () => {
          await clearToken()
          // Keep app open — just clear auth state and notify renderer
          if (mainWindow) mainWindow.webContents.send('menu:action', 'signed-out')
        }},
        { label: 'Sign In / Connect Account', click: async () => {
          // Open FlowState in browser for sign-in
          const state = Math.random().toString(36).slice(2)
          pendingAuthState = state
          shell.openExternal(`${FS_BASE_URL}/api/fsaudio/auth?state=${encodeURIComponent(state)}&redirect=fsaudio://auth`)
        }},
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'FlowState Audio Docs',  click: () => shell.openExternal('https://github.com/mkbrown261/FS-AUDIO') },
        { label: 'FlowState Hub',         click: () => shell.openExternal('https://flowst8.cc') },
        { label: 'Report an Issue',       click: () => shell.openExternal('https://github.com/mkbrown261/FS-AUDIO/issues') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── IPC: Original handlers (preserved) ──────────────────────────────────────

ipcMain.handle('audio:import-file', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Audio File',
    filters: [
      { name: 'Audio Files', extensions: ['wav', 'mp3', 'aiff', 'flac', 'm4a', 'ogg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  })
  return res.canceled ? null : res.filePaths
})

ipcMain.handle('audio:export', async (_, opts) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export / Bounce',
    defaultPath: (opts?.name || 'flowstate-audio-export') + '.' + (opts?.format || 'wav'),
    filters: [
      { name: 'WAV',  extensions: ['wav'] },
      { name: 'MP3',  extensions: ['mp3'] },
      { name: 'AIFF', extensions: ['aiff'] },
    ],
  })
  return res.canceled ? null : res.filePath
})

// ── Local project save/load ───────────────────────────────────────────────────

ipcMain.handle('project:save', async (_, data) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: (data?.name || 'untitled') + '.fsa',
    filters: [{ name: 'FlowState Audio Project', extensions: ['fsa'] }],
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
    filters: [{ name: 'FlowState Audio Project', extensions: ['fsa', 'json'] }],
    properties: ['openFile'],
  })
  if (!res.canceled && res.filePaths[0]) {
    return JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'))
  }
  return null
})

// ─── IPC: NEW — Cloud save via FLOWSTATE R2 ───────────────────────────────────

/**
 * cloud:save — saves a project JSON to R2 via FLOWSTATE backend.
 * Called by renderer when user picks "Save to Cloud" or via auto-save.
 */
ipcMain.handle('cloud:save', async (_, projectData) => {
  try {
    const token = await readToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    const projectJson = JSON.stringify(projectData)
    const projectName = projectData?.name || 'Untitled Project'
    const filename = projectName.replace(/[^a-z0-9]/gi, '_') + '.fsa'

    // Upload as multipart form-data to /api/r2/upload
    const { FormData, Blob } = require('node:buffer').Blob ? require('node:buffer') : globalThis
    const form = new FormData()
    const fileBlob = new Blob([Buffer.from(projectJson, 'utf8')], { type: 'application/json' })
    form.append('file', fileBlob, filename)
    form.append('app', 'fsaudio')

    const uploadRes = await fetch(`${FS_BASE_URL}/api/r2/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    })
    const uploadData = await uploadRes.json()
    if (!uploadData.ok) return { ok: false, error: uploadData.error || 'Upload failed' }

    return { ok: true, r2Key: uploadData.key, downloadUrl: `${FS_BASE_URL}${uploadData.url}` }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

/**
 * cloud:list — lists all cloud-saved projects for the current user.
 */
ipcMain.handle('cloud:list', async () => {
  try {
    const token = await readToken()
    if (!token) return { ok: false, error: 'Not authenticated', files: [] }

    const res = await fetch(`${FS_BASE_URL}/api/r2/list?app=fsaudio`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    return { ok: true, files: data.files ?? [] }
  } catch (err) {
    return { ok: false, error: err.message, files: [] }
  }
})

/**
 * cloud:load — downloads a project from R2 and returns the parsed JSON.
 */
ipcMain.handle('cloud:load', async (_, r2Key) => {
  try {
    const token = await readToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    const downloadUrl = `${FS_BASE_URL}/api/r2/file/${encodeURIComponent(r2Key)}`
    const res = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, error: `Download failed: ${res.status}` }

    const text = await res.text()
    const projectData = JSON.parse(text)
    return { ok: true, data: projectData }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

/**
 * cloud:delete — removes a project from R2 and D1 metadata.
 */
ipcMain.handle('cloud:delete', async (_, r2Key) => {
  try {
    const token = await readToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    const res = await fetch(`${FS_BASE_URL}/api/r2/file/${encodeURIComponent(r2Key)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    return { ok: data.ok }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: Auth / User info ────────────────────────────────────────────────────

ipcMain.handle('flowstate:get-token',  async () => readToken())
ipcMain.handle('flowstate:get-user',   async () => {
  const token = await readToken()
  if (!token) return null
  const result = await verifyToken(token)
  return result.valid ? { ...result.user, tier: result.tier, coinBalance: result.coinBalance } : null
})

ipcMain.handle('flowstate:api-call',   async (_, path, method, body) => {
  try { return await flowstateApiCall(path, method, body) }
  catch (e) { return { error: e.message } }
})

ipcMain.handle('flowstate:sign-out',   async () => {
  await clearToken()
  // Don't close the app — just clear token. The renderer will update its
  // UI to show "Sign In" state. App stays open for local DAW work.
  if (mainWindow) mainWindow.webContents.send('menu:action', 'signed-out')
  return { ok: true }
})

// Auth IPC — trigger sign-in from within the running app (no gate window)
ipcMain.handle('gate:get-version',    () => app.getVersion())
ipcMain.handle('gate:open-external',  (_, url) => shell.openExternal(url))
ipcMain.handle('gate:start-auth',     (_, state) => {
  pendingAuthState = state
  const authUrl = `${FS_BASE_URL}/api/fsaudio/auth?state=${encodeURIComponent(state)}&redirect=fsaudio://auth`
  shell.openExternal(authUrl)
})
ipcMain.handle('flowstate:get-version', () => app.getVersion())

// ─── Deep-link handler: fsaudio://auth?token=...&state=... ───────────────────

// Register custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('fsaudio', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('fsaudio')
}

async function handleDeepLink(url) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'auth') return

    const token = parsed.searchParams.get('token')
    const state = parsed.searchParams.get('state')

    if (!token || state !== pendingAuthState) {
      // Notify renderer of failure (if it opened auth flow)
      mainWindow?.webContents.send('menu:action', 'auth-failed')
      return
    }

    // Verify token
    const result = await verifyToken(token)
    if (!result.valid) {
      mainWindow?.webContents.send('menu:action', 'auth-failed')
      return
    }

    // Save token and notify renderer — app is already open, just unlock AI features
    await writeToken(token)
    pendingAuthState = null
    buildMenu() // Rebuild menu to show signed-in state
    // Notify renderer that user is now authenticated
    mainWindow?.webContents.send('menu:action', 'signed-in')
  } catch (err) {
    console.error('[Electron] Deep link error:', err.message)
  }
}

app.on('open-url', (_, url) => handleDeepLink(url))     // macOS
app.on('second-instance', (_, argv) => {                  // Windows/Linux
  const url = argv.find(a => a.startsWith('fsaudio://'))
  if (url) handleDeepLink(url)
  const win = mainWindow || gateWindow
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  launch()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) launch()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
