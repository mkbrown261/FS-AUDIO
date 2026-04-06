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

const FLOWSTATE_HUB = 'https://flowstate-67g.pages.dev'

export default function App() {
  const store = useProjectStore()
  const engine = useAudioEngine()
  const [trackLevels, setTrackLevels] = useState<Map<string, number>>(new Map())
  const [micLevel, setMicLevel] = useState(0)

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
      for (const t of store.tracks) {
        levels.set(t.id, engine.getTrackLevel(t.id))
      }
      setTrackLevels(new Map(levels))
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [store.isPlaying, store.tracks, engine])

  // ── Mic level RAF — active during recording ───────────────────────────────
  useEffect(() => {
    if (!store.isRecording) {
      setMicLevel(0)
      return
    }
    let rafId: number
    const tick = () => {
      setMicLevel(engine.getMicLevel())
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [store.isRecording, engine])

  // ── Live volume/pan sync — track state → audio engine ───────────────────
  useEffect(() => {
    for (const t of store.tracks) {
      engine.setTrackVolume(t.id, t.muted ? 0 : t.volume)
      engine.setTrackPan(t.id, t.pan)
    }
  }, [store.tracks, engine])

  // ── Mixer fader / pan callbacks ───────────────────────────────────────────
  const handleVolumeChange = useCallback((id: string, v: number) => {
    engine.setTrackVolume(id, v)
  }, [engine])

  const handlePanChange = useCallback((id: string, v: number) => {
    engine.setTrackPan(id, v)
  }, [engine])

  // ── Inspector EQ callback ─────────────────────────────────────────────────
  const handleSetTrackEQ = useCallback((id: string, l: number, m: number, h: number) => {
    engine.setTrackEQ(id, l, m, h)
  }, [engine])

  // ── Audio file import (drag-and-drop onto track lanes) ───────────────────
  const handleImportAudio = useCallback(async (trackId: string, file: File, startBeat: number) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const ctx = engine.getCtx()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

      // Generate 200-point waveform peaks
      const channel = audioBuffer.getChannelData(0)
      const blockSize = Math.floor(channel.length / 200)
      const peaks: number[] = []
      for (let i = 0; i < 200; i++) {
        let max = 0
        for (let j = 0; j < blockSize; j++) {
          const v = Math.abs(channel[i * blockSize + j] ?? 0)
          if (v > max) max = v
        }
        peaks.push(max)
      }

      // Create blob URL for playback
      const blob = new Blob([arrayBuffer], { type: file.type })
      const audioUrl = URL.createObjectURL(blob)

      // Register in engine cache so first playback is instant
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

      // Generate peaks
      const channel = audioBuffer.getChannelData(0)
      const blockSize = Math.floor(channel.length / 200)
      const peaks: number[] = []
      for (let i = 0; i < 200; i++) {
        let max = 0
        for (let j = 0; j < blockSize; j++) {
          const v = Math.abs(channel[i * blockSize + j] ?? 0)
          if (v > max) max = v
        }
        peaks.push(max)
      }

      const blob = new Blob([arrayBuffer], { type: file.type })
      const audioUrl = URL.createObjectURL(blob)
      engine.registerAudioBuffer(audioUrl, audioBuffer)

      // Create new audio track
      store.addTrack('audio')

      // After the state settles, get the new track and add the clip
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
          type: 'audio',
          audioUrl,
          gain: 1, fadeIn: 0, fadeOut: 0,
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
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return

      const meta = e.metaKey || e.ctrlKey

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          transport.togglePlay()
          break
        case 'Enter':
          e.preventDefault()
          transport.toStart()
          break
        case 'KeyL':
          if (!meta) store.toggleLoop()
          break
        case 'KeyK':
          if (!meta) store.toggleMetronome()
          break
        case 'KeyM':
          if (store.selectedTrackId) {
            const t = store.tracks.find(tr => tr.id === store.selectedTrackId)
            if (t) store.updateTrack(t.id, { muted: !t.muted })
          }
          break
        case 'KeyS':
          if (meta) { e.preventDefault() /* save */ }
          else if (store.selectedTrackId) {
            const t = store.tracks.find(tr => tr.id === store.selectedTrackId)
            if (t) store.updateTrack(t.id, { solo: !t.solo })
          }
          break
        case 'KeyR':
          if (!meta) transport.record()
          break
        case 'KeyI':
          if (!meta) store.setInspectorOpen(!store.inspectorOpen)
          break
        case 'Equal':
          if (meta) { e.preventDefault(); store.setZoom(Math.min(6, store.zoom + 0.25)) }
          break
        case 'Minus':
          if (meta) { e.preventDefault(); store.setZoom(Math.max(0.25, store.zoom - 0.25)) }
          break
        case 'KeyZ':
          if (meta) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo() }
          break
        case 'Backspace':
        case 'Delete':
          store.selectedClipIds.forEach(id => store.removeClip(id))
          store.deselectAll()
          break
        case 'Escape':
          store.deselectAll()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [transport, store])

  // ── Playhead position for timeline ───────────────────────────────────────
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
      />

      <div className="main-area">
        {/* Inspector */}
        {store.inspectorOpen && (
          <InspectorPanel onSetTrackEQ={handleSetTrackEQ} />
        )}

        {/* Track list */}
        <TrackList onVolumeChange={handleVolumeChange} onPanChange={handlePanChange} />

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
        {store.showClawbot && <ClawbotPanel />}
      </div>

      <StatusBar />
    </div>
  )
}
