import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useProjectStore, Clip, Track } from '../store/projectStore'

function WaveformCanvas({ peaks, width, height, color }: { peaks: number[]; width: number; height: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = color + 'cc'
    ctx.lineWidth = 1
    const mid = height / 2
    ctx.beginPath()
    peaks.forEach((peak, i) => {
      const x = (i / peaks.length) * width
      const h = peak * mid * 0.9
      ctx.moveTo(x, mid - h)
      ctx.lineTo(x, mid + h)
    })
    ctx.stroke()
  }, [peaks, width, height, color])

  return <canvas ref={canvasRef} width={width} height={height} style={{ position: 'absolute', inset: 0 }} />
}

function MidiPreview({ notes, width, height }: { notes: NonNullable<Clip['midiNotes']>; width: number; height: number }) {
  if (!notes.length) return null
  const minPitch = Math.min(...notes.map(n => n.pitch))
  const maxPitch = Math.max(...notes.map(n => n.pitch))
  const range = Math.max(12, maxPitch - minPitch)
  const totalBeats = Math.max(...notes.map(n => n.startBeat + n.durationBeats))

  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      {notes.map((note, i) => {
        const x = (note.startBeat / totalBeats) * width
        const w = Math.max(2, (note.durationBeats / totalBeats) * width)
        const y = height - ((note.pitch - minPitch) / range) * (height - 6) - 3
        return <rect key={i} x={x} y={y} width={w} height={3} rx={1} fill="rgba(255,255,255,0.8)" />
      })}
    </svg>
  )
}

function ClipView({
  clip, track, pixelsPerBeat, laneHeight,
  onSelect, selected,
}: {
  clip: Clip; track: Track; pixelsPerBeat: number; laneHeight: number;
  onSelect: (e: React.MouseEvent) => void; selected: boolean;
}) {
  const { updateClip, removeClip, setShowPianoRoll, moveClip, duplicateClip, splitClipAtBeat } = useProjectStore()
  const dragRef = useRef<{ startX: number; origBeat: number } | null>(null)

  const x = clip.startBeat * pixelsPerBeat
  const w = Math.max(8, clip.durationBeats * pixelsPerBeat)
  const fakeWavePeaks = generateFakePeaks(clip.id, 80)

  function generateFakePeaks(seed: string, n: number): number[] {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff
    return Array.from({ length: n }, (_, i) => {
      h = (h * 1103515245 + 12345) & 0x7fffffff
      return 0.2 + (h % 100) / 100 * 0.75
    })
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    onSelect(e)
    dragRef.current = { startX: e.clientX, origBeat: clip.startBeat }
    const handleMove = (me: MouseEvent) => {
      if (!dragRef.current) return
      const dx = me.clientX - dragRef.current.startX
      const newBeat = Math.max(0, dragRef.current.origBeat + dx / pixelsPerBeat)
      const snapped = Math.round(newBeat * 4) / 4
      updateClip(clip.id, { startBeat: snapped })
    }
    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  function handleDoubleClick() {
    if (clip.type === 'midi') setShowPianoRoll(true, clip.id)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    // Simple action via confirm for now — production would use a custom menu
    const action = prompt('Action: split / duplicate / delete / loop')
    if (action === 'split') splitClipAtBeat(clip.id, clip.startBeat + clip.durationBeats / 2)
    else if (action === 'duplicate') duplicateClip(clip.id)
    else if (action === 'delete') removeClip(clip.id)
    else if (action === 'loop') updateClip(clip.id, { looped: !clip.looped })
  }

  return (
    <div
      className={`clip ${selected ? 'clip-selected' : ''} ${clip.muted ? 'clip-muted' : ''}`}
      style={{
        left: x,
        width: w,
        height: laneHeight - 8,
        top: 4,
        background: track.color + (clip.muted ? '44' : '88'),
        borderColor: selected ? '#fff' : track.color,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      title={clip.name}
    >
      <div className="clip-name">{clip.name}{clip.aiGenerated ? ' 🤖' : ''}{clip.looped ? ' 🔁' : ''}</div>
      {clip.type === 'audio' && (
        <WaveformCanvas
          peaks={clip.waveformPeaks ?? fakeWavePeaks}
          width={w}
          height={laneHeight - 24}
          color={track.color}
        />
      )}
      {clip.type === 'midi' && clip.midiNotes && (
        <MidiPreview notes={clip.midiNotes} width={w} height={laneHeight - 24} />
      )}
      {/* Fade in triangle */}
      {clip.fadeIn > 0 && (
        <div className="fade-handle fade-in" style={{ width: clip.fadeIn * pixelsPerBeat }} />
      )}
      {/* Resize handle */}
      <div className="clip-resize-handle" onMouseDown={e => {
        e.stopPropagation()
        const startX = e.clientX
        const origDur = clip.durationBeats
        const mv = (me: MouseEvent) => {
          const dBeats = (me.clientX - startX) / pixelsPerBeat
          updateClip(clip.id, { durationBeats: Math.max(0.25, origDur + dBeats) })
        }
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
        window.addEventListener('mousemove', mv)
        window.addEventListener('mouseup', up)
      }} />
    </div>
  )
}

function TrackLane({ track, pixelsPerBeat, scrollLeft }: { track: Track; pixelsPerBeat: number; scrollLeft: number }) {
  const { addClip, selectedClipIds, selectClip, bpm, currentTime } = useProjectStore()

  function handleDblClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left + scrollLeft
    const startBeat = Math.round((clickX / pixelsPerBeat) * 4) / 4
    addClip({
      id: `clip-${Date.now()}`,
      trackId: track.id,
      startBeat,
      durationBeats: 4,
      name: `${track.type === 'midi' ? 'MIDI' : 'Audio'} ${track.clips.length + 1}`,
      type: track.type === 'midi' ? 'midi' : 'audio',
      gain: 1, fadeIn: 0, fadeOut: 0,
      looped: false, muted: false, aiGenerated: false,
      midiNotes: track.type === 'midi' ? [] : undefined,
    })
  }

  return (
    <div
      className="track-lane"
      style={{ height: track.height }}
      onDoubleClick={handleDblClick}
    >
      {track.clips.map(clip => (
        <ClipView
          key={clip.id}
          clip={clip}
          track={track}
          pixelsPerBeat={pixelsPerBeat}
          laneHeight={track.height}
          selected={selectedClipIds.includes(clip.id)}
          onSelect={e => selectClip(clip.id, e.shiftKey)}
        />
      ))}
      {track.muted && <div className="lane-muted-overlay">MUTED</div>}
    </div>
  )
}

export function Timeline({
  playheadX,
  onScrub,
}: {
  playheadX: number
  onScrub: (beat: number) => void
}) {
  const { tracks, pixelsPerBeat, scrollLeft, setScrollLeft, scrollTop, setScrollTop, bpm, loopStart, loopEnd, isLooping } = useProjectStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const totalBeats = 256

  // Sync horizontal scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => setScrollLeft(el.scrollLeft)
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [setScrollLeft])

  function handleRulerClick(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = e.clientX - rect.left + scrollLeft
    onScrub(x / pixelsPerBeat)
  }

  const totalWidth = totalBeats * pixelsPerBeat

  // Ruler ticks
  const ticks: React.ReactNode[] = []
  const barsVisible = Math.ceil(totalBeats / 4)
  for (let bar = 0; bar <= barsVisible; bar++) {
    const beat = bar * 4
    const x = beat * pixelsPerBeat
    ticks.push(
      <div key={bar} className="ruler-tick" style={{ left: x }}>
        <div className="ruler-label">{bar + 1}</div>
        <div className="ruler-line" style={{ height: 10 }} />
      </div>
    )
    // Beat subdivisions
    for (let b = 1; b < 4; b++) {
      const bx = (beat + b) * pixelsPerBeat
      ticks.push(<div key={`${bar}-${b}`} className="ruler-tick beat-tick" style={{ left: bx }}><div className="ruler-line" style={{ height: 5 }} /></div>)
    }
  }

  return (
    <div className="timeline" ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', flex: 1, position: 'relative' }}>
      {/* Ruler */}
      <div
        ref={rulerRef}
        className="timeline-ruler"
        style={{ width: totalWidth, minWidth: '100%' }}
        onClick={handleRulerClick}
      >
        {ticks}
        {/* Loop region */}
        {isLooping && (
          <div className="loop-region" style={{
            left: loopStart * pixelsPerBeat,
            width: (loopEnd - loopStart) * pixelsPerBeat,
          }} />
        )}
      </div>

      {/* Lanes */}
      <div style={{ position: 'relative', width: totalWidth, minWidth: '100%' }}>
        {tracks.map(track => (
          <TrackLane
            key={track.id}
            track={track}
            pixelsPerBeat={pixelsPerBeat}
            scrollLeft={scrollLeft}
          />
        ))}

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
