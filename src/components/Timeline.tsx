import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useProjectStore, Clip, Track } from '../store/projectStore'

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

// ── Fake waveform seeded from clip id ────────────────────────────────────────
function fakeWave(seed: string, n: number): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff
  return Array.from({ length: n }, () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    return 0.15 + (h % 100) / 100 * 0.8
  })
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
  const peaks = clip.waveformPeaks ?? fakeWave(clip.id, 80)

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
    // Minimal context menu via custom overlay — use window.confirm chain
    const opts = ['split at midpoint', 'duplicate', 'mute/unmute', 'delete']
    const choice = opts.findIndex((o, i) => window.confirm(`Action ${i+1}/${opts.length}: "${o}"?\n(Cancel to try next)`))
    if (choice === 0) splitClipAtBeat(clip.id, clip.startBeat + clip.durationBeats / 2)
    else if (choice === 1) duplicateClip(clip.id)
    else if (choice === 2) updateClip(clip.id, { muted: !clip.muted })
    else if (choice === 3) removeClip(clip.id)
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
      <div className="clip-name">{clip.name}{clip.aiGenerated ? ' 🤖' : ''}{clip.looped ? ' ↺' : ''}</div>

      {clip.type === 'audio' && (
        <WaveformCanvas peaks={peaks} width={w} height={laneHeight - 6} color="#fff" />
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
function TrackLane({ track, pixelsPerBeat, scrollLeft }: { track: Track; pixelsPerBeat: number; scrollLeft: number }) {
  const { addClip, selectedClipIds, selectClip, snapEnabled, snapValue } = useProjectStore()

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

  return (
    <div className="track-lane" style={{ height: track.height }} onDoubleClick={handleDblClick}>
      {/* Beat grid lines */}
      {track === track && null /* grid is drawn by the scroll container */}

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
    </div>
  )
}

// ── Main Timeline ─────────────────────────────────────────────────────────────
export function Timeline({ playheadX, onScrub }: { playheadX: number; onScrub: (beat: number) => void }) {
  const { tracks, pixelsPerBeat, scrollLeft, setScrollLeft, bpm, loopStart, loopEnd, isLooping, timeSignature } = useProjectStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const TOTAL_BARS = 96
  const BEATS_PER_BAR = timeSignature[0]
  const totalBeats = TOTAL_BARS * BEATS_PER_BAR
  const totalWidth = totalBeats * pixelsPerBeat

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

  // Build ruler ticks
  const ticks: React.ReactNode[] = []
  for (let bar = 0; bar <= TOTAL_BARS; bar++) {
    const beat = bar * BEATS_PER_BAR
    const x = beat * pixelsPerBeat
    if (x < scrollLeft - 10 || x > scrollLeft + 3000) continue // viewport cull
    ticks.push(
      <div key={`bar-${bar}`} className="ruler-tick" style={{ left: x }}>
        <div className="ruler-label">{bar + 1}</div>
        <div className="ruler-line" style={{ height: 10 }} />
      </div>
    )
    // Beat subdivisions
    for (let b = 1; b < BEATS_PER_BAR; b++) {
      const bx = (beat + b) * pixelsPerBeat
      ticks.push(
        <div key={`${bar}-${b}`} className="ruler-tick beat-tick" style={{ left: bx }}>
          <div className="ruler-line" style={{ height: 5 }} />
        </div>
      )
    }
  }

  // Grid background lines (vertical, drawn as absolute divs)
  const gridLines: React.ReactNode[] = []
  for (let bar = 0; bar <= TOTAL_BARS; bar++) {
    const x = bar * BEATS_PER_BAR * pixelsPerBeat
    if (x < scrollLeft - 10 || x > scrollLeft + 3000) continue
    gridLines.push(<div key={`grid-${bar}`} style={{ position:'absolute', left: x, top:0, bottom:0, width:1, background:'rgba(255,255,255,0.05)', pointerEvents:'none' }} />)
    // Beat grid
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
    >
      {/* Ruler */}
      <div
        className="timeline-ruler"
        style={{ width: totalWidth, minWidth: '100%', position: 'sticky', top: 0, zIndex: 10 }}
        onMouseDown={handleRulerMouseDown}
      >
        {ticks}
        {isLooping && (
          <div className="loop-region" style={{
            left: loopStart * pixelsPerBeat,
            width: (loopEnd - loopStart) * pixelsPerBeat,
          }} />
        )}
      </div>

      {/* Lanes + grid */}
      <div style={{ position: 'relative', width: totalWidth, minWidth: '100%' }}>
        {gridLines}
        {tracks.map(track => (
          <TrackLane key={track.id} track={track} pixelsPerBeat={pixelsPerBeat} scrollLeft={scrollLeft} />
        ))}

        {/* Playhead */}
        <div
          className="playhead"
          style={{ left: playheadX + scrollLeft, top: 0, bottom: 0 }}
        >
          <div className="playhead-head" />
        </div>
      </div>
    </div>
  )
}
