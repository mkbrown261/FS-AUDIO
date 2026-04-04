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

const FLOWSTATE_HUB = 'https://flowstate-67g.pages.dev'

export default function App() {
  const store = useProjectStore()
  const engine = useAudioEngine()
  const [trackLevels, setTrackLevels] = useState<Map<string, number>>(new Map())

  // ── Transport ──────────────────────────────────────────────────────────────
  const transport = useTransport(
    engine.startPlayback,
    engine.stopAll,
    engine.startMetronome,
    engine.stopMetronome,
  )

  // ── VU meter RAF ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!store.isPlaying) return
    let rafId: number
    const tick = () => {
      const levels = new Map<string, number>()
      for (const t of store.tracks) {
        levels.set(t.id, engine.getTrackLevel(t.id))
      }
      setTrackLevels(levels)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [store.isPlaying, store.tracks, engine])

  // ── Sync track volume/pan to audio engine ─────────────────────────────────
  useEffect(() => {
    for (const t of store.tracks) {
      engine.setTrackVolume(t.id, t.muted ? 0 : t.volume)
      engine.setTrackPan(t.id, t.pan)
    }
  }, [store.tracks, engine])

  // ── Check ClawFlow status ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${FLOWSTATE_HUB}/api/clawbot/status`)
      .then(r => r.json())
      .then(d => store.setClawflowActive(d.subscriptionActive))
      .catch(() => {})
  }, [])

  // ── Menu action handler (Electron IPC) ────────────────────────────────────
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return
    const off = api.onMenuAction((action: string, data?: any) => {
      switch (action) {
        case 'play-pause': transport.togglePlay(); break
        case 'stop': transport.stop(); break
        case 'record': transport.record(); break
        case 'toggle-loop': store.toggleLoop(); break
        case 'toggle-metronome': store.toggleMetronome(); break
        case 'go-to-start': transport.stop(); break
        case 'undo': store.undo(); break
        case 'redo': store.redo(); break
        case 'new-project': store.newProject(); break
        case 'zoom-in': store.setZoom(Math.min(4, store.zoom + 0.25)); break
        case 'zoom-out': store.setZoom(Math.max(0.25, store.zoom - 0.25)); break
        case 'add-audio-track': store.addTrack('audio'); break
        case 'add-midi-track': store.addTrack('midi'); break
        case 'add-bus-track': store.addTrack('bus'); break
        case 'show-mixer': store.setShowMixer(!store.showMixer); store.setActivePanel('mixer'); break
        case 'show-piano-roll': store.setShowPianoRoll(!store.showPianoRoll); break
        case 'show-clawbot': store.setShowClawbot(!store.showClawbot); break
        case 'import-audio':
          api.importAudioFile().then((paths: string[] | null) => {
            if (!paths) return
            for (const path of paths) {
              const trackId = store.selectedTrackId ?? store.tracks.find(t => t.type === 'audio')?.id
              if (!trackId) return
              store.addClip({
                id: `clip-${Date.now()}-${Math.random()}`,
                trackId,
                startBeat: store.currentTime * (store.bpm / 60),
                durationBeats: 16,
                name: path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Audio',
                type: 'audio',
                audioUrl: path.startsWith('file://') ? path : `file://${path}`,
                gain: 1, fadeIn: 0, fadeOut: 0, looped: false, muted: false, aiGenerated: false,
              })
            }
          })
          break
        case 'save-project':
          api.saveProject(store).then(() => {})
          break
        case 'select-all': break
        case 'delete-selected':
          store.selectedClipIds.forEach(id => store.removeClip(id))
          store.deselectAll()
          break
      }
    })
    return () => {} // IPC listener not easily removable — ok for app lifecycle
  }, [transport, store])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'Space': e.preventDefault(); transport.togglePlay(); break
        case 'Enter': if (!e.isComposing) { e.preventDefault(); transport.stop() }; break
        case 'KeyL': store.toggleLoop(); break
        case 'KeyK': store.toggleMetronome(); break
        case 'KeyM': if (store.selectedTrackId) { const t = store.tracks.find(tr => tr.id === store.selectedTrackId); if (t) store.updateTrack(t.id, { muted: !t.muted }) }; break
        case 'KeyS': if (store.selectedTrackId) { const t = store.tracks.find(tr => tr.id === store.selectedTrackId); if (t) store.updateTrack(t.id, { solo: !t.solo }) }; break
        case 'KeyR': if (store.selectedTrackId) { const t = store.tracks.find(tr => tr.id === store.selectedTrackId); if (t) store.updateTrack(t.id, { armed: !t.armed }) }; break
        case 'Equal': if (e.metaKey || e.ctrlKey) { e.preventDefault(); store.setZoom(Math.min(4, store.zoom + 0.25)) }; break
        case 'Minus': if (e.metaKey || e.ctrlKey) { e.preventDefault(); store.setZoom(Math.max(0.25, store.zoom - 0.25)) }; break
        case 'KeyZ': if (e.metaKey || e.ctrlKey) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo() }; break
        case 'Backspace': case 'Delete':
          store.selectedClipIds.forEach(id => store.removeClip(id))
          store.deselectAll()
          break
        case 'Escape': store.deselectAll(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [transport, store])

  // ── Playhead X position ────────────────────────────────────────────────────
  const playheadX = (store.currentTime * (store.bpm / 60)) * store.pixelsPerBeat - store.scrollLeft

  return (
    <div className="app">
      {/* Toolbar */}
      <Toolbar
        onPlay={transport.play}
        onPause={transport.pause}
        onStop={transport.stop}
        onRecord={transport.record}
      />

      {/* Main area */}
      <div className="main-area">
        {/* Track list */}
        <TrackList />

        {/* Center: timeline + bottom panels */}
        <div className="center-area">
          {/* Timeline */}
          <Timeline
            playheadX={Math.max(0, playheadX)}
            onScrub={beat => transport.seekToBeat(beat)}
          />

          {/* Bottom panels (Mixer / Piano Roll) */}
          <Mixer trackLevels={trackLevels} />
          {store.activePanel === 'piano-roll' && store.showMixer && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
              <PianoRoll clipId={store.activePianoRollClipId} />
            </div>
          )}
        </div>

        {/* Clawbot panel */}
        {store.showClawbot && <ClawbotPanel />}
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}
