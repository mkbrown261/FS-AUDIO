import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useProjectStore, Clip, Track } from '../store/projectStore'

// ── Flat centerline for audio clips with no waveform data ─────────────────────
function FlatLine({ width, height, color }: { width: number; height: number; color: string }) {
  const mid = height / 2
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 18, left: 0, width, height }}
      preserveAspectRatio="none"
    >
      <line x1={0} y1={mid} x2={width} y2={mid} stroke={color + '66'} strokeWidth={1} />
    </svg>
  )
}

// ── Waveform canvas ────────────────────────────────────────────────────────────
function WaveformCanvas({ peaks, width, height, color }: { peaks: number[]; width: number; height: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    const mid = height / 2
    ctx.strokeStyle = color + 'dd'
    ctx.lineWidth = 1
    ctx.beginPath()
    peaks.forEach((peak, i) => {
      const x = (i / peaks.length) * width
      const h = peak * mid * 0.88
      ctx.moveTo(x, mid - h)
      ctx.lineTo(x, mid + h)
    })
    ctx.stroke()
  }, [peaks, width, height, color])
  return <canvas ref={canvasRef} width={width} height={height} style={{ position: 'absolute', top: 18, left: 0, width, height }} />
}

// ── MIDI preview ───────────────────────────────────────────────────────────────
function MidiPreview({ notes, width, height }: { notes: NonNullable<Clip['midiNotes']>; width: number; height: number }) {
  if (!notes.length) return <div style={{ position:'absolute', inset:0, top:18, opacity:.4, fontSize:10, color:'#fff', paddingLeft:6, paddingTop:4 }}>MIDI</div>
  const pitches = notes.map(n => n.pitch)
  const minP = Math.min(...pitches), maxP = Math.max(...pitches)
  const range = Math.max(12, maxP - minP + 2)
  const totalBeats = Math.max(1, Math.max(...notes.map(n => n.startBeat + n.durationBeats)))
  return (
    <svg width={width} height={height - 18} style={{ position:'absolute', top:18, left:0 }}>
      {notes.map((note, i) => {
        const x = (note.startBeat / totalBeats) * width
        const w = Math.max(2, (note.durationBeats / totalBeats) * width - 1)
        const y = (height - 22) - ((note.pitch - minP) / range) * (height - 26) - 2
        return <rect key={i} x={x} y={y} width={w} height={3} rx={1} fill="rgba(255,255,255,0.85)" />
      })}
    </svg>
  )
}

// ── Snap helper ────────────────────────────────────────────────────────────────
function snapBeat(beat: number, snapValue: string, enabled: boolean): number {
  if (!enabled || snapValue === 'off') return beat
  const grid: Record<string, number> = {
    '1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125
  }
  const g = grid[snapValue] ?? 1
  return Math.round(beat / g) * g
}

// ── Clip View ──────────────────────────────────────────────────────────────────
function ClipView({
  clip, track, pixelsPerBeat, laneHeight, selected, onSelect
}: {
  clip: Clip; track: Track; pixelsPerBeat: number; laneHeight: number;
  selected: boolean; onSelect: (e: React.MouseEvent) => void
}) {
  const { updateClip, removeClip, setShowPianoRoll, splitClipAtBeat, duplicateClip, snapEnabled, snapValue } = useProjectStore()
  const isDragging = useRef(false)

  const x = clip.startBeat * pixelsPerBeat
  const w = Math.max(8, clip.durationBeats * pixelsPerBeat)

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).classList.contains('clip-resize-handle')) return
    e.stopPropagation()
    onSelect(e)
    isDragging.current = false

    const startX = e.clientX
    const origBeat = clip.startBeat

    const mv = (me: MouseEvent) => {
      const dx = me.clientX - startX
      if (Math.abs(dx) > 3) isDragging.current = true
      if (!isDragging.current) return
      const rawBeat = Math.max(0, origBeat + dx / pixelsPerBeat)
      updateClip(clip.id, { startBeat: snapBeat(rawBeat, snapValue, snapEnabled) })
    }
    const up = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', mv)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (clip.type === 'midi') setShowPianoRoll(true, clip.id)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    document.querySelectorAll('.clip-ctx-menu').forEach(m => m.remove())
    const menu = document.createElement('div')
    menu.className = 'clip-ctx-menu'
    Object.assign(menu.style, {
      position:'fixed', left: e.clientX+'px', top: e.clientY+'px',
      background:'#1a1a2e', border:'1px solid rgba(255,255,255,0.12)',
      borderRadius:'8px', padding:'4px 0', zIndex:'9999',
      boxShadow:'0 8px 24px rgba(0,0,0,0.5)', minWidth:'140px', fontSize:'12px',
    })
    const items = [
      { label: 'Split at midpoint', action: () => splitClipAtBeat(clip.id, clip.startBeat + clip.durationBeats / 2) },
      { label: 'Duplicate', action: () => duplicateClip(clip.id) },
      { label: clip.muted ? 'Unmute' : 'Mute', action: () => updateClip(clip.id, { muted: !clip.muted }) },
      { label: 'Delete', action: () => removeClip(clip.id), danger: true },
    ]
    items.forEach(item => {
      const el = document.createElement('div')
      el.textContent = item.label
      Object.assign(el.style, {
        padding:'6px 14px', cursor:'pointer',
        color: (item as any).danger ? '#ef4444' : '#d1d5db',
      })
      el.onmouseenter = () => { el.style.background = 'rgba(255,255,255,0.06)' }
      el.onmouseleave = () => { el.style.background = '' }
      el.onclick = () => { item.action(); menu.remove() }
      menu.appendChild(el)
    })
    document.body.appendChild(menu)
    const dismiss = (ev: MouseEvent) => { if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('mousedown', dismiss) } }
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0)
  }

  return (
    <div
      className={`clip ${selected ? 'clip-selected' : ''} ${clip.muted ? 'clip-muted' : ''}`}
      style={{
        left: x, width: w, height: laneHeight - 6, top: 3,
        background: `${track.color}${clip.muted ? '44' : '99'}`,
        borderColor: selected ? '#fff' : track.color + 'cc',
        borderRadius: 2,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="clip-name">
        {clip.name}
        {clip.aiGenerated && <span className="clip-badge clip-badge-ai">AI</span>}
        {clip.looped && <span className="clip-badge clip-badge-loop">LOOP</span>}
      </div>

      {clip.type === 'audio' && clip.waveformPeaks && clip.waveformPeaks.length > 0 && (
        <WaveformCanvas peaks={clip.waveformPeaks} width={w} height={laneHeight - 6} color="#fff" />
      )}
      {clip.type === 'audio' && (!clip.waveformPeaks || clip.waveformPeaks.length === 0) && (
        <FlatLine width={w} height={laneHeight - 6} color="#fff" />
      )}
      {clip.type === 'midi' && clip.midiNotes && (
        <MidiPreview notes={clip.midiNotes} width={w} height={laneHeight - 6} />
      )}

      {/* Fade-in visual */}
      {clip.fadeIn > 0 && (
        <div style={{
          position:'absolute', left:0, top:0, bottom:0,
          width: clip.fadeIn * pixelsPerBeat,
          background: 'linear-gradient(to right, rgba(0,0,0,0.5), transparent)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Resize handle */}
      <div
        className="clip-resize-handle"
        onMouseDown={e => {
          e.stopPropagation()
          const startX = e.clientX
          const orig = clip.durationBeats
          const mv = (me: MouseEvent) => {
            const dBeats = (me.clientX - startX) / pixelsPerBeat
            updateClip(clip.id, { durationBeats: Math.max(0.25, snapBeat(orig + dBeats, snapValue, snapEnabled)) })
          }
          const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
          window.addEventListener('mousemove', mv)
          window.addEventListener('mouseup', up)
        }}
      />
    </div>
  )
}

// ── Track Lane ────────────────────────────────────────────────────────────────
function TrackLane({
  track, pixelsPerBeat, scrollLeft, onImportAudio,
  isRecording, recordingMicLevel, currentBeat, recordStartBeat,
}: {
  track: Track
  pixelsPerBeat: number
  scrollLeft: number
  onImportAudio?: (trackId: string, file: File, startBeat: number) => Promise<void>
  isRecording: boolean
  recordingMicLevel: number
  currentBeat: number
  recordStartBeat: number
}) {
  const { addClip, selectedClipIds, selectClip, snapEnabled, snapValue } = useProjectStore()
  const [dragOver, setDragOver] = useState(false)

  function handleDblClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).classList.contains('clip')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left + scrollLeft
    const rawBeat = clickX / pixelsPerBeat
    const startBeat = snapBeat(Math.max(0, rawBeat), snapValue, snapEnabled)
    addClip({
      id: `clip-${Date.now()}`,
      trackId: track.id,
      startBeat,
      durationBeats: 4,
      name: track.type === 'midi' ? `MIDI ${track.clips.length + 1}` : `Audio ${track.clips.length + 1}`,
      type: track.type === 'midi' ? 'midi' : 'audio',
      gain: 1, fadeIn: 0, fadeOut: 0,
      looped: false, muted: false, aiGenerated: false,
      midiNotes: track.type === 'midi' ? [] : undefined,
    })
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    const hasAudio = Array.from(e.dataTransfer.items).some(item => item.kind === 'file' && item.type.startsWith('audio/'))
    if (!hasAudio) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (!onImportAudio) return
    const rect = e.currentTarget.getBoundingClientRect()
    const dropX = e.clientX - rect.left + scrollLeft
    const rawBeat = dropX / pixelsPerBeat
    const startBeat = snapBeat(Math.max(0, rawBeat), snapValue, snapEnabled)

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'))
    for (const file of files) {
      await onImportAudio(track.id, file, startBeat)
    }
  }

  // Live recording waveform bar for armed track
  const showLiveBar = isRecording && track.armed
  const recBarX = recordStartBeat * pixelsPerBeat - scrollLeft
  const recBarWidth = Math.max(0, (currentBeat - recordStartBeat) * pixelsPerBeat)
  const barHeight = Math.max(4, recordingMicLevel * (track.height - 12))

  return (
    <div
      className={`track-lane${dragOver ? ' track-lane-dragover' : ''}`}
      style={{ height: track.height }}
      onDoubleClick={handleDblClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {track.clips.map(clip => (
        <ClipView
          key={clip.id}
          clip={clip} track={track}
          pixelsPerBeat={pixelsPerBeat}
          laneHeight={track.height}
          selected={selectedClipIds.includes(clip.id)}
          onSelect={e => selectClip(clip.id, e.shiftKey || e.metaKey)}
        />
      ))}
      {track.muted && <div className="lane-muted-overlay">MUTED</div>}
      {dragOver && <div className="lane-drop-hint">Drop audio file here</div>}

      {/* Live recording waveform indicator */}
      {showLiveBar && recBarWidth > 0 && (
        <div
          className="rec-live-bar-wrap"
          style={{ left: recBarX, width: recBarWidth }}
        >
          {/* Background recording region */}
          <div style={{
            position: 'absolute', left: 0, top: 3, bottom: 3, right: 0,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 3,
            pointerEvents: 'none',
          }} />
          {/* Active level bar at the right edge */}
          <div
            className="rec-live-bar"
            style={{
              position: 'absolute',
              right: 0,
              height: `${barHeight}px`,
              top: `${(track.height - barHeight) / 2}px`,
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Drop zone below all tracks ─────────────────────────────────────────────────
function TimelineDropZone({ onDropCreateTrack }: { onDropCreateTrack?: (file: File) => void }) {
  const [dragOver, setDragOver] = useState(false)

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    const hasAudio = Array.from(e.dataTransfer.items).some(item => item.kind === 'file' && item.type.startsWith('audio/'))
    if (!hasAudio) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (!onDropCreateTrack) return
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'))
    for (const file of files) {
      onDropCreateTrack(file)
    }
  }

  return (
    <div
      className={`timeline-drop-zone ${dragOver ? 'dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver ? '+ Create new track with this file' : 'Drop audio here to create a new track'}
    </div>
  )
}

// ── Main Timeline ─────────────────────────────────────────────────────────────
export function Timeline({
  playheadX,
  onScrub,
  onImportAudio,
  onDropCreateTrack,
  recordingMicLevel = 0,
}: {
  playheadX: number
  onScrub: (beat: number) => void
  onImportAudio?: (trackId: string, file: File, startBeat: number) => Promise<void>
  onDropCreateTrack?: (file: File) => void
  recordingMicLevel?: number
}) {
  const { tracks, pixelsPerBeat, scrollLeft, setScrollLeft, bpm, loopStart, loopEnd, isLooping, timeSignature, isRecording, currentTime, zoom, setZoom } = useProjectStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const TOTAL_BARS = 96
  const BEATS_PER_BAR = timeSignature[0]
  const totalBeats = TOTAL_BARS * BEATS_PER_BAR
  const totalWidth = totalBeats * pixelsPerBeat

  const currentBeat = currentTime * (bpm / 60)

  // Track where recording started (use current beat at time of recording start)
  const recordStartBeatRef = useRef(0)
  useEffect(() => {
    if (isRecording) {
      recordStartBeatRef.current = currentBeat
    }
  // Only update when recording starts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => setScrollLeft(el.scrollLeft)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [setScrollLeft])

  // Auto-scroll playhead into view
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const viewW = el.clientWidth
    const absoluteX = playheadX + scrollLeft
    if (absoluteX > scrollLeft + viewW - 80) {
      el.scrollLeft = absoluteX - 60
    }
  }, [playheadX, scrollLeft])

  function handleRulerMouseDown(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const scrub = (me: MouseEvent | React.MouseEvent) => {
      const x = me.clientX - rect.left + scrollLeft
      onScrub(Math.max(0, x / pixelsPerBeat))
    }
    scrub(e)
    const mv = (me: MouseEvent) => scrub(me)
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  // Also handle drop onto the ruler → create new track
  function handleRulerDragOver(e: React.DragEvent<HTMLDivElement>) {
    const hasAudio = Array.from(e.dataTransfer.items).some(item => item.kind === 'file' && item.type.startsWith('audio/'))
    if (!hasAudio) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleRulerDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!onDropCreateTrack) return
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'))
    for (const file of files) {
      onDropCreateTrack(file)
    }
  }

  // Build ruler ticks
  const ticks: React.ReactNode[] = []
  for (let bar = 0; bar <= TOTAL_BARS; bar++) {
    const beat = bar * BEATS_PER_BAR
    const x = beat * pixelsPerBeat
    if (x < scrollLeft - 10 || x > scrollLeft + 3000) continue
    ticks.push(
      <div key={`bar-${bar}`} className="ruler-tick" style={{ left: x }}>
        <div className="ruler-label">{bar + 1}</div>
        <div className="ruler-line" style={{ height: 10 }} />
      </div>
    )
    for (let b = 1; b < BEATS_PER_BAR; b++) {
      const bx = (beat + b) * pixelsPerBeat
      ticks.push(
        <div key={`${bar}-${b}`} className="ruler-tick beat-tick" style={{ left: bx }}>
          <div className="ruler-line" style={{ height: 5 }} />
        </div>
      )
    }
  }

  // Grid background lines
  const gridLines: React.ReactNode[] = []
  for (let bar = 0; bar <= TOTAL_BARS; bar++) {
    const x = bar * BEATS_PER_BAR * pixelsPerBeat
    if (x < scrollLeft - 10 || x > scrollLeft + 3000) continue
    gridLines.push(<div key={`grid-${bar}`} style={{ position:'absolute', left: x, top:0, bottom:0, width:1, background:'rgba(255,255,255,0.05)', pointerEvents:'none' }} />)
    for (let b = 1; b < BEATS_PER_BAR; b++) {
      const bx = (bar * BEATS_PER_BAR + b) * pixelsPerBeat
      gridLines.push(<div key={`beat-${bar}-${b}`} style={{ position:'absolute', left: bx, top:0, bottom:0, width:1, background:'rgba(255,255,255,0.025)', pointerEvents:'none' }} />)
    }
  }

  return (
    <div
      ref={scrollRef}
      className="timeline"
      style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, position: 'relative' }}
      onWheel={e => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          const delta = e.deltaY > 0 ? -0.15 : 0.15
          setZoom(Math.max(0.25, Math.min(6, zoom + delta)))
        }
      }}
    >
      {/* Ruler */}
      <div
        className="timeline-ruler"
        style={{ width: totalWidth, minWidth: '100%', position: 'sticky', top: 0, zIndex: 10 }}
        onMouseDown={handleRulerMouseDown}
        onDragOver={handleRulerDragOver}
        onDrop={handleRulerDrop}
      >
        {ticks}
        {isLooping && (
          <>
            <div className="loop-region" style={{
              left: loopStart * pixelsPerBeat,
              width: (loopEnd - loopStart) * pixelsPerBeat,
            }} />
            {/* Left locator */}
            <div
              className="loop-locator loop-locator-start"
              style={{ left: loopStart * pixelsPerBeat }}
              onMouseDown={e => {
                e.stopPropagation()
                const startX = e.clientX
                const orig = loopStart
                const mv = (me: MouseEvent) => {
                  const dx = me.clientX - startX
                  const newBeat = Math.max(0, Math.min(loopEnd - 1, orig + dx / pixelsPerBeat))
                  useProjectStore.getState().setLoopRange(newBeat, loopEnd)
                }
                const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
                window.addEventListener('mousemove', mv)
                window.addEventListener('mouseup', up)
              }}
            />
            {/* Right locator */}
            <div
              className="loop-locator loop-locator-end"
              style={{ left: loopEnd * pixelsPerBeat }}
              onMouseDown={e => {
                e.stopPropagation()
                const startX = e.clientX
                const orig = loopEnd
                const mv = (me: MouseEvent) => {
                  const dx = me.clientX - startX
                  const newBeat = Math.max(loopStart + 1, orig + dx / pixelsPerBeat)
                  useProjectStore.getState().setLoopRange(loopStart, newBeat)
                }
                const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
                window.addEventListener('mousemove', mv)
                window.addEventListener('mouseup', up)
              }}
            />
          </>
        )}
      </div>

      {/* Lanes + grid */}
      <div style={{ position: 'relative', width: totalWidth, minWidth: '100%' }}>
        {gridLines}
        {tracks.map(track => (
          <TrackLane
            key={track.id}
            track={track}
            pixelsPerBeat={pixelsPerBeat}
            scrollLeft={scrollLeft}
            onImportAudio={onImportAudio}
            isRecording={isRecording}
            recordingMicLevel={recordingMicLevel}
            currentBeat={currentBeat}
            recordStartBeat={recordStartBeatRef.current}
          />
        ))}

        {/* Drop zone below all tracks */}
        <TimelineDropZone onDropCreateTrack={onDropCreateTrack} />

        {/* Playhead */}
        <div
          className="playhead"
          style={{ left: playheadX, top: 0, bottom: 0 }}
        >
          <div className="playhead-head" />
        </div>
      </div>
    </div>
  )
}
