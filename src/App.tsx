import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useProjectStore } from './store/projectStore'
import { useAudioEngine } from './hooks/useAudioEngine'
import { loadSFZFile, loadSFZSamples, extractSamplePaths } from './utils/sfzLoader'
import { useTransport } from './hooks/useTransport'
import { Toolbar } from './components/Toolbar'
import { TrackList } from './components/TrackList'
import { Timeline } from './components/Timeline'
import { Mixer } from './components/Mixer'
import { PluginWindowManager } from './components/PluginWindowManager'
import { PianoRoll } from './components/PianoRoll'
import { ClawbotPanel } from './components/ClawbotPanel'
import { ClawflowBubble } from './components/ClawflowBubble'
import { StatusBar } from './components/StatusBar'
import { InspectorPanel } from './components/InspectorPanel'
import { MusicalTyping } from './components/MusicalTyping'
import { ExportModal } from './components/ExportModal'
import { useExport } from './hooks/useExport'
import { AudioPreferences, RestartOpts } from './components/AudioPreferences'
import { useMidiOutput } from './hooks/useMidiOutput'
import { useMidiInput } from './hooks/useMidiInput'
import { parseMidiFile, downloadMidiFile } from './utils/midiFile'
import { NewProjectModal } from './components/NewProjectModal'

const FLOWSTATE_HUB = 'https://flowst8.cc'

// ── Panel Resizer ─────────────────────────────────────────────────────────────
function PanelResizer({ onDrag, direction = 'right' }: { onDrag: (delta: number) => void; direction?: 'right' | 'left' }) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const move = (ev: MouseEvent) => onDrag(direction === 'right' ? ev.clientX - startX : startX - ev.clientX)
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return <div className="panel-resizer" onMouseDown={onMouseDown} />
}

// ── Lightweight toast helper ─────────────────────────────────────────────────
interface Toast { id: number; msg: string; kind: 'info' | 'warn' | 'error' | 'ok' }
let _toastId = 0

function ToastStack({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      zIndex: 9500, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} className={`app-toast app-toast-${t.kind}`}>
          {t.kind === 'ok' ? '✅' : t.kind === 'warn' ? '⚠️' : t.kind === 'error' ? '❌' : 'ℹ️'}
          {' '}{t.msg}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const store = useProjectStore()
  const engine = useAudioEngine()
  const [trackLevels, setTrackLevels] = useState<Map<string, number>>(new Map())
  const [micLevel, setMicLevel] = useState(0)
  const [showMusicalTyping, setShowMusicalTyping] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showAudioPrefs, setShowAudioPrefs] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [freezingTrackId, setFreezingTrackId] = useState<string | null>(null)
  const [freezeProgress, setFreezeProgress] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((msg: string, kind: Toast['kind'] = 'info', ms = 3200) => {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, msg, kind }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ms)
  }, [])

  // ── Electron menu-action listener ────────────────────────────────────────
  // Routes ipcRenderer 'menu:action' events from the native menu bar to the
  // correct store/UI handlers.  Must be defined early (before transport is
  // created) so that the stable reference doesn't cause stale-closure issues.
  useEffect(() => {
    const eAPI = (window as any).electronAPI
    if (!eAPI?.onMenuAction) return  // not in Electron — skip

    const handler = async (action: string) => {
      const st = useProjectStore.getState()
      switch (action) {
        // ── File ────────────────────────────────────────────────────────────
        case 'new-project':
          if (!st.isDirty || confirm('Discard unsaved changes and create a new project?')) {
            setShowNewProject(true)
          }
          break

        case 'save-project':
          await st.saveProject()
          showToast('Project saved', 'ok')
          break

        case 'save-project-as':
          await st.saveProjectAs()
          break

        case 'open-project':
          if (!st.isDirty || confirm('Discard unsaved changes?')) {
            await st.loadProject()
          }
          break

        case 'import-audio': {
          const eapi = (window as any).electronAPI
          const filePaths: string[] | null = await eapi?.importAudioFile?.()
          if (!filePaths || filePaths.length === 0) break
          for (const fp of filePaths) {
            try {
              const buf: Uint8Array | null = await eapi.readAudioFile(fp)
              if (!buf) continue
              const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
              const ctx = engine.getCtx()
              const audioBuffer = await ctx.decodeAudioData(ab)
              const peaks = engine.generateWaveformPeaks(audioBuffer)
              const blob = new Blob([ab])
              const audioUrl = URL.createObjectURL(blob)
              engine.registerAudioBuffer(audioUrl, audioBuffer)
              const currentSt = useProjectStore.getState()
              const durationBeats = (audioBuffer.duration / 60) * currentSt.bpm
              const fileName = fp.split(/[\\/]/).pop() || 'audio'

              // Find the first armed audio track, or create one
              const armedTrack = currentSt.tracks.find(t => t.armed && t.type === 'audio')
              let targetTrackId = armedTrack?.id
              if (!targetTrackId) {
                useProjectStore.getState().addTrack('audio')
                await new Promise(r => setTimeout(r, 0))
                const freshTracks = useProjectStore.getState().tracks.filter(t => t.type !== 'master')
                targetTrackId = freshTracks[freshTracks.length - 1]?.id
              }
              if (!targetTrackId) continue

              // Find first empty beat on track
              const trackClips = useProjectStore.getState().tracks.find(t => t.id === targetTrackId)?.clips ?? []
              const startBeat = trackClips.reduce((acc, c) => Math.max(acc, c.startBeat + c.durationBeats), 0)

              useProjectStore.getState().addClip({
                id: `clip-import-${Date.now()}`,
                trackId: targetTrackId,
                startBeat,
                durationBeats: Math.max(1, durationBeats),
                name: fileName.replace(/\.[^.]+$/, ''),
                type: 'audio', audioUrl,
                gain: 1, fadeIn: 0, fadeOut: 0,
                fadeInCurve: 'exp', fadeOutCurve: 'exp',
                looped: false, muted: false, aiGenerated: false,
                waveformPeaks: peaks,
              })
            } catch (err) {
              console.error('[menu:import-audio] failed for', fp, err)
            }
          }
          showToast(`Imported ${filePaths.length} audio file${filePaths.length > 1 ? 's' : ''}`, 'ok')
          break
        }

        case 'export':
          setShowExport(true)
          break

        // ── Transport ────────────────────────────────────────────────────────
        case 'play-pause':
          // Handled by transport; post a custom event keyboard shortcut reuses
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
          break

        case 'stop':
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))
          break

        case 'record':
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', ctrlKey: false, bubbles: true }))
          break

        case 'toggle-loop':
          st.toggleLoop()
          break

        case 'go-to-start':
          st.setCurrentTime(0)
          break

        case 'toggle-metronome':
          st.toggleMetronome()
          break

        // ── View ─────────────────────────────────────────────────────────────
        case 'show-mixer':
          st.setShowMixer(!st.showMixer)
          break

        case 'show-piano-roll':
          if (st.activePianoRollClipId) st.setShowPianoRoll(!st.showPianoRoll)
          break

        case 'show-clawbot':
          st.setShowClawbot(!st.showClawbot)
          break

        case 'zoom-in':
          st.setZoom(Math.min(6, st.zoom + 0.25))
          break

        case 'zoom-out':
          st.setZoom(Math.max(0.25, st.zoom - 0.25))
          break

        // ── Edit ─────────────────────────────────────────────────────────────
        case 'undo':
          st.undo()
          break

        case 'redo':
          st.redo()
          break

        case 'select-all': {
          const allIds: string[] = []
          useProjectStore.getState().tracks.forEach(t => t.clips.forEach(c => allIds.push(c.id)))
          if (allIds.length > 0) {
            useProjectStore.getState().selectClip(allIds[0], false)
            allIds.slice(1).forEach(id => useProjectStore.getState().selectClip(id, true))
          }
          break
        }

        case 'delete-selected':
          for (const id of st.selectedClipIds) st.removeClip(id)
          break

        // ── Track ────────────────────────────────────────────────────────────
        case 'add-audio-track':
          st.addTrack('audio')
          break

        case 'add-midi-track':
          st.addTrack('midi')
          break

        case 'add-bus-track':
          st.addTrack('bus')
          break

        // ── Markers ───────────────────────────────────────────────────────────
        case 'add-marker': {
          const beatNow = st.currentTime * (st.bpm / 60)
          const MC = ['#a855f7','#ec4899','#3b82f6','#10b981','#f59e0b','#ef4444','#06b6d4','#84cc16']
          st.addMarker(Math.round(beatNow * 4) / 4, undefined, MC[st.markers.length % MC.length])
          showToast('Marker added', 'ok')
          break
        }

        case 'clear-markers':
          if (st.markers.length > 0) {
            if (window.confirm(`Delete all ${st.markers.length} markers?`)) {
              st.clearMarkers()
              showToast('All markers cleared', 'info')
            }
          }
          break

        // ── Auth state changes ────────────────────────────────────────────────
        case 'signed-in':
          showToast('Signed in to FlowState', 'ok')
          break

        case 'signed-out':
          showToast('Signed out of FlowState', 'info')
          break

        case 'auth-failed':
          showToast('Sign-in failed. Please try again.', 'error')
          break

        default:
          console.debug('[menu:action] unhandled:', action)
      }
    }

    eAPI.onMenuAction(handler)
    // Note: ipcRenderer.on doesn't return a cleanup; the handler lives for the
    // app lifetime (single renderer process), which is the correct behaviour.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast, engine])

  // ── Panel widths (resizable) ──────────────────────────────────────────────
  const [inspectorWidth, setInspectorWidth] = useState(240)
  const [tracklistWidth, setTracklistWidth] = useState(220)
  const [clawbotWidth, setClawbotWidth] = useState(280)

  // ── MIDI Output hook ─────────────────────────────────────────────────────
  const midiOut = useMidiOutput()

  // ── MIDI Input hook — routes hardware keyboard/pad notes into engine ──────
  const midiIn = useMidiInput({
    noteOn:    (pitch, velocity) => engine.noteOn(pitch, velocity),
    noteOff:   (pitch)           => engine.noteOff(pitch),
    allNotesOff: ()              => engine.allNotesOff(),
  })

  // Combined play-note: Web Audio preview + MIDI output if a port is selected
  const handlePlayNote = useCallback((pitch: number) => {
    engine.playPreviewNote(pitch)
    if (midiOut.selectedPortId) midiOut.noteOn(0, pitch, 100)
    // Auto note-off after 400ms
    if (midiOut.selectedPortId) setTimeout(() => midiOut.noteOff(0, pitch), 400)
  }, [engine, midiOut])

  // ── Export hook ─────────────────────────────────────────────────────────
  const exporter = useExport(engine.audioBuffersRef)

  // ── Transport — wired to audio engine ─────────────────────────────────────
  const transport = useTransport(
    engine.startPlayback,
    engine.stopAll,
    engine.startMetronome,
    engine.stopMetronome,
    engine.startRecording,
    engine.stopRecording,
    engine.registerAudioBuffer,
    engine.applyAutomation,
  )

  // ── VU meter RAF ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!store.isPlaying) return
    let rafId: number
    const tick = () => {
      const levels = new Map<string, number>()
      for (const t of store.tracks) levels.set(t.id, engine.getTrackLevel(t.id))
      setTrackLevels(new Map(levels))
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [store.isPlaying, store.tracks, engine])

  // ── Mic level RAF ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!store.isRecording) { setMicLevel(0); return }
    let rafId: number
    const tick = () => { setMicLevel(engine.getMicLevel()); rafId = requestAnimationFrame(tick) }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [store.isRecording, engine])

  // ── Live volume/pan sync + solo/mute logic ────────────────────────────────
  useEffect(() => {
    // applySoloMute re-computes every track's gain respecting solo bus logic:
    // if ANY track is soloed, all non-soloed tracks are silenced (Logic Pro)
    engine.applySoloMute()
    for (const t of store.tracks) {
      engine.setTrackPan(t.id, t.pan)
    }
  }, [store.tracks, engine])

  // ── Elite plugin param sync (live DSP update on every param change) ───────
  useEffect(() => {
    engine.applyElitePlugins()
  }, [store.tracks, engine])

  // ── Mixer fader / pan callbacks ───────────────────────────────────────────
  const handleVolumeChange = useCallback((id: string, v: number) => engine.setTrackVolume(id, v), [engine])
  const handlePanChange = useCallback((id: string, v: number) => engine.setTrackPan(id, v), [engine])
  const handleSetTrackVolume = useCallback((id: string, volume: number) => engine.setTrackVolume(id, volume), [engine])
  const handleSetTrackPan = useCallback((id: string, pan: number) => engine.setTrackPan(id, pan), [engine])
  const handleSetTrackCompressor = useCallback((id: string, threshold: number, ratio: number, attack: number, release: number) => {
    engine.setTrackCompressor(id, threshold, ratio, attack, release)
  }, [engine])

  const handleArmClick = useCallback(async (trackId: string) => {
    const st = useProjectStore.getState()
    if (st.isRecording) {
      await transport.record()
    } else if (st.countIn > 0) {
      await transport.record()
    } else {
      const track = st.tracks.find(t => t.id === trackId)
      if (!track) return
      const willArm = !track.armed
      st.tracks.forEach((t: import('./store/projectStore').Track) => {
        if (t.id !== trackId && t.armed) useProjectStore.getState().updateTrack(t.id, { armed: false })
      })
      useProjectStore.getState().updateTrack(trackId, { armed: willArm })
    }
  }, [transport])

  // ── Input Monitor toggle ──────────────────────────────────────────────────
  const handleToggleInputMonitor = useCallback(async (trackId: string) => {
    const st = useProjectStore.getState()
    const track = st.tracks.find(t => t.id === trackId)
    if (!track) return
    const willMonitor = !track.inputMonitor
    st.toggleInputMonitor(trackId)
    if (willMonitor) {
      await engine.startInputMonitor(trackId)
    } else {
      engine.stopInputMonitor()
    }
  }, [engine])

  const handleSetTrackEQ = useCallback((id: string, l: number, m: number, h: number) => {
    engine.setTrackEQ(id, l, m, h)
  }, [engine])

  // ── Audio context restart (from AudioPreferences) ─────────────────────────
  const handleRestartAudioContext = useCallback(async (opts: RestartOpts) => {
    // Stop transport first
    if (store.isPlaying) transport.pause()
    if (store.isRecording) await transport.record()
    await engine.restartAudioContext({
      sampleRate: opts.sampleRate,
      latencyHint: opts.latencyHint,
      outputDeviceId: opts.outputDeviceId,
    })
  }, [engine, transport, store.isPlaying, store.isRecording])

  // ── Track Freeze ──────────────────────────────────────────────────────────
  const handleFreezeTrack = useCallback(async (trackId: string) => {
    const track = useProjectStore.getState().tracks.find(t => t.id === trackId)
    if (!track) return
    if (track.frozen) {
      useProjectStore.getState().unfreezeTrack(trackId)
      return
    }
    if (freezingTrackId) return // already freezing another track
    setFreezingTrackId(trackId)
    setFreezeProgress(0)
    try {
      const frozenUrl = await engine.freezeTrack(trackId, (p) => setFreezeProgress(p))
      if (frozenUrl) {
        useProjectStore.getState().freezeTrack(trackId, frozenUrl)
      }
    } catch (err) {
      console.error('Freeze failed:', err)
    } finally {
      setFreezingTrackId(null)
      setFreezeProgress(0)
    }
  }, [engine, freezingTrackId])

  // ── Audio file import ─────────────────────────────────────────────────────
  const handleImportAudio = useCallback(async (trackId: string, file: File, startBeat: number) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const ctx = engine.getCtx()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const peaks = engine.generateWaveformPeaks(audioBuffer)
      const blob = new Blob([arrayBuffer], { type: file.type })
      const audioUrl = URL.createObjectURL(blob)
      engine.registerAudioBuffer(audioUrl, audioBuffer)
      const durationBeats = (audioBuffer.duration / 60) * store.bpm
      store.addClip({
        id: `clip-import-${Date.now()}`,
        trackId,
        startBeat,
        durationBeats: Math.max(1, durationBeats),
        name: file.name.replace(/\.[^.]+$/, ''),
        type: 'audio',
        audioUrl,
        gain: 1, fadeIn: 0, fadeOut: 0,
        fadeInCurve: 'exp', fadeOutCurve: 'exp',
        looped: false, muted: false, aiGenerated: false,
        waveformPeaks: peaks,
      })
    } catch (err) {
      console.error('Audio import failed:', err)
    }
  }, [engine, store])

  // ── Drag-and-drop onto empty area → create new track ─────────────────────
  const handleDropCreateTrack = useCallback(async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const ctx = engine.getCtx()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const peaks = engine.generateWaveformPeaks(audioBuffer)
      const blob = new Blob([arrayBuffer], { type: file.type })
      const audioUrl = URL.createObjectURL(blob)
      engine.registerAudioBuffer(audioUrl, audioBuffer)
      store.addTrack('audio')
      setTimeout(() => {
        const currentTracks = useProjectStore.getState().tracks
        const nonMaster = currentTracks.filter(t => t.type !== 'master')
        const newTrack = nonMaster[nonMaster.length - 1]
        if (!newTrack) return
        const durationBeats = (audioBuffer.duration / 60) * useProjectStore.getState().bpm
        useProjectStore.getState().addClip({
          id: `clip-drop-${Date.now()}`,
          trackId: newTrack.id,
          startBeat: 0,
          durationBeats: Math.max(1, durationBeats),
          name: file.name.replace(/\.[^.]+$/, ''),
          type: 'audio', audioUrl,
          gain: 1, fadeIn: 0, fadeOut: 0,
          fadeInCurve: 'exp', fadeOutCurve: 'exp',
          looped: false, muted: false, aiGenerated: false,
          waveformPeaks: peaks,
        })
      }, 0)
    } catch (err) {
      console.error('Drop-create-track failed:', err)
    }
  }, [engine, store])

  // ── MIDI file import ─────────────────────────────────────────────────────
  const handleImportMidi = useCallback(async (file: File, targetTrackId?: string) => {
    try {
      const buf = await file.arrayBuffer()
      const tracks = parseMidiFile(buf)
      if (tracks.length === 0) { alert('No MIDI notes found in file.'); return }

      const currentTracks = useProjectStore.getState().tracks
      const nonMaster = currentTracks.filter(t => t.type !== 'master')

      for (let i = 0; i < tracks.length; i++) {
        const midiTrackData = tracks[i]
        let destTrackId = targetTrackId

        if (!destTrackId || tracks.length > 1) {
          // Create a new MIDI track for each MIDI track in the file
          useProjectStore.getState().addTrack('midi')
          await new Promise(r => setTimeout(r, 0))
          const freshTracks = useProjectStore.getState().tracks
          const freshNonMaster = freshTracks.filter(t => t.type !== 'master')
          const newTrack = freshNonMaster[freshNonMaster.length - 1]
          destTrackId = newTrack?.id
          if (!destTrackId) continue
          useProjectStore.getState().updateTrack(destTrackId, { name: midiTrackData.name })
        }

        useProjectStore.getState().addClip({
          id: `midi-import-${Date.now()}-${i}`,
          trackId: destTrackId,
          startBeat: 0,
          durationBeats: midiTrackData.durationBeats,
          name: midiTrackData.name,
          type: 'midi',
          midiNotes: midiTrackData.notes,
          gain: 1, fadeIn: 0, fadeOut: 0,
          fadeInCurve: 'exp', fadeOutCurve: 'exp',
          looped: false, muted: false, aiGenerated: false,
        })
      }
    } catch (err) {
      console.error('MIDI import failed:', err)
      alert('MIDI import failed: ' + (err as Error).message)
    }
  }, [])

  // ── Load SFZ Instrument ───────────────────────────────────────────────────
  const handleLoadSFZ = useCallback(async (trackId: string, pluginId: string) => {
    try {
      // Load SFZ file
      const sfzData = await loadSFZFile()
      if (!sfzData) return

      console.log('[SFZ] Loaded SFZ file:', sfzData.name)

      // Update the plugin params with SFZ content
      useProjectStore.getState().updatePlugin(trackId, pluginId, {
        sfzContent: sfzData.content,
        sfzPath: sfzData.path,
      })

      // Prompt for samples folder
      alert(`SFZ file "${sfzData.name}" loaded. Now select the folder containing the samples.`)
      const samples = await loadSFZSamples()

      if (samples.size > 0) {
        const requiredSamples = extractSamplePaths(sfzData.content)
        console.log(`[SFZ] Required samples:`, requiredSamples)
        console.log(`[SFZ] Loaded ${samples.size} sample files`)
        
        // TODO: Pass samples to the SFZ engine
        alert(`Loaded SFZ "${sfzData.name}" with ${samples.size} samples`)
      }
    } catch (error) {
      console.error('[SFZ] Failed to load:', error)
      alert('Failed to load SFZ file')
    }
  }, [])

  // ── Flex Pitch ────────────────────────────────────────────────────────────
  const handleSetClipPitch = useCallback((clipId: string, semitones: number) => {
    store.updateClip(clipId, { pitchShift: semitones })
    engine.clearPitchCache(clipId)
  }, [store, engine])

  // ── MIDI file export ──────────────────────────────────────────────────────
  const handleExportMidi = useCallback((clipId?: string) => {
    const st = useProjectStore.getState()
    const { tracks, bpm } = st

    // If clipId given, export just that clip. Otherwise export selected clip or all MIDI.
    const targetClipId = clipId ?? st.selectedClipIds[0]

    if (targetClipId) {
      // Check if the target clip exists but is audio (not MIDI) — give helpful message
      let foundClip = null
      for (const track of tracks) {
        const c = track.clips.find(c => c.id === targetClipId)
        if (c) { foundClip = c; break }
      }
      if (foundClip && foundClip.type !== 'midi') {
        showToast(`"${foundClip.name}" is an audio clip — MIDI export only works on MIDI clips.`, 'warn', 4000)
        return
      }
      for (const track of tracks) {
        const clip = track.clips.find(c => c.id === targetClipId && c.type === 'midi')
        if (clip && clip.midiNotes?.length) {
          downloadMidiFile(clip.midiNotes, bpm, clip.name || 'midi-clip')
          showToast(`Exported "${clip.name}" as MIDI`, 'ok')
          return
        }
        if (clip && (!clip.midiNotes || clip.midiNotes.length === 0)) {
          showToast(`"${clip.name}" is a MIDI clip but has no notes yet.`, 'warn')
          return
        }
      }
    }

    // Fallback: collect all MIDI notes from all MIDI clips
    const allNotes: import('./store/projectStore').MidiNote[] = []
    let maxBeat = 0
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.type === 'midi' && clip.midiNotes) {
          for (const n of clip.midiNotes) {
            allNotes.push({ ...n, startBeat: n.startBeat + clip.startBeat })
            maxBeat = Math.max(maxBeat, n.startBeat + clip.startBeat + n.durationBeats)
          }
        }
      }
    }
    if (allNotes.length === 0) {
      showToast('No MIDI clips found to export. Create a MIDI clip first.', 'warn')
      return
    }
    downloadMidiFile(allNotes, bpm, st.name || 'project')
    showToast(`Exported ${allNotes.length} MIDI notes from all tracks`, 'ok')
  }, [showToast])

  // ── Re-hydrate audio buffers after loading a project from disk ───────────
  // When a .fsa file is loaded, audio clips have audioUrl = absolute file paths
  // (not blob: URLs).  We need to read those files via Electron IPC and decode
  // them into AudioBuffers so playback works.
  const [lastLoadedFilePath, setLastLoadedFilePath] = useState<string | null>(null)
  useEffect(() => {
    const currentFilePath = store.filePath
    if (!currentFilePath || currentFilePath === lastLoadedFilePath) return
    setLastLoadedFilePath(currentFilePath)

    const eAPI = (window as any).electronAPI
    if (!eAPI?.readAudioFile) return

    const rehydrate = async () => {
      const tracks = useProjectStore.getState().tracks
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (clip.type !== 'audio' || !clip.audioUrl) continue
          // Skip if it's already a blob: URL (already decoded in memory)
          if (clip.audioUrl.startsWith('blob:')) continue
          // It's an absolute file path — read and decode
          try {
            const buf: Uint8Array | null = await eAPI.readAudioFile(clip.audioUrl)
            if (!buf) continue
            const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
            const ctx = engine.getCtx()
            const audioBuffer = await ctx.decodeAudioData(ab.slice(0))
            const peaks = clip.waveformPeaks ?? engine.generateWaveformPeaks(audioBuffer)
            const blobUrl = URL.createObjectURL(new Blob([ab]))
            engine.registerAudioBuffer(blobUrl, audioBuffer)
            // Update the clip to point at the in-memory blob URL
            useProjectStore.getState().updateClip(clip.id, {
              audioUrl: blobUrl,
              waveformPeaks: peaks,
            })
          } catch (err) {
            console.warn(`[Rehydrate] Could not decode audio for clip "${clip.name}":`, err)
          }
        }
      }
      showToast(`Project loaded: ${useProjectStore.getState().name}`, 'ok')
    }

    rehydrate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.filePath])

  // ── Copy audio assets to project folder when saving ───────────────────────
  // Materialise all in-memory audio (blob: and rec: URLs) as real WAV files
  // inside the project's _audio folder, then update clip audioUrls to the
  // new absolute paths so they survive restarts.
  useEffect(() => {
    const eAPI = (window as any).electronAPI
    if (!eAPI?.writeAudioBuffer) return

    /** Encode an AudioBuffer as a 16-bit PCM WAV ArrayBuffer (stereo or mono). */
    const encodeWAV = (audioBuffer: AudioBuffer): ArrayBuffer => {
      const numCh    = audioBuffer.numberOfChannels
      const numSamp  = audioBuffer.length
      const sr       = audioBuffer.sampleRate
      const bitsPerSample = 16
      const byteRate = sr * numCh * bitsPerSample / 8
      const blockAlign = numCh * bitsPerSample / 8
      const dataLen  = numSamp * numCh * 2     // 2 bytes per 16-bit sample
      const buf = new ArrayBuffer(44 + dataLen)
      const view = new DataView(buf)
      const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
      writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true)
      writeStr(8, 'WAVE'); writeStr(12, 'fmt ')
      view.setUint32(16, 16, true)       // chunk size
      view.setUint16(20, 1, true)        // PCM
      view.setUint16(22, numCh, true)
      view.setUint32(24, sr, true)
      view.setUint32(28, byteRate, true)
      view.setUint16(32, blockAlign, true)
      view.setUint16(34, bitsPerSample, true)
      writeStr(36, 'data'); view.setUint32(40, dataLen, true)
      // Interleave channels
      let pos = 44
      for (let i = 0; i < numSamp; i++) {
        for (let ch = 0; ch < numCh; ch++) {
          const sample = audioBuffer.getChannelData(ch)[i]
          const s16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
          view.setInt16(pos, s16, true)
          pos += 2
        }
      }
      return buf
    }

    ;(window as any).__fsCopyAssetsOnSave = async (projectFilePath: string) => {
      const tracks = useProjectStore.getState().tracks
      const audioBuffers: Map<string, AudioBuffer> = engine.audioBuffersRef.current
      const updates: { clipId: string; audioUrl: string }[] = []

      for (const track of tracks) {
        for (const clip of track.clips) {
          if (clip.type !== 'audio' || !clip.audioUrl) continue
          // Already a file path → nothing to do
          if (!clip.audioUrl.startsWith('blob:') && !clip.audioUrl.startsWith('rec:')) continue

          const safeName = `${clip.id}_${clip.name.replace(/[^a-z0-9._-]/gi, '_')}.wav`

          try {
            let wavBytes: Uint8Array | null = null

            if (clip.audioUrl.startsWith('blob:')) {
              // Imported file — the blob may be an already-encoded audio file (WAV/MP3/etc.)
              // Just pass the raw bytes through; if it's not a WAV the DAW can still decode it.
              const resp = await fetch(clip.audioUrl)
              const ab   = await resp.arrayBuffer()
              // Re-encode as WAV using in-memory decoded AudioBuffer if available,
              // otherwise fall back to raw bytes (which are usually valid audio already).
              const audioBuf = audioBuffers.get(clip.audioUrl)
              wavBytes = audioBuf ? new Uint8Array(encodeWAV(audioBuf)) : new Uint8Array(ab)
            } else if (clip.audioUrl.startsWith('rec:')) {
              // Recorded audio — lives only in audioBuffersRef; encode to WAV now.
              const audioBuf = audioBuffers.get(clip.audioUrl)
              if (!audioBuf) continue
              wavBytes = new Uint8Array(encodeWAV(audioBuf))
            }

            if (!wavBytes) continue

            const writtenPath: string | null = await eAPI.writeAudioBuffer(
              projectFilePath,
              safeName,
              wavBytes
            )
            if (writtenPath) {
              updates.push({ clipId: clip.id, audioUrl: writtenPath })
              // Also update any takes that referenced this URL
              for (const take of clip.takes ?? []) {
                if (take.audioUrl === clip.audioUrl) {
                  take.audioUrl = writtenPath
                }
              }
              // Re-register under the new file path so playback still works
              const audioBuf = audioBuffers.get(clip.audioUrl)
              if (audioBuf) {
                audioBuffers.set(writtenPath, audioBuf)
              }
            }
          } catch (err) {
            console.warn(`[SaveAssets] Could not copy audio for clip "${clip.name}":`, err)
          }
        }
      }

      // Apply path updates to the store so the snapshot uses file paths
      for (const u of updates) {
        useProjectStore.getState().updateClip(u.clipId, { audioUrl: u.audioUrl })
      }
    }

    return () => { delete (window as any).__fsCopyAssetsOnSave }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Warn before closing if unsaved ───────────────────────────────────────
  useEffect(() => {
    // Expose function for Electron to check unsaved status
    ;(window as any).__checkUnsaved = () => store.isDirty
    
    const handler = (e: BeforeUnloadEvent) => {
      if (store.isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      delete (window as any).__checkUnsaved
    }
  }, [store.isDirty])

  // ── Check ClawFlow status ─────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${FLOWSTATE_HUB}/api/clawbot/status`)
      .then(r => r.json())
      .then(d => store.setClawflowActive(d.subscriptionActive))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // NOTE: When Musical Typing is open, the MusicalTyping component registers a
  // CAPTURE-phase listener that calls stopImmediatePropagation() on every
  // keydown event, so this bubble-phase handler never fires.  We also check
  // showMusicalTyping here as an extra safety net.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ── GUARD: if Musical Typing is open, block ALL shortcuts here too ──
      // (The capture-phase handler in MusicalTyping.tsx already stops most
      //  events, but this covers any edge cases like events that bypass capture)
      if (showMusicalTyping) {
        // Only allow Shift+P to toggle the window off — everything else is blocked
        if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
          e.preventDefault()
          setShowMusicalTyping(false)
          engine.allNotesOff()
        }
        return
      }

      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return

      const meta = e.metaKey || e.ctrlKey
      const inPianoRoll = store.activePanel === 'piano-roll' && store.showPianoRoll

      // Shift+P — toggle Musical Typing window
      if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault()
        setShowMusicalTyping(prev => !prev)
        return
      }

      // ── Tool shortcuts (no modifier, not in piano roll) ────────────────
      if (!meta && !e.shiftKey && !inPianoRoll) {
        switch (e.key.toLowerCase()) {
          case 'v': e.preventDefault(); store.setActiveTool('pointer'); return
          case 'q': e.preventDefault(); store.setActiveTool('marquee'); return
          case 'c': if (!meta) { e.preventDefault(); store.setActiveTool('scissors'); return } break
          case 'f': e.preventDefault(); store.setActiveTool('fade'); return
          case 'g': if (!meta) { e.preventDefault()
            // G key: if clips selected → glue them; otherwise toggle loop / tool
            const st = useProjectStore.getState()
            if (st.selectedClipIds.length >= 2) {
              st.saveSnapshot()
              st.glueClips(st.selectedClipIds)
            } else {
              store.setActiveTool('glue')
            }
            return
          } break
          case 'u': e.preventDefault(); store.setActiveTool('mute'); return
        }
      }

      switch (e.code) {
        // ── Transport ────────────────────────────────────────────────────
        case 'Space':
          e.preventDefault()
          transport.togglePlay()
          break
        case 'Enter':
          e.preventDefault()
          transport.toStart()
          break
        case 'KeyR':
          if (!meta) { e.preventDefault(); transport.record() }
          break

        // ── Undo/Redo ────────────────────────────────────────────────────
        case 'KeyZ':
          if (meta) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo() }
          break

        // ── Select all ───────────────────────────────────────────────────
        case 'KeyA':
          if (meta && !inPianoRoll) {
            e.preventDefault()
            const allIds: string[] = []
            useProjectStore.getState().tracks.forEach(t => t.clips.forEach(c => allIds.push(c.id)))
            if (allIds.length > 0) {
              useProjectStore.getState().selectClip(allIds[0], false)
              allIds.slice(1).forEach(id => useProjectStore.getState().selectClip(id, true))
            }
          }
          break

        // ── Duplicate ────────────────────────────────────────────────────
        case 'KeyD':
          if (meta && !inPianoRoll) {
            e.preventDefault()
            const ids = useProjectStore.getState().selectedClipIds
            if (ids.length > 0) { store.saveSnapshot(); store.duplicateClip(ids[0]) }
          }
          break

        case 'KeyO':
          if (meta) { e.preventDefault(); store.loadProject() }
          break

        // ── Save / Split ─────────────────────────────────────────────────
        case 'KeyS':
          if (meta && e.shiftKey) {
            // Cmd+Shift+S = Save As (uses Electron dialog or prompts in web mode)
            e.preventDefault()
            store.saveProjectAs()
          } else if (meta) {
            e.preventDefault()
            store.saveProject()
          } else if (!inPianoRoll) {
            // S = split selected clip at playhead (also scissors tool click does this)
            const st = useProjectStore.getState()
            const currentBeatNow = st.currentTime * (st.bpm / 60)
            for (const clipId of st.selectedClipIds) {
              for (const track of st.tracks) {
                const clip = track.clips.find(c => c.id === clipId)
                if (clip && currentBeatNow > clip.startBeat && currentBeatNow < clip.startBeat + clip.durationBeats) {
                  st.saveSnapshot()
                  store.splitClipAtBeat(clipId, currentBeatNow)
                  break
                }
              }
            }
          }
          break

        // ── Copy / Paste ─────────────────────────────────────────────────
        case 'KeyC':
          if (meta && !inPianoRoll) {
            e.preventDefault()
            const st = useProjectStore.getState()
            if (st.selectedClipIds.length > 0) {
              for (const track of st.tracks) {
                const clip = track.clips.find(c => c.id === st.selectedClipIds[0])
                if (clip) { store.setClipboardClip(clip); break }
              }
            }
          }
          break

        // ── Paste at playhead ────────────────────────────────────────────
        case 'KeyV':
          if (meta && !inPianoRoll) {
            e.preventDefault()
            const st = useProjectStore.getState()
            const currentBeatNow = st.currentTime * (st.bpm / 60)
            store.pasteClip(currentBeatNow)
          }
          break

        // ── Mute (M) ─────────────────────────────────────────────────────
        case 'KeyM':
          if (!inPianoRoll) {
            const ids = useProjectStore.getState().selectedClipIds
            if (ids.length > 0) {
              for (const track of useProjectStore.getState().tracks) {
                const clip = track.clips.find(c => c.id === ids[0])
                if (clip) { store.updateClip(clip.id, { muted: !clip.muted }); break }
              }
            } else if (store.selectedTrackId) {
              const t = store.tracks.find(tr => tr.id === store.selectedTrackId)
              if (t) store.updateTrack(t.id, { muted: !t.muted })
            }
          }
          break

        // ── Fade shortcuts ───────────────────────────────────────────────
        case 'BracketLeft':
          // [ = set fade-in on selected clips
          if (!inPianoRoll) {
            e.preventDefault()
            const st = useProjectStore.getState()
            for (const id of st.selectedClipIds) store.setClipFadeIn(id, e.shiftKey ? 2 : 1)
          }
          break
        case 'BracketRight':
          // ] = set fade-out on selected clips
          if (!inPianoRoll) {
            e.preventDefault()
            const st = useProjectStore.getState()
            for (const id of st.selectedClipIds) store.setClipFadeOut(id, e.shiftKey ? 2 : 1)
          }
          break
        case 'Backslash':
          // \ = remove fades from selected clips
          if (!inPianoRoll) {
            e.preventDefault()
            const st = useProjectStore.getState()
            for (const id of st.selectedClipIds) {
              store.setClipFadeIn(id, 0)
              store.setClipFadeOut(id, 0)
            }
          }
          break

        // ── Add Marker at Playhead (`) ────────────────────────────────────
        case 'Backquote':
          if (!inPianoRoll && !meta) {
            e.preventDefault()
            const st = useProjectStore.getState()
            const beatNow = st.currentTime * (st.bpm / 60)
            const MARKER_COLORS = ['#a855f7','#ec4899','#3b82f6','#10b981','#f59e0b','#ef4444','#06b6d4','#84cc16']
            const color = MARKER_COLORS[st.markers.length % MARKER_COLORS.length]
            store.addMarker(Math.round(beatNow * 4) / 4, undefined, color)
            showToast('Marker added', 'ok')
          }
          break

        // ── Global Tracks ─────────────────────────────────────────────────
        case 'KeyG':
          if (!meta && !inPianoRoll) {
            e.preventDefault()
            store.setShowGlobalTracks(!useProjectStore.getState().showGlobalTracks)
          }
          break

        // ── Loop ─────────────────────────────────────────────────────────
        case 'KeyL':
          if (!meta) store.toggleLoop()
          break

        // ── Metronome ────────────────────────────────────────────────────
        case 'KeyK':
          // Only toggle metronome if musical typing is CLOSED
          // (K is used for C5 note in musical typing mode)
          if (!meta && !showMusicalTyping) store.toggleMetronome()
          break

        // ── Inspector ────────────────────────────────────────────────────
        case 'KeyI':
          if (!meta) store.setInspectorOpen(!store.inspectorOpen)
          break

        // ── Tracklist collapse ───────────────────────────────────────────
        case 'KeyT':
          if (!meta) setTracklistWidth(w => w > 40 ? 40 : 220)
          break

        // ── Clawbot panel ────────────────────────────────────────────────
        case 'KeyB':
          if (!meta) store.setShowClawbot(!store.showClawbot)
          break

        // ── Delete selected clips ────────────────────────────────────────
        case 'Backspace':
        case 'Delete':
          if (!inPianoRoll) {
            store.saveSnapshot()
            store.selectedClipIds.forEach(id => store.removeClip(id))
            store.deselectAll()
          }
          break
        case 'Escape':
          store.deselectAll()
          store.setActiveTool('pointer') // ESC resets to pointer
          break

        // ── Playhead & Timeline navigation ──────────────────────────────────────────
        case 'ArrowLeft': {
          e.preventDefault()
          if (e.altKey) {
            // Alt + Left = scroll timeline left
            const timeline = document.querySelector('.timeline') as HTMLElement
            if (timeline) {
              timeline.scrollLeft = Math.max(0, timeline.scrollLeft - 200)
            }
          } else {
            // Normal playhead navigation
            const st = useProjectStore.getState()
            const beatsBack = meta ? 4 : e.shiftKey ? 0.25 : 1
            const newBeat = Math.max(0, st.currentTime * (st.bpm / 60) - beatsBack)
            transport.seekToBeat(newBeat)
          }
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          if (e.altKey) {
            // Alt + Right = scroll timeline right
            const timeline = document.querySelector('.timeline') as HTMLElement
            if (timeline) {
              timeline.scrollLeft += 200
            }
          } else {
            // Normal playhead navigation
            const st = useProjectStore.getState()
            const beatsFwd = meta ? 4 : e.shiftKey ? 0.25 : 1
            const newBeat = st.currentTime * (st.bpm / 60) + beatsFwd
            transport.seekToBeat(newBeat)
          }
          break
        }

        // ── Home/End — Quick timeline navigation ─────────────────────────
        case 'Home': {
          e.preventDefault()
          if (e.altKey) {
            // Alt + Home = scroll timeline to start
            const timeline = document.querySelector('.timeline') as HTMLElement
            if (timeline) timeline.scrollLeft = 0
          } else {
            // Home = move playhead to start
            transport.seekToBeat(0)
          }
          break
        }
        case 'End': {
          e.preventDefault()
          if (e.altKey) {
            // Alt + End = scroll timeline to end
            const timeline = document.querySelector('.timeline') as HTMLElement
            if (timeline) timeline.scrollLeft = timeline.scrollWidth
          }
          // End key without alt doesn't move playhead (would be confusing)
          break
        }

        // ── Zoom ─────────────────────────────────────────────────────────
        case 'Equal':
          e.preventDefault()
          store.setZoom(Math.min(6, store.zoom + 0.25))
          break
        case 'Minus':
          e.preventDefault()
          store.setZoom(Math.max(0.25, store.zoom - 0.25))
          break
        case 'Digit0':
        case 'Numpad0':
          if (!meta) {
            e.preventDefault()
            const st = useProjectStore.getState()
            let maxBeat = 16
            for (const t of st.tracks) {
              for (const c of t.clips) {
                const end = c.startBeat + c.durationBeats
                if (end > maxBeat) maxBeat = end
              }
            }
            const availW = window.innerWidth - inspectorWidth - tracklistWidth - (store.showClawbot ? clawbotWidth : 0)
            const fitZoom = availW / (maxBeat * 40)
            store.setZoom(Math.max(0.1, Math.min(6, fitZoom)))
          }
          break

        // ── Export / Bounce ───────────────────────────────────────────────
        case 'KeyE':
          if (meta) { e.preventDefault(); setShowExport(true) }
          break

        // ── Audio Preferences ─────────────────────────────────────────────
        case 'Comma':
          if (meta) { e.preventDefault(); setShowAudioPrefs(true) }
          break

        // ── New project / Normalize gain ─────────────────────────────────
        case 'KeyN':
          if (meta && e.shiftKey) {
            // Cmd+Shift+N = New Project (opens template picker)
            e.preventDefault()
            if (!store.isDirty || confirm('Discard unsaved changes and create a new project?')) {
              setShowNewProject(true)
            }
          } else if (meta && !inPianoRoll) {
            // Cmd+N = normalize gain on selected clips
            e.preventDefault()
            const st = useProjectStore.getState()
            for (const id of st.selectedClipIds) {
              for (const track of st.tracks) {
                const clip = track.clips.find(c => c.id === id)
                if (clip?.audioUrl) {
                  const normGain = engine.normalizeClipGain(clip.audioUrl)
                  store.updateClip(id, { gain: normGain })
                }
              }
            }
          }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, store, inspectorWidth, tracklistWidth, clawbotWidth, engine, showMusicalTyping, showExport, showAudioPrefs])

  // Prevent browser zoom globally - only allow timeline zoom
  useEffect(() => {
    const preventBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Prevent browser zoom everywhere
        e.preventDefault()
      }
    }
    // Use passive: false to allow preventDefault
    document.addEventListener('wheel', preventBrowserZoom, { passive: false })
    return () => document.removeEventListener('wheel', preventBrowserZoom)
  }, [])

  const currentBeat = store.currentTime * (store.bpm / 60)
  const playheadX = currentBeat * store.pixelsPerBeat - store.scrollLeft

  return (
    <div className="app">
      <Toolbar
        onPlay={transport.play}
        onPause={transport.pause}
        onStop={transport.pause}
        onToStart={transport.toStart}
        onRecord={transport.record}
        onExport={() => setShowExport(true)}
        onOpenAudioPrefs={() => setShowAudioPrefs(true)}
        onImportMidi={file => handleImportMidi(file)}
        onExportMidi={handleExportMidi}
      />

      <div className="main-area">
        {/* Inspector */}
        {store.inspectorOpen && (
          <div style={{ display:'flex', flexShrink:0, width: inspectorWidth }}>
            <InspectorPanel
              onSetTrackEQ={handleSetTrackEQ}
              onSetTrackVolume={handleSetTrackVolume}
              onSetTrackPan={handleSetTrackPan}
              onSetTrackCompressor={handleSetTrackCompressor}
            />
            <PanelResizer onDrag={d => setInspectorWidth(w => Math.max(160, Math.min(400, w + d)))} />
          </div>
        )}

        {/* Track list */}
        <div style={{ display:'flex', flexShrink:0, width: tracklistWidth }}>
          <TrackList
            width={tracklistWidth}
            onVolumeChange={handleVolumeChange}
            onPanChange={handlePanChange}
            onArmClick={handleArmClick}
            onToggleInputMonitor={handleToggleInputMonitor}
            onFreezeTrack={handleFreezeTrack}
            freezingTrackId={freezingTrackId}
            freezeProgress={freezeProgress}
          />
          <PanelResizer onDrag={d => setTracklistWidth(w => Math.max(40, Math.min(360, w + d)))} />
        </div>

        {/* Center */}
        <div className="center-area">
          {store.activePanel === 'piano-roll' && store.showPianoRoll ? (
            <PianoRoll clipId={store.activePianoRollClipId} onPlayNote={handlePlayNote} />
          ) : (
            <Timeline
              playheadX={Math.max(0, playheadX)}
              onScrub={beat => transport.seekToBeat(beat)}
              onImportAudio={handleImportAudio}
              onDropCreateTrack={handleDropCreateTrack}
              onImportMidi={handleImportMidi}
              onExportMidi={handleExportMidi}
              onSetClipPitch={handleSetClipPitch}
              recordingMicLevel={micLevel}
            />
          )}

          <Mixer
            trackLevels={trackLevels}
            onVolumeChange={handleVolumeChange}
            onPanChange={handlePanChange}
          />
        </div>

        {/* Clawbot */}
        {store.showClawbot && (
          <div style={{ display:'flex', flexShrink:0, width: clawbotWidth }}>
            <PanelResizer direction="left" onDrag={d => setClawbotWidth(w => Math.max(200, Math.min(480, w + d)))} />
            <ClawbotPanel />
          </div>
        )}
      </div>

      <StatusBar
        getMasterLevel={engine.getMasterLevel}
        midiInputPorts={midiIn.ports.filter(p => p.enabled && p.state === 'connected').length}
        midiLastNote={midiIn.lastMessage?.type === 'noteOn' ? { pitch: midiIn.lastMessage.pitch, velocity: midiIn.lastMessage.velocity } : null}
      />

      <MusicalTyping
        isOpen={showMusicalTyping}
        onClose={() => {
          setShowMusicalTyping(false)
          engine.allNotesOff()
        }}
        onNoteOn={engine.noteOn}
        onNoteOff={engine.noteOff}
        onPlayNote={engine.playPreviewNote}
        onTogglePlay={transport.togglePlay}
      />

      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onBounce={exporter.bounce}
        progress={exporter.progress}
      />

      <AudioPreferences
        isOpen={showAudioPrefs}
        onClose={() => setShowAudioPrefs(false)}
        onRestartAudioContext={handleRestartAudioContext}
        getAudioContext={() => { try { return engine.getCtx() } catch { return null } }}
        midiInputPorts={midiIn.ports}
        onToggleMidiInput={midiIn.togglePort}
        onEnableAllMidi={midiIn.enableAll}
        onDisableAllMidi={midiIn.disableAll}
      />

      {/* ── Clawflow floating chat bubble — fixed overlay, never blocks DAW UI ── */}
      <ClawflowBubble />

      {/* ── New Project template picker ── */}
      <NewProjectModal
        isOpen={showNewProject}
        onClose={() => setShowNewProject(false)}
      />

      {/* ── Toast notifications ── */}
      <ToastStack toasts={toasts} onRemove={id => setToasts(prev => prev.filter(t => t.id !== id))} />

      {/* ── Floating plugin windows ── */}
      <PluginWindowManager />
    </div>
  )
}
