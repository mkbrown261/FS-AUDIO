import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useProjectStore, Clip, Track, EditTool } from '../store/projectStore'
import { ContextMenu, ContextMenuItem } from './ContextMenu'
import { AutomationLaneView, AddAutomationLaneButton } from './AutomationLaneView'

// ── Flat centerline for audio clips with no waveform data ─────────────────────
function FlatLine({ width, height, color }: { width: number; height: number; color: string }) {
  const mid = height / 2
  return (
    <svg width={width} height={height} style={{ position:'absolute',top:18,left:0,width,height }} preserveAspectRatio="none">
      <line x1={0} y1={mid} x2={width} y2={mid} stroke={color + '66'} strokeWidth={1} />
    </svg>
  )
}

// ── Waveform canvas ────────────────────────────────────────────────────────────
function WaveformCanvas({ peaks, width, height, color, fadeIn, fadeOut, gain }:
  { peaks: number[]; width: number; height: number; color: string; fadeIn: number; fadeOut: number; gain: number }) {
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
      const h = peak * mid * 0.88 * gain
      ctx.moveTo(x, mid - h)
      ctx.lineTo(x, mid + h)
    })
    ctx.stroke()

    // Fade-in gradient overlay
    if (fadeIn > 0) {
      const fadeW = (fadeIn / peaks.length) * width
      const grad = ctx.createLinearGradient(0, 0, fadeW, 0)
      grad.addColorStop(0, 'rgba(0,0,0,0.85)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, Math.min(fadeW, width), height)
    }

    // Fade-out gradient overlay
    if (fadeOut > 0) {
      const fadeW = (fadeOut / peaks.length) * width
      const grad = ctx.createLinearGradient(width - fadeW, 0, width, 0)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,0,0.85)')
      ctx.fillStyle = grad
      ctx.fillRect(Math.max(0, width - fadeW), 0, fadeW, height)
    }
  }, [peaks, width, height, color, fadeIn, fadeOut, gain])
  return <canvas ref={canvasRef} width={width} height={height} style={{ position:'absolute',top:18,left:0,width,height }} />
}

// ── MIDI preview ───────────────────────────────────────────────────────────────
function MidiPreview({ notes, width, height }: { notes: NonNullable<Clip['midiNotes']>; width: number; height: number }) {
  if (!notes.length) return <div style={{ position:'absolute',inset:0,top:18,opacity:.4,fontSize:10,color:'#fff',paddingLeft:6,paddingTop:4 }}>MIDI</div>
  const pitches = notes.map(n => n.pitch)
  const minP = Math.min(...pitches), maxP = Math.max(...pitches)
  const range = Math.max(12, maxP - minP + 2)
  const totalBeats = Math.max(1, Math.max(...notes.map(n => n.startBeat + n.durationBeats)))
  return (
    <svg width={width} height={height - 18} style={{ position:'absolute',top:18,left:0 }}>
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
  const grid: Record<string, number> = { '1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125 }
  const g = grid[snapValue] ?? 1
  return Math.round(beat / g) * g
}

// ── Clip Tooltip ──────────────────────────────────────────────────────────────
function ClipTooltip({ clip, x, y, bpm }: { clip: Clip; x: number; y: number; bpm: number }) {
  const beatsToBarsBeat = (beats: number) => {
    const bar = Math.floor(beats / 4) + 1
    const beat = Math.floor(beats % 4) + 1
    return `${bar}:${beat}`
  }
  const secs = (clip.durationBeats / bpm) * 60
  return (
    <div className="clip-tooltip" style={{ left: x + 12, top: y - 8 }}>
      <div className="clip-tooltip-title">{clip.name}</div>
      <div>Start: {beatsToBarsBeat(clip.startBeat)}</div>
      <div>End: {beatsToBarsBeat(clip.startBeat + clip.durationBeats)}</div>
      <div>Duration: {secs.toFixed(2)}s</div>
      <div>Type: {clip.type === 'audio' ? 'Audio' : 'MIDI'}</div>
      {clip.gain !== 1 && <div>Gain: {Math.round(clip.gain * 100)}%</div>}
      {(clip.fadeIn ?? 0) > 0 && <div>Fade In: {clip.fadeIn!.toFixed(2)} beats</div>}
      {(clip.fadeOut ?? 0) > 0 && <div>Fade Out: {clip.fadeOut!.toFixed(2)} beats</div>}
      {(clip.crossfadeBeats ?? 0) > 0 && <div>X-Fade: {clip.crossfadeBeats!.toFixed(2)} beats</div>}
    </div>
  )
}

// ── Crossfade Overlay ──────────────────────────────────────────────────────────
function CrossfadeOverlay({ width, height, color }: { width: number; height: number; color: string }) {
  return (
    <svg width={width} height={height} style={{ position:'absolute',top:0,left:0,pointerEvents:'none',zIndex:4 }}>
      {/* X shape */}
      <line x1={0} y1={0} x2={width} y2={height} stroke={color} strokeWidth={1.5} opacity={0.7} />
      <line x1={width} y1={0} x2={0} y2={height} stroke={color} strokeWidth={1.5} opacity={0.7} />
      <rect x={0} y={0} width={width} height={height} fill={color} fillOpacity={0.08} />
    </svg>
  )
}

// ── Clip View ──────────────────────────────────────────────────────────────────
function ClipView({
  clip, track, pixelsPerBeat, laneHeight, selected, onSelect, onContextMenu, activeTool,
}: {
  clip: Clip; track: Track; pixelsPerBeat: number; laneHeight: number;
  selected: boolean; onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, clip: Clip) => void
  activeTool: EditTool
}) {
  const { updateClip, setShowPianoRoll, snapEnabled, snapValue, setClipFadeIn, setClipFadeOut, splitClipAtBeat, setActiveTake, deleteTake } = useProjectStore()
  const isDragging = useRef(false)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const x = clip.startBeat * pixelsPerBeat
  const w = Math.max(8, clip.durationBeats * pixelsPerBeat)
  const bpm = useProjectStore.getState().bpm

  // How many pixels the fade handles span
  const fadeInPx = Math.max(0, (clip.fadeIn ?? 0) * pixelsPerBeat)
  const fadeOutPx = Math.max(0, (clip.fadeOut ?? 0) * pixelsPerBeat)
  const xfadePx = Math.max(0, (clip.crossfadeBeats ?? 0) * pixelsPerBeat)

  // Cursor based on active tool
  const cursorMap: Record<EditTool, string> = {
    pointer: 'grab', scissors: 'crosshair', glue: 'cell',
    fade: 'col-resize', zoom: 'zoom-in', mute: 'pointer',
    marquee: 'crosshair', pencil: 'crosshair',
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const isResize = (e.target as HTMLElement).classList.contains('clip-resize-handle')
    const isFadeIn = (e.target as HTMLElement).classList.contains('fade-in-handle')
    const isFadeOut = (e.target as HTMLElement).classList.contains('fade-out-handle')
    if (isResize || isFadeIn || isFadeOut) return

    e.stopPropagation()

    // Scissors tool → split at click position
    if (activeTool === 'scissors') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickBeat = clip.startBeat + clickX / pixelsPerBeat
      const store = useProjectStore.getState()
      if (clickBeat > clip.startBeat && clickBeat < clip.startBeat + clip.durationBeats) {
        store.saveSnapshot()
        splitClipAtBeat(clip.id, snapBeat(clickBeat, snapValue, snapEnabled))
      }
      return
    }

    // Mute tool
    if (activeTool === 'mute') {
      updateClip(clip.id, { muted: !clip.muted })
      return
    }

    // Fade tool — left half sets fade-in, right half sets fade-out
    if (activeTool === 'fade') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const isLeftHalf = clickX < w / 2
      const startX = e.clientX
      const origFadeIn = clip.fadeIn ?? 0
      const origFadeOut = clip.fadeOut ?? 0
      const mv = (me: MouseEvent) => {
        const dx = me.clientX - startX
        if (isLeftHalf) {
          const newFade = Math.max(0, Math.min(origFadeIn + dx / pixelsPerBeat, clip.durationBeats * 0.9))
          setClipFadeIn(clip.id, newFade)
        } else {
          const newFade = Math.max(0, Math.min(origFadeOut - dx / pixelsPerBeat, clip.durationBeats * 0.9))
          setClipFadeOut(clip.id, newFade)
        }
      }
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
      window.addEventListener('mousemove', mv)
      window.addEventListener('mouseup', up)
      return
    }

    // Default pointer — select + drag
    onSelect(e)
    isDragging.current = false
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
    tooltipTimerRef.current = setTimeout(() => setTooltipPos({ x: e.clientX, y: e.clientY }), 500)
  }
  function handleMouseLeave() {
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    setTooltipPos(null)
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (tooltipPos) setTooltipPos({ x: e.clientX, y: e.clientY })
  }
  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (activeTool === 'scissors') return // handled in mousedown
    if (clip.type === 'midi') setShowPianoRoll(true, clip.id)
  }
  function handleContextMenuEvt(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    setTooltipPos(null)
    onContextMenu(e, clip)
  }

  return (
    <>
      <div
        className={`clip ${selected ? 'clip-selected' : ''} ${clip.muted ? 'clip-muted' : ''} clip-tool-${activeTool}`}
        style={{
          left: x, width: w, height: laneHeight - 6, top: 3,
          background: `${track.color}${clip.muted ? '44' : '99'}`,
          borderColor: selected ? '#fff' : track.color + 'cc',
          borderRadius: 3,
          cursor: cursorMap[activeTool],
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
          {/* Loop toggle button — click ∞ to toggle looping */}
          <button
            className={`clip-loop-btn${clip.looped ? ' clip-loop-btn-active' : ''}`}
            title={clip.looped ? 'Looping — click to disable' : 'Click to loop clip'}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              updateClip(clip.id, { looped: !clip.looped })
            }}
          >∞</button>
          {(clip.fadeIn ?? 0) > 0 && <span className="clip-badge clip-badge-fade">FI</span>}
          {(clip.fadeOut ?? 0) > 0 && <span className="clip-badge clip-badge-fade">FO</span>}
          {clip.muted && <span className="clip-badge clip-badge-muted">MUTE</span>}
          {clip.flexRate && clip.flexRate !== 1 && (
            <span className="clip-badge clip-badge-flex" title={`Flex Time: ${Math.round(clip.flexRate * 100)}%`}>
              {Math.round(clip.flexRate * 100)}%
            </span>
          )}
          {(clip.takes?.length ?? 0) > 0 && (
            <span className="clip-badge clip-badge-take" title={`Take ${(clip.activeTakeIndex ?? 0) + 1} / ${clip.takes!.length}`}>
              T{(clip.activeTakeIndex ?? 0) + 1}/{clip.takes!.length}
            </span>
          )}
        </div>

        {clip.type === 'audio' && clip.waveformPeaks && clip.waveformPeaks.length > 0 && (
          <WaveformCanvas
            peaks={clip.waveformPeaks} width={w} height={laneHeight - 6}
            color="#fff" fadeIn={fadeInPx} fadeOut={fadeOutPx} gain={clip.gain}
          />
        )}
        {clip.type === 'audio' && (!clip.waveformPeaks || clip.waveformPeaks.length === 0) && (
          <FlatLine width={w} height={laneHeight - 6} color="#fff" />
        )}
        {clip.type === 'midi' && clip.midiNotes && (
          <MidiPreview notes={clip.midiNotes} width={w} height={laneHeight - 6} />
        )}

        {/* Crossfade at start */}
        {xfadePx > 0 && (
          <CrossfadeOverlay width={xfadePx} height={laneHeight - 6} color={track.color} />
        )}

        {/* Fade-in drag handle */}
        {fadeInPx > 0 && (
          <div
            className="fade-in-handle"
            style={{
              position:'absolute', left:0, top:0, width: fadeInPx, bottom:0,
              borderRight: `2px solid ${track.color}`,
              cursor: 'ew-resize',
              zIndex: 3,
            }}
            onMouseDown={e => {
              e.stopPropagation()
              const startX = e.clientX
              const orig = clip.fadeIn ?? 0
              const mv = (me: MouseEvent) => {
                const newFade = Math.max(0, Math.min(orig + (me.clientX - startX) / pixelsPerBeat, clip.durationBeats * 0.9))
                setClipFadeIn(clip.id, newFade)
              }
              const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
              window.addEventListener('mousemove', mv)
              window.addEventListener('mouseup', up)
            }}
          />
        )}

        {/* Fade-out drag handle */}
        {fadeOutPx > 0 && (
          <div
            className="fade-out-handle"
            style={{
              position:'absolute', right:0, top:0, width: fadeOutPx, bottom:0,
              borderLeft: `2px solid ${track.color}`,
              cursor: 'ew-resize',
              zIndex: 3,
            }}
            onMouseDown={e => {
              e.stopPropagation()
              const startX = e.clientX
              const orig = clip.fadeOut ?? 0
              const mv = (me: MouseEvent) => {
                const newFade = Math.max(0, Math.min(orig - (me.clientX - startX) / pixelsPerBeat, clip.durationBeats * 0.9))
                setClipFadeOut(clip.id, newFade)
              }
              const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
              window.addEventListener('mousemove', mv)
              window.addEventListener('mouseup', up)
            }}
          />
        )}

        {/* Fade-in indicator triangle */}
        {(clip.fadeIn ?? 0) > 0 && (
          <svg width={Math.min(fadeInPx, w)} height={16} style={{ position:'absolute', top:18, left:0, pointerEvents:'none', zIndex:2 }}>
            <polygon points={`0,16 ${Math.min(fadeInPx, w)},0 ${Math.min(fadeInPx, w)},16`} fill={track.color} fillOpacity={0.25} />
          </svg>
        )}

        {/* Fade-out indicator triangle */}
        {(clip.fadeOut ?? 0) > 0 && (
          <svg width={Math.min(fadeOutPx, w)} height={16} style={{ position:'absolute', top:18, right:0, pointerEvents:'none', zIndex:2 }}>
            <polygon points={`0,0 ${Math.min(fadeOutPx, w)},16 0,16`} fill={track.color} fillOpacity={0.25} />
          </svg>
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

      {/* Visual Take Lanes — shown when clip has multiple takes */}
      {(clip.takes?.length ?? 0) > 1 && (
        <div
          className="take-lanes"
          style={{ left: x, width: w }}
          onMouseDown={e => e.stopPropagation()}
        >
          {clip.takes!.map((take, i) => {
            const isActive = i === (clip.activeTakeIndex ?? 0)
            return (
              <div
                key={i}
                className={`take-lane-row ${isActive ? 'take-lane-active' : ''}`}
                onClick={e => { e.stopPropagation(); setActiveTake(clip.id, i) }}
                title={`Take ${i + 1}: ${take.name} — click to activate`}
              >
                <span className="take-lane-num">{i + 1}</span>
                <span className="take-lane-name">{take.name}</span>
                {/* Mini waveform */}
                {take.waveformPeaks && take.waveformPeaks.length > 0 ? (
                  <svg width={Math.max(10, w - 40)} height={18} style={{ flex:1, overflow:'hidden' }}>
                    {take.waveformPeaks.map((pk, j) => {
                      const sx = (j / take.waveformPeaks!.length) * (w - 40)
                      const sh = Math.max(1, pk * 16)
                      return <rect key={j} x={sx} y={9 - sh / 2} width={1.5} height={sh}
                        fill={isActive ? '#a855f7' : '#4b5563'} />
                    })}
                  </svg>
                ) : (
                  <div className="take-lane-flat" />
                )}
                {!isActive && (
                  <button
                    className="take-lane-del"
                    onClick={e => { e.stopPropagation(); deleteTake(clip.id, i) }}
                    title="Delete take"
                  >✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ── Track Lane ────────────────────────────────────────────────────────────────
function TrackLane({
  track, pixelsPerBeat, scrollLeft, onImportAudio,
  isRecording, recordingMicLevel, currentBeat, recordStartBeat,
  onClipContextMenu, onLaneContextMenu, activeTool,
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
  activeTool: EditTool
}) {
  const { addClip, selectedClipIds, selectClip, snapEnabled, snapValue } = useProjectStore()
  const [dragOver, setDragOver] = useState(false)
  // Marquee selection
  const [marquee, setMarquee] = useState<{ x: number; w: number } | null>(null)
  const laneRef = useRef<HTMLDivElement>(null)

  function handleDblClick(e: React.MouseEvent<HTMLDivElement>) {
    if (activeTool === 'scissors' || activeTool === 'fade') return
    if ((e.target as HTMLElement).closest('.clip')) return
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
      fadeInCurve: 'exp', fadeOutCurve: 'exp',
      looped: false, muted: false, aiGenerated: false,
      midiNotes: track.type === 'midi' ? [] : undefined,
    })
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (activeTool !== 'marquee') return
    if ((e.target as HTMLElement).closest('.clip')) return
    e.preventDefault()
    const rect = laneRef.current?.getBoundingClientRect()
    if (!rect) return
    const startXRel = e.clientX - rect.left
    setMarquee({ x: startXRel, w: 0 })

    const mv = (me: MouseEvent) => {
      const dx = me.clientX - rect.left - startXRel
      setMarquee({ x: Math.min(startXRel, startXRel + dx), w: Math.abs(dx) })
    }
    const up = (me: MouseEvent) => {
      // Select all clips within marquee
      const endX = me.clientX - rect.left
      const leftBeat = (Math.min(startXRel, endX) + scrollLeft) / pixelsPerBeat
      const rightBeat = (Math.max(startXRel, endX) + scrollLeft) / pixelsPerBeat
      let first = true
      track.clips.forEach(c => {
        const cEnd = c.startBeat + c.durationBeats
        if (cEnd > leftBeat && c.startBeat < rightBeat) {
          selectClip(c.id, !first)
          first = false
        }
      })
      setMarquee(null)
      window.removeEventListener('mousemove', mv)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
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
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
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
    for (const file of files) await onImportAudio(track.id, file, startBeat)
  }

  const showLiveBar = isRecording && track.armed
  const recBarX = recordStartBeat * pixelsPerBeat - scrollLeft
  const recBarWidth = Math.max(0, (currentBeat - recordStartBeat) * pixelsPerBeat)
  const barHeight = Math.max(4, recordingMicLevel * (track.height - 12))

  return (
    <div
      ref={laneRef}
      className={`track-lane${dragOver ? ' track-lane-dragover' : ''}`}
      style={{ height: track.height, cursor: activeTool === 'marquee' ? 'crosshair' : undefined }}
      onDoubleClick={handleDblClick}
      onMouseDown={handleMouseDown}
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
          activeTool={activeTool}
        />
      ))}
      {track.muted && <div className="lane-muted-overlay">MUTED</div>}
      {dragOver && <div className="lane-drop-hint">Drop audio file here</div>}

      {/* Marquee selection box */}
      {marquee && (
        <div style={{
          position:'absolute', top:0, bottom:0,
          left: marquee.x, width: marquee.w,
          background: 'rgba(168,85,247,0.1)',
          border: '1px solid rgba(168,85,247,0.5)',
          pointerEvents:'none', zIndex:20,
        }} />
      )}

      {showLiveBar && recBarWidth > 0 && (
        <div className="rec-live-bar-wrap" style={{ left: recBarX, width: recBarWidth }}>
          <div style={{
            position:'absolute',left:0,top:3,bottom:3,right:0,
            background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',
            borderRadius:3,pointerEvents:'none',
          }} />
          <div className="rec-live-bar" style={{ position:'absolute',right:0,height:`${barHeight}px`,top:`${(track.height - barHeight) / 2}px` }} />
        </div>
      )}
    </div>
  )
}

// ── Drop zone below all tracks ─────────────────────────────────────────────────
function TimelineDropZone({ onDropCreateTrack }: { onDropCreateTrack?: (file: File) => void }) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      className={`timeline-drop-zone ${dragOver ? 'dragover' : ''}`}
      onDragOver={e => {
        const hasAudio = Array.from(e.dataTransfer.items).some(i => i.kind === 'file' && i.type.startsWith('audio/'))
        if (!hasAudio) return
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver(true)
      }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={e => {
        e.preventDefault(); setDragOver(false)
        if (!onDropCreateTrack) return
        Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/')).forEach(f => onDropCreateTrack(f))
      }}
    >
      {dragOver ? '+ Create new track with this file' : 'Drop audio here to create a new track'}
    </div>
  )
}

// ── Main Timeline ─────────────────────────────────────────────────────────────
export function Timeline({
  playheadX, onScrub, onImportAudio, onDropCreateTrack, recordingMicLevel = 0,
}: {
  playheadX: number
  onScrub: (beat: number) => void
  onImportAudio?: (trackId: string, file: File, startBeat: number) => Promise<void>
  onDropCreateTrack?: (file: File) => void
  recordingMicLevel?: number
}) {
  const store = useProjectStore()
  const {
    tracks, pixelsPerBeat, scrollLeft, setScrollLeft, bpm, loopStart, loopEnd, isLooping,
    timeSignature, isRecording, currentTime, zoom, setZoom, snapValue, setSnapValue, activeTool,
    automationLanes,
  } = store
  const scrollRef = useRef<HTMLDivElement>(null)
  const TOTAL_BARS = 96
  const BEATS_PER_BAR = timeSignature[0]
  const totalBeats = TOTAL_BARS * BEATS_PER_BAR
  const totalWidth = totalBeats * pixelsPerBeat
  const currentBeat = currentTime * (bpm / 60)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const recordStartBeatRef = useRef(0)
  useEffect(() => {
    if (isRecording) recordStartBeatRef.current = currentBeat
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
    if (absoluteX > scrollLeft + viewW - 80) el.scrollLeft = absoluteX - 60
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
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Set Loop Start Here', action: () => store.setLoopRange(clickBeat, store.loopEnd) },
        { label: 'Set Loop End Here', action: () => store.setLoopRange(store.loopStart, clickBeat) },
        { separator: true, label: '', action: () => {} },
        { label: 'Snap: Bar', action: () => setSnapValue('1'), shortcut: store.snapValue === '1' ? '✓' : '' },
        { label: 'Snap: Beat', action: () => setSnapValue('1/4'), shortcut: store.snapValue === '1/4' ? '✓' : '' },
        { label: 'Snap: 1/8', action: () => setSnapValue('1/8'), shortcut: store.snapValue === '1/8' ? '✓' : '' },
        { label: 'Snap: Off', action: () => setSnapValue('off'), shortcut: store.snapValue === 'off' ? '✓' : '' },
      ],
    })
  }

  // ── Clip context menu ─────────────────────────────────────────────────────
  const handleClipContextMenu = useCallback((e: React.MouseEvent, clip: Clip) => {
    const currentBeatNow = useProjectStore.getState().currentTime * (useProjectStore.getState().bpm / 60)
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        {
          label: 'Split at Playhead', shortcut: 'S',
          action: () => {
            if (currentBeatNow > clip.startBeat && currentBeatNow < clip.startBeat + clip.durationBeats) {
              store.saveSnapshot()
              store.splitClipAtBeat(clip.id, currentBeatNow)
            }
          },
          disabled: currentBeatNow <= clip.startBeat || currentBeatNow >= clip.startBeat + clip.durationBeats,
        },
        { label: 'Split at Midpoint', action: () => { store.saveSnapshot(); store.splitClipAtBeat(clip.id, clip.startBeat + clip.durationBeats / 2) } },
        { separator: true, label: '', action: () => {} },
        { label: 'Fade In (1 beat)', shortcut: 'F', action: () => store.setClipFadeIn(clip.id, 1) },
        { label: 'Fade Out (1 beat)', action: () => store.setClipFadeOut(clip.id, 1) },
        { label: 'Fade In (2 beats)', action: () => store.setClipFadeIn(clip.id, 2) },
        { label: 'Fade Out (2 beats)', action: () => store.setClipFadeOut(clip.id, 2) },
        { label: 'Set Crossfade...', action: () => {
          const v = prompt('Crossfade (beats):', String((clip.crossfadeBeats ?? 0).toFixed(2)))
          if (v !== null) { const n = parseFloat(v); if (!isNaN(n)) store.setClipCrossfade(clip.id, n) }
        }},
        { label: 'Remove Fades', action: () => { store.setClipFadeIn(clip.id, 0); store.setClipFadeOut(clip.id, 0) } },
        { separator: true, label: '', action: () => {} },
        { label: clip.looped ? 'Unloop' : 'Loop', action: () => store.updateClip(clip.id, { looped: !clip.looped }) },
        { label: clip.muted ? 'Unmute' : 'Mute', shortcut: 'M', action: () => store.updateClip(clip.id, { muted: !clip.muted }) },
        { separator: true, label: '', action: () => {} },
        { label: 'Rename...', action: () => {
          const newName = prompt('Clip name:', clip.name)
          if (newName !== null && newName.trim()) store.updateClip(clip.id, { name: newName.trim() })
        }},
        { label: 'Set Gain...', action: () => {
          const val = prompt('Gain (0–200%):', String(Math.round(clip.gain * 100)))
          if (val !== null) { const n = parseFloat(val); if (!isNaN(n)) store.updateClip(clip.id, { gain: Math.max(0, Math.min(2, n / 100)) }) }
        }},
        { label: `Flex Time: ${clip.flexRate && clip.flexRate !== 1 ? `${(clip.flexRate * 100).toFixed(0)}%` : 'Off'}`, action: () => {
          const v = prompt('Flex time rate (25%–400%):\n100% = original speed\n50% = half speed (stretches)\n200% = double speed', String(Math.round((clip.flexRate ?? 1) * 100)))
          if (v !== null) { const n = parseFloat(v); if (!isNaN(n) && n >= 25 && n <= 400) store.setClipFlexRate(clip.id, n / 100) }
        }},
        { label: clip.flexRate && clip.flexRate !== 1 ? 'Reset Flex Time' : '', action: () => store.setClipFlexRate(clip.id, 1),
          disabled: !clip.flexRate || clip.flexRate === 1 },
        { separator: true, label: '', action: () => {} },
        { label: 'Duplicate', shortcut: '⌘D', action: () => store.duplicateClip(clip.id) },
        { label: 'Copy', shortcut: '⌘C', action: () => store.setClipboardClip(clip) },
        { label: 'Delete', shortcut: 'Del', danger: true, action: () => store.removeClip(clip.id) },
        ...((clip.takes?.length ?? 0) > 0 ? [
          { separator: true, label: '', action: () => {} },
          { label: `Takes (${clip.takes!.length}) — select:`, action: () => {} },
          ...clip.takes!.map((take, i) => ({
            label: `  ${i === (clip.activeTakeIndex ?? 0) ? '✓ ' : ''}Take ${i + 1}: ${take.name}`,
            action: () => store.setActiveTake(clip.id, i),
          })),
          { label: 'Delete Current Take', danger: true, action: () => store.deleteTake(clip.id, clip.activeTakeIndex ?? 0) },
        ] : []),
      ],
    })
  }, [store])

  // ── Lane context menu ─────────────────────────────────────────────────────
  const handleLaneContextMenu = useCallback((e: React.MouseEvent, track: Track, clickBeat: number) => {
    const cb = useProjectStore.getState().clipboardClip
    const items: ContextMenuItem[] = []
    if (cb) {
      items.push({
        label: 'Paste',
        action: () => store.addClip({ ...cb, id: `clip-paste-${Date.now()}`, trackId: track.id, startBeat: clickBeat }),
      })
    }
    items.push({
      label: 'Insert Silence',
      action: () => store.addClip({
        id: `clip-silence-${Date.now()}`, trackId: track.id, startBeat: clickBeat, durationBeats: 4,
        name: 'Silence', type: 'audio', gain: 0, fadeIn: 0, fadeOut: 0,
        fadeInCurve: 'exp', fadeOutCurve: 'exp', looped: false, muted: false, aiGenerated: false,
      }),
    })
    items.push({ separator: true, label: '', action: () => {} })
    items.push({ label: 'Add Audio Track', action: () => store.addTrack('audio') })
    items.push({ label: 'Add MIDI Track', action: () => store.addTrack('midi') })
    items.push({ separator: true, label: '', action: () => {} })

    const PRESET_COLORS = ['#a855f7','#ec4899','#3b82f6','#10b981','#f59e0b','#ef4444']
    items.push({
      label: 'Track Color...',
      action: () => {
        const colorChoice = prompt(
          `Pick a color:\n${PRESET_COLORS.map((c,i) => `${i+1}. ${c}`).join('\n')}\nEnter number or hex:`, '1'
        )
        if (!colorChoice) return
        const idx = parseInt(colorChoice) - 1
        const color = (idx >= 0 && idx < PRESET_COLORS.length) ? PRESET_COLORS[idx] : colorChoice
        if (/^#[0-9a-fA-F]{3,6}$/.test(color)) store.updateTrack(track.id, { color })
      },
    })
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
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
      ticks.push(<div key={`${bar}-${b}`} className="ruler-tick beat-tick" style={{ left: bx }}><div className="ruler-line" style={{ height: 5 }} /></div>)
    }
  }

  // Grid lines
  const gridLines: React.ReactNode[] = []
  for (let bar = 0; bar <= TOTAL_BARS; bar++) {
    const x = bar * BEATS_PER_BAR * pixelsPerBeat
    if (x < scrollLeft - 10 || x > scrollLeft + 3000) continue
    gridLines.push(<div key={`grid-${bar}`} style={{ position:'absolute',left:x,top:0,bottom:0,width:1,background:'rgba(255,255,255,0.05)',pointerEvents:'none' }} />)
    for (let b = 1; b < BEATS_PER_BAR; b++) {
      const bx = (bar * BEATS_PER_BAR + b) * pixelsPerBeat
      gridLines.push(<div key={`beat-${bar}-${b}`} style={{ position:'absolute',left:bx,top:0,bottom:0,width:1,background:'rgba(255,255,255,0.025)',pointerEvents:'none' }} />)
    }
  }

  return (
    <div
      ref={scrollRef}
      className="timeline"
      style={{ overflowX:'auto', overflowY:'auto', flex:1, position:'relative' }}
      onWheel={e => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          setZoom(Math.max(0.25, Math.min(6, zoom + (e.deltaY > 0 ? -0.15 : 0.15))))
        }
      }}
    >
      {/* Ruler */}
      <div
        className="timeline-ruler"
        style={{ width: totalWidth, minWidth:'100%', position:'sticky', top:0, zIndex:10 }}
        onMouseDown={handleRulerMouseDown}
        onContextMenu={handleRulerContextMenu}
        onDragOver={e => { if (Array.from(e.dataTransfer.items).some(i => i.kind==='file' && i.type.startsWith('audio/'))) { e.preventDefault(); e.dataTransfer.dropEffect='copy' } }}
        onDrop={e => {
          e.preventDefault()
          Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/')).forEach(f => onDropCreateTrack?.(f))
        }}
      >
        {ticks}

        {/* ── Loop region — always rendered, dimmed when loop is off ──────── */}
        {(() => {
          const loopActive = isLooping
          const regionLeft  = loopStart * pixelsPerBeat
          const regionWidth = Math.max(0, (loopEnd - loopStart) * pixelsPerBeat)
          const beatsToLabel = (b: number) => {
            const bar  = Math.floor(b / BEATS_PER_BAR) + 1
            const beat = Math.floor(b % BEATS_PER_BAR) + 1
            return `${bar}:${beat}`
          }

          const handleStartDrag = (e: React.MouseEvent) => {
            e.stopPropagation()
            const startX = e.clientX
            const orig   = useProjectStore.getState().loopStart
            const mv = (me: MouseEvent) => {
              const st = useProjectStore.getState()
              const raw = Math.max(0, orig + (me.clientX - startX) / pixelsPerBeat)
              const snapped = snapBeat(raw, st.snapValue, st.snapEnabled)
              st.setLoopRange(Math.min(snapped, st.loopEnd - 0.5), st.loopEnd)
            }
            const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
          }

          const handleEndDrag = (e: React.MouseEvent) => {
            e.stopPropagation()
            const startX = e.clientX
            const orig   = useProjectStore.getState().loopEnd
            const mv = (me: MouseEvent) => {
              const st = useProjectStore.getState()
              const raw = Math.max(st.loopStart + 0.5, orig + (me.clientX - startX) / pixelsPerBeat)
              const snapped = snapBeat(raw, st.snapValue, st.snapEnabled)
              st.setLoopRange(st.loopStart, snapped)
            }
            const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
          }

          const handleRegionDrag = (e: React.MouseEvent) => {
            e.stopPropagation()
            const startX   = e.clientX
            const origStart = useProjectStore.getState().loopStart
            const origEnd   = useProjectStore.getState().loopEnd
            const dur = origEnd - origStart
            const mv = (me: MouseEvent) => {
              const st = useProjectStore.getState()
              const rawStart = Math.max(0, origStart + (me.clientX - startX) / pixelsPerBeat)
              const snapped = snapBeat(rawStart, st.snapValue, st.snapEnabled)
              st.setLoopRange(snapped, snapped + dur)
            }
            const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
          }

          return (
            <>
              {/* Shaded region body — drag to move entire loop range */}
              <div
                className={`loop-region${loopActive ? ' loop-region-active' : ' loop-region-inactive'}`}
                style={{ left: regionLeft, width: regionWidth, pointerEvents: 'auto', cursor: 'move' }}
                onMouseDown={handleRegionDrag}
                title="Drag to move loop region"
              >
                {regionWidth > 48 && (
                  <span className="loop-region-label">
                    {beatsToLabel(loopStart)}–{beatsToLabel(loopEnd)}
                  </span>
                )}
              </div>

              {/* Start handle */}
              <div
                className={`loop-locator loop-locator-start${loopActive ? '' : ' loop-locator-inactive'}`}
                style={{ left: regionLeft, pointerEvents: 'auto' }}
                onMouseDown={handleStartDrag}
                title={`Loop start: ${beatsToLabel(loopStart)} — drag to move`}
              >
                <span className="loop-handle-label">S</span>
              </div>

              {/* End handle */}
              <div
                className={`loop-locator loop-locator-end${loopActive ? '' : ' loop-locator-inactive'}`}
                style={{ left: regionLeft + regionWidth, pointerEvents: 'auto' }}
                onMouseDown={handleEndDrag}
                title={`Loop end: ${beatsToLabel(loopEnd)} — drag to move`}
              >
                <span className="loop-handle-label">E</span>
              </div>
            </>
          )
        })()}
      </div>

      {/* Lanes + grid */}
      <div style={{ position:'relative', width: totalWidth, minWidth:'100%' }}>
        {gridLines}
        {tracks.map(track => {
          const trackAutoLanes = automationLanes.filter(l => l.trackId === track.id)
          return (
            <React.Fragment key={track.id}>
              <TrackLane
                track={track}
                pixelsPerBeat={pixelsPerBeat} scrollLeft={scrollLeft}
                onImportAudio={onImportAudio}
                isRecording={isRecording} recordingMicLevel={recordingMicLevel}
                currentBeat={currentBeat} recordStartBeat={recordStartBeatRef.current}
                onClipContextMenu={handleClipContextMenu} onLaneContextMenu={handleLaneContextMenu}
                activeTool={activeTool}
              />
              {/* Automation lanes for this track */}
              {trackAutoLanes.map(lane => (
                <AutomationLaneView
                  key={lane.id}
                  lane={lane}
                  pixelsPerBeat={pixelsPerBeat}
                  scrollLeft={scrollLeft}
                  totalBeats={totalBeats}
                  activeTool={activeTool}
                />
              ))}
            </React.Fragment>
          )
        })}

        <TimelineDropZone onDropCreateTrack={onDropCreateTrack} />

        {/* Playhead */}
        <div className="playhead" style={{ left: playheadX, top:0, bottom:0 }}>
          <div className="playhead-head" />
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}
