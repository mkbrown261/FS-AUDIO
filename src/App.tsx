import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useProjectStore } from './store/projectStore'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useTransport } from './hooks/useTransport'
import { Toolbar } from './components/Toolbar'
import { TrackList } from './components/TrackList'
import { Timeline } from './components/Timeline'
import { Mixer } from './components/Mixer'
import { PianoRoll } from './components/PianoRoll'
import { ClawbotPanel } from './components/ClawbotPanel'
import { StatusBar } from './components/StatusBar'
import { InspectorPanel } from './components/InspectorPanel'
import { MusicalTyping } from './components/MusicalTyping'
import { ExportModal } from './components/ExportModal'
import { useExport } from './hooks/useExport'

const FLOWSTATE_HUB = 'https://flowstate-67g.pages.dev'

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

export default function App() {
  const store = useProjectStore()
  const engine = useAudioEngine()
  const [trackLevels, setTrackLevels] = useState<Map<string, number>>(new Map())
  const [micLevel, setMicLevel] = useState(0)
  const [showMusicalTyping, setShowMusicalTyping] = useState(false)
  const [showExport, setShowExport] = useState(false)

  // ── Panel widths (resizable) ──────────────────────────────────────────────
  const [inspectorWidth, setInspectorWidth] = useState(240)
  const [tracklistWidth, setTracklistWidth] = useState(220)
  const [clawbotWidth, setClawbotWidth] = useState(280)

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

  const handleSetTrackEQ = useCallback((id: string, l: number, m: number, h: number) => {
    engine.setTrackEQ(id, l, m, h)
  }, [engine])

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

        // ── Save / Split ─────────────────────────────────────────────────
        case 'KeyS':
          if (meta) {
            e.preventDefault()
            // Cmd+S = save (no-op, project-file save TBD)
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

        // ── Loop ─────────────────────────────────────────────────────────
        case 'KeyL':
          if (!meta) store.toggleLoop()
          break

        // ── Metronome ────────────────────────────────────────────────────
        case 'KeyK':
          if (!meta) store.toggleMetronome()
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

        // ── Playhead navigation ──────────────────────────────────────────
        case 'ArrowLeft': {
          e.preventDefault()
          const st = useProjectStore.getState()
          const beatsBack = meta ? 4 : e.shiftKey ? 0.25 : 1
          const newBeat = Math.max(0, st.currentTime * (st.bpm / 60) - beatsBack)
          transport.seekToBeat(newBeat)
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const st = useProjectStore.getState()
          const beatsFwd = meta ? 4 : e.shiftKey ? 0.25 : 1
          const newBeat = st.currentTime * (st.bpm / 60) + beatsFwd
          transport.seekToBeat(newBeat)
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

        // ── Normalize gain on selected clips ─────────────────────────────
        case 'KeyN':
          if (meta && !inPianoRoll) {
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
  }, [transport, store, inspectorWidth, tracklistWidth, clawbotWidth, engine, showMusicalTyping, showExport])

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
          />
          <PanelResizer onDrag={d => setTracklistWidth(w => Math.max(40, Math.min(360, w + d)))} />
        </div>

        {/* Center */}
        <div className="center-area">
          {store.activePanel === 'piano-roll' && store.showPianoRoll ? (
            <PianoRoll clipId={store.activePianoRollClipId} onPlayNote={engine.playPreviewNote} />
          ) : (
            <Timeline
              playheadX={Math.max(0, playheadX)}
              onScrub={beat => transport.seekToBeat(beat)}
              onImportAudio={handleImportAudio}
              onDropCreateTrack={handleDropCreateTrack}
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

      <StatusBar />

      <MusicalTyping
        isOpen={showMusicalTyping}
        onClose={() => {
          setShowMusicalTyping(false)
          engine.allNotesOff()
        }}
        onNoteOn={engine.noteOn}
        onNoteOff={engine.noteOff}
        onPlayNote={engine.playPreviewNote}
      />

      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onBounce={exporter.bounce}
        progress={exporter.progress}
      />
    </div>
  )
}
