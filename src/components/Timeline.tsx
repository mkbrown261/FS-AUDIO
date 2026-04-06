import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useProjectStore, Clip, Track } from '../store/projectStore'
import { ContextMenu, ContextMenuItem } from './ContextMenu'

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

// ── Clip Tooltip ──────────────────────────────────────────────────────────────
interface ClipTooltipProps {
  clip: Clip
  x: number
  y: number
  bpm: number
}

function ClipTooltip({ clip, x, y, bpm }: ClipTooltipProps) {
  const beatsToBarsBeat = (beats: number) => {
    const bar = Math.floor(beats / 4) + 1
    const beat = Math.floor(beats % 4) + 1
    return `${bar}:${beat}`
  }
  return (
    <div className="clip-tooltip" style={{ left: x + 12, top: y - 8 }}>
      <div className="clip-tooltip-title">{clip.name}</div>
      <div>Start: {beatsToBarsBeat(clip.startBeat)}</div>
      <div>Duration: {beatsToBarsBeat(clip.durationBeats)}</div>
      <div>Type: {clip.type === 'audio' ? 'Audio' : 'MIDI'}</div>
      {clip.type === 'audio' && clip.waveformPeaks && (
        <div>Waveform: {clip.waveformPeaks.length} pts</div>
      )}
      {clip.gain !== 1 && <div>Gain: {Math.round(clip.gain * 100)}%</div>}
    </div>
  )
}

// ── Clip View ──────────────────────────────────────────────────────────────────
function ClipView({
  clip, track, pixelsPerBeat, laneHeight, selected, onSelect, onContextMenu,
}: {
  clip: Clip; track: Track; pixelsPerBeat: number; laneHeight: number;
  selected: boolean; onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, clip: Clip) => void
}) {
  const { updateClip, setShowPianoRoll, snapEnabled, snapValue } = useProjectStore()
  const isDragging = useRef(false)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const x = clip.startBeat * pixelsPerBeat
  const w = Math.max(8, clip.durationBeats * pixelsPerBeat)
  const bpm = useProjectStore.getState().bpm

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).classList.contains('clip-resize-handle')) return
    e.stopPropagation()
    onSelect(e)
    isDragging.current = false
    // Cancel tooltip on drag start
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    setTooltipPos(null)

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

  function handleMouseEnter(e: React.MouseEvent) {
    const ex = e.clientX
    const ey = e.clientY
    tooltipTimerRef.current = setTimeout(() => {
      setTooltipPos({ x: ex, y: ey })
    }, 500)
  }

  function handleMouseLeave() {
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    setTooltipPos(null)
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (tooltipPos) {
      setTooltipPos({ x: e.clientX, y: e.clientY })
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (clip.type === 'midi') setShowPianoRoll(true, clip.id)
  }

  function handleContextMenuEvt(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    setTooltipPos(null)
    onContextMenu(e, clip)
  }

  return (
    <>
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
        onContextMenu={handleContextMenuEvt}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
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
      {tooltipPos && <ClipTooltip clip={clip} x={tooltipPos.x} y={tooltipPos.y} bpm={bpm} />}
    </>
  )
}

// ── Track Lane ────────────────────────────────────────────────────────────────
function TrackLane({
  track, pixelsPerBeat, scrollLeft, onImportAudio,
  isRecording, recordingMicLevel, currentBeat, recordStartBeat,
  onClipContextMenu, onLaneContextMenu,
}: {
  track: Track
  pixelsPerBeat: number
  scrollLeft: number
  onImportAudio?: (trackId: string, file: File, startBeat: number) => Promise<void>
  isRecording: boolean
  recordingMicLevel: number
  currentBeat: number
  recordStartBeat: number
  onClipContextMenu: (e: React.MouseEvent, clip: Clip) => void
  onLaneContextMenu: (e: React.MouseEvent, track: Track, clickBeat: number) => void
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

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left + scrollLeft
    const clickBeat = snapBeat(Math.max(0, clickX / pixelsPerBeat), snapValue, snapEnabled)
    onLaneContextMenu(e, track, clickBeat)
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
      onContextMenu={handleContextMenu}
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
          onContextMenu={onClipContextMenu}
        />
      ))}
      {track.muted && <div className="lane-muted-overlay">MUTED</div>}
      {dragOver && <div className="lane-drop-hint">Drop audio file here</div>}

      {showLiveBar && recBarWidth > 0 && (
        <div
          className="rec-live-bar-wrap"
          style={{ left: recBarX, width: recBarWidth }}
        >
          <div style={{
            position: 'absolute', left: 0, top: 3, bottom: 3, right: 0,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 3,
            pointerEvents: 'none',
          }} />
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
  const store = useProjectStore()
  const { tracks, pixelsPerBeat, scrollLeft, setScrollLeft, bpm, loopStart, loopEnd, isLooping, timeSignature, isRecording, currentTime, zoom, setZoom, snapValue, setSnapValue } = store
  const scrollRef = useRef<HTMLDivElement>(null)
  const TOTAL_BARS = 96
  const BEATS_PER_BAR = timeSignature[0]
  const totalBeats = TOTAL_BARS * BEATS_PER_BAR
  const totalWidth = totalBeats * pixelsPerBeat

  const currentBeat = currentTime * (bpm / 60)

  // ── Context menu state ────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  // Track where recording started
  const recordStartBeatRef = useRef(0)
  useEffect(() => {
    if (isRecording) {
      recordStartBeatRef.current = currentBeat
    }
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
    if (e.button !== 0) return
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

  function handleRulerContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const clickX = e.clientX - rect.left + scrollLeft
    const clickBeat = Math.max(0, clickX / pixelsPerBeat)
    const cx = e.clientX, cy = e.clientY
    setCtxMenu({
      x: cx, y: cy,
      items: [
        { label: 'Set Loop Start Here', action: () => store.setLoopRange(clickBeat, store.loopEnd) },
        { label: 'Set Loop End Here', action: () => store.setLoopRange(store.loopStart, clickBeat) },
        { label: 'Select All', disabled: true, action: () => {} },
        { separator: true, label: '', action: () => {} },
        { label: 'Snap: Beat', action: () => setSnapValue('1/4'), shortcut: store.snapValue === '1/4' ? '✓' : '' },
        { label: 'Snap: Bar', action: () => setSnapValue('1'), shortcut: store.snapValue === '1' ? '✓' : '' },
        { label: 'Snap: Off', action: () => setSnapValue('off'), shortcut: store.snapValue === 'off' ? '✓' : '' },
      ]
    })
  }

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

  // ── Clip context menu handler ─────────────────────────────────────────────
  const handleClipContextMenu = useCallback((e: React.MouseEvent, clip: Clip) => {
    const cx = e.clientX, cy = e.clientY
    const currentBeatNow = useProjectStore.getState().currentTime * (useProjectStore.getState().bpm / 60)
    setCtxMenu({
      x: cx, y: cy,
      items: [
        {
          label: 'Split at Playhead', shortcut: 'S',
          action: () => {
            if (currentBeatNow > clip.startBeat && currentBeatNow < clip.startBeat + clip.durationBeats) {
              store.splitClipAtBeat(clip.id, currentBeatNow)
            }
          },
          disabled: currentBeatNow <= clip.startBeat || currentBeatNow >= clip.startBeat + clip.durationBeats,
        },
        {
          label: 'Split at Midpoint',
          action: () => store.splitClipAtBeat(clip.id, clip.startBeat + clip.durationBeats / 2),
        },
        { separator: true, label: '', action: () => {} },
        {
          label: clip.looped ? 'Unloop' : 'Loop',
          action: () => store.updateClip(clip.id, { looped: !clip.looped }),
        },
        {
          label: clip.muted ? 'Unmute' : 'Mute', shortcut: 'M',
          action: () => store.updateClip(clip.id, { muted: !clip.muted }),
        },
        { separator: true, label: '', action: () => {} },
        {
          label: 'Rename...',
          action: () => {
            const newName = prompt('Clip name:', clip.name)
            if (newName !== null && newName.trim()) store.updateClip(clip.id, { name: newName.trim() })
          },
        },
        {
          label: 'Set Gain...',
          action: () => {
            const val = prompt('Gain (0–200%):', String(Math.round(clip.gain * 100)))
            if (val !== null) {
              const n = parseFloat(val)
              if (!isNaN(n)) store.updateClip(clip.id, { gain: Math.max(0, Math.min(2, n / 100)) })
            }
          },
        },
        { separator: true, label: '', action: () => {} },
        {
          label: 'Duplicate', shortcut: '⌘D',
          action: () => store.duplicateClip(clip.id),
        },
        {
          label: 'Delete', shortcut: 'Del', danger: true,
          action: () => store.removeClip(clip.id),
        },
      ],
    })
  }, [store])

  // ── Lane context menu handler ─────────────────────────────────────────────
  const handleLaneContextMenu = useCallback((e: React.MouseEvent, track: Track, clickBeat: number) => {
    const cx = e.clientX, cy = e.clientY
    const cb = useProjectStore.getState().clipboardClip
    const items: ContextMenuItem[] = []

    if (cb) {
      items.push({
        label: 'Paste',
        action: () => {
          store.addClip({ ...cb, id: `clip-paste-${Date.now()}`, trackId: track.id, startBeat: clickBeat })
        },
      })
    }
    items.push({
      label: 'Insert Silence',
      action: () => {
        store.addClip({
          id: `clip-silence-${Date.now()}`,
          trackId: track.id,
          startBeat: clickBeat,
          durationBeats: 4,
          name: 'Silence',
          type: 'audio',
          gain: 0, fadeIn: 0, fadeOut: 0,
          looped: false, muted: false, aiGenerated: false,
        })
      },
    })
    items.push({ separator: true, label: '', action: () => {} })
    items.push({ label: 'Add Audio Track', action: () => store.addTrack('audio') })
    items.push({ label: 'Add MIDI Track', action: () => store.addTrack('midi') })
    items.push({ separator: true, label: '', action: () => {} })

    const PRESET_COLORS = ['#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
    items.push({
      label: 'Track Color...',
      action: () => {
        const colorChoice = prompt(
          `Pick a color:\n${PRESET_COLORS.map((c, i) => `${i + 1}. ${c}`).join('\n')}\nEnter number or hex:`,
          '1'
        )
        if (!colorChoice) return
        const idx = parseInt(colorChoice) - 1
        const color = (idx >= 0 && idx < PRESET_COLORS.length) ? PRESET_COLORS[idx] : colorChoice
        if (/^#[0-9a-fA-F]{3,6}$/.test(color)) {
          store.updateTrack(track.id, { color })
        }
      },
    })

    setCtxMenu({ x: cx, y: cy, items })
  }, [store])

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
        onContextMenu={handleRulerContextMenu}
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
            onClipContextMenu={handleClipContextMenu}
            onLaneContextMenu={handleLaneContextMenu}
          />
        ))}

        <TimelineDropZone onDropCreateTrack={onDropCreateTrack} />

        {/* Playhead */}
        <div
          className="playhead"
          style={{ left: playheadX, top: 0, bottom: 0 }}
        >
          <div className="playhead-head" />
        </div>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
