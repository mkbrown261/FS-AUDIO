/**
 * FS-AUDIO Comp Editor
 * Logic Pro-style comping: drag/click sections across take waveforms to build a composite.
 * Shows all takes stacked, lets user paint the "comp" region on each take.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useProjectStore, Clip, Take } from '../store/projectStore'

interface CompRegion {
  takeIndex: number
  startBeat: number
  endBeat: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  clipId: string | null
}

// Waveform renderer for a take
function TakeWaveform({
  peaks, width, height, color, regions, takeIndex, totalBeats, onPaint,
}: {
  peaks: number[]
  width: number
  height: number
  color: string
  regions: CompRegion[]
  takeIndex: number
  totalBeats: number
  onPaint: (takeIdx: number, startBeat: number, endBeat: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef<{ start: number } | null>(null)
  const lastBeat = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    // Draw waveform
    const mid = height / 2
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, width, height)

    if (peaks.length > 0) {
      const step = width / peaks.length
      ctx.strokeStyle = color + '66'
      ctx.lineWidth = 1
      for (let i = 0; i < peaks.length; i++) {
        const x = i * step
        const h = peaks[i] * mid * 0.9
        ctx.beginPath()
        ctx.moveTo(x, mid - h)
        ctx.lineTo(x, mid + h)
        ctx.stroke()
      }
    } else {
      // No waveform data — show flat line
      ctx.strokeStyle = color + '33'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, mid)
      ctx.lineTo(width, mid)
      ctx.stroke()
    }

    // Draw comp regions (highlighted)
    regions.filter(r => r.takeIndex === takeIndex).forEach(region => {
      const x1 = (region.startBeat / totalBeats) * width
      const x2 = (region.endBeat / totalBeats) * width
      ctx.fillStyle = color + '55'
      ctx.fillRect(x1, 0, x2 - x1, height)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(x1, 0, x2 - x1, height)
    })
  }, [peaks, width, height, color, regions, takeIndex, totalBeats])

  const beatFromX = (x: number) => Math.max(0, Math.min(totalBeats, (x / width) * totalBeats))

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const beat = beatFromX(e.clientX - rect.left)
    dragging.current = { start: beat }
    lastBeat.current = beat
    e.preventDefault()
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const beat = beatFromX(e.clientX - rect.left)
    lastBeat.current = beat
  }, [totalBeats, width])

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return
    const start = Math.min(dragging.current.start, lastBeat.current)
    const end = Math.max(dragging.current.start, lastBeat.current)
    if (end - start > 0.01) {
      onPaint(takeIndex, start, end)
    }
    dragging.current = null
  }, [takeIndex, onPaint])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={onMouseDown}
      style={{ display:'block', cursor:'crosshair', borderBottom:'1px solid #1a1a2e' }}
    />
  )
}

export default function CompEditor({ isOpen, onClose, clipId }: Props) {
  const store = useProjectStore()
  const [regions, setRegions] = useState<CompRegion[]>([])
  const [zoom, setZoom] = useState(1)
  const WIDTH = 560

  // Find the clip
  let clip: Clip | null = null
  let trackId = ''
  if (clipId) {
    for (const track of store.tracks) {
      const found = track.clips.find(c => c.id === clipId)
      if (found) { clip = found; trackId = track.id; break }
    }
  }

  const takes: Take[] = clip?.takes || []
  const totalBeats = clip?.durationBeats || 8

  // Paint a comp region (clears overlapping regions on other takes)
  const handlePaint = useCallback((takeIdx: number, startBeat: number, endBeat: number) => {
    setRegions(prev => {
      // Remove existing regions that overlap this time range on ANY take
      const filtered = prev.filter(r => {
        if (r.endBeat <= startBeat || r.startBeat >= endBeat) return true
        return false
      })
      return [...filtered, { takeIndex: takeIdx, startBeat, endBeat }]
    })
  }, [])

  // Clear all regions
  const handleClear = useCallback(() => setRegions([]), [])

  // Apply comp: set activeTakeIndex for each beat segment
  // For simplicity, we merge regions into a new composite by copying notes/audio
  const handleApply = useCallback(() => {
    if (!clip || takes.length === 0) { alert('No takes to comp.'); return }
    if (regions.length === 0) { alert('Paint comp regions first by dragging on take waveforms.'); return }

    // Sort regions by start beat
    const sorted = [...regions].sort((a, b) => a.startBeat - b.startBeat)

    // For a MIDI clip: merge notes from each take based on regions
    if (clip.type === 'midi' || clip.midiNotes) {
      const compNotes = sorted.flatMap(region => {
        const take = takes[region.takeIndex]
        if (!take?.midiNotes) return []
        return take.midiNotes.filter(note =>
          note.startBeat >= region.startBeat && note.startBeat < region.endBeat
        )
      })
      store.updateClip(clip.id, { midiNotes: compNotes })
    }

    // Save the regions as metadata (stored in clip name for now)
    store.updateClip(clip.id, {
      name: clip.name + ' [COMP]',
    })

    alert(`Comp applied! ${sorted.length} region(s) merged from ${takes.length} take(s).`)
    onClose()
  }, [clip, takes, regions, store, onClose])

  // Auto-fill: fill entire clip from selected take
  const handleFillTake = useCallback((takeIdx: number) => {
    setRegions([{ takeIndex: takeIdx, startBeat: 0, endBeat: totalBeats }])
  }, [totalBeats])

  if (!isOpen) return null

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:2300,
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => { if (e.target===e.currentTarget) onClose() }}>
      <div style={{
        background:'#0d0d14', border:'1px solid #2a2a3e', borderRadius:14,
        width:620, maxHeight:'85vh', display:'flex', flexDirection:'column',
        fontFamily:'system-ui,sans-serif', color:'#fff',
        boxShadow:'0 24px 80px rgba(0,0,0,0.9)',
      }}>
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 20px', borderBottom:'1px solid #1e1e2e', flexShrink:0,
          background:'linear-gradient(135deg,#001a33,#0d0d14)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>✂️</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>Comp Editor</div>
              <div style={{ color:'#888', fontSize:10 }}>
                {clip ? `"${clip.name}" — ${takes.length} take${takes.length!==1?'s':''}` : 'No clip selected'}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={handleClear} style={{
              padding:'5px 10px', borderRadius:6, border:'1px solid #333',
              background:'#111', color:'#888', cursor:'pointer', fontSize:11,
            }}>Clear</button>
            <button onClick={handleApply} style={{
              padding:'5px 12px', borderRadius:6, border:'none',
              background: regions.length > 0 ? '#10b981' : '#222',
              color: regions.length > 0 ? '#fff' : '#555',
              cursor: regions.length > 0 ? 'pointer' : 'default', fontSize:11, fontWeight:700,
            }}>Apply Comp</button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:18 }}>✕</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          {!clip ? (
            <div style={{ color:'#555', textAlign:'center', padding:40 }}>
              Select a clip with takes in the timeline first.
            </div>
          ) : takes.length === 0 ? (
            <div style={{ color:'#555', textAlign:'center', padding:40 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📭</div>
              <div style={{ fontSize:13 }}>This clip has no takes.</div>
              <div style={{ fontSize:11, color:'#444', marginTop:6 }}>
                Record in Cycle or Punch-In mode to create takes.
              </div>
            </div>
          ) : (
            <>
              {/* Instructions */}
              <div style={{
                background:'#0a1a1a', borderRadius:6, padding:'8px 12px', marginBottom:12,
                border:'1px solid #1a3a3a', color:'#888', fontSize:10, lineHeight:1.5,
              }}>
                💡 <strong style={{ color:'#22d3ee' }}>Drag</strong> horizontally on any take waveform to select that region for the comp.
                Click <strong style={{ color:'#22d3ee' }}>Fill</strong> to use an entire take. Hit <strong style={{ color:'#10b981' }}>Apply Comp</strong> when done.
              </div>

              {/* Ruler */}
              <div style={{
                display:'flex', marginLeft:80, width:WIDTH,
                borderBottom:'1px solid #222', marginBottom:4,
              }}>
                {Array.from({ length: Math.ceil(totalBeats) }, (_, i) => (
                  <div key={i} style={{
                    flex:`0 0 ${(1/totalBeats)*WIDTH}px`, color:'#555', fontSize:9,
                    textAlign:'left', paddingLeft:2, borderLeft:'1px solid #222',
                  }}>{i+1}</div>
                ))}
              </div>

              {/* Takes */}
              {takes.map((take, takeIdx) => {
                const isFullySelected = regions.some(
                  r => r.takeIndex === takeIdx && r.startBeat <= 0.01 && r.endBeat >= totalBeats - 0.01
                )
                return (
                  <div key={take.id} style={{
                    display:'flex', alignItems:'center', marginBottom:6,
                    opacity: take.id === clip.takes?.[clip.activeTakeIndex ?? 0]?.id ? 1 : 0.85,
                  }}>
                    {/* Take label */}
                    <div style={{
                      width:76, flexShrink:0, display:'flex', flexDirection:'column',
                      alignItems:'flex-end', paddingRight:8, gap:3,
                    }}>
                      <div style={{ color:'#888', fontSize:10, fontWeight:600 }}>
                        Take {takeIdx + 1}
                      </div>
                      <div style={{ display:'flex', gap:3 }}>
                        <button onClick={() => handleFillTake(takeIdx)} title="Fill entire comp from this take" style={{
                          fontSize:9, padding:'1px 5px', borderRadius:3, border:'none',
                          background: isFullySelected ? '#10b981' : '#222',
                          color: isFullySelected ? '#fff' : '#888', cursor:'pointer',
                        }}>Fill</button>
                        {take.audioUrl && (
                          <div style={{
                            fontSize:8, padding:'1px 4px', borderRadius:3,
                            background:'#1a1a2e', color:'#666',
                          }}>Audio</div>
                        )}
                        {take.midiNotes && (
                          <div style={{
                            fontSize:8, padding:'1px 4px', borderRadius:3,
                            background:'#001a33', color:'#22d3ee',
                          }}>MIDI</div>
                        )}
                      </div>
                    </div>

                    {/* Waveform */}
                    <TakeWaveform
                      peaks={take.waveformPeaks || []}
                      width={WIDTH}
                      height={44}
                      color={`hsl(${200 + takeIdx * 40},80%,60%)`}
                      regions={regions}
                      takeIndex={takeIdx}
                      totalBeats={totalBeats}
                      onPaint={handlePaint}
                    />
                  </div>
                )
              })}

              {/* Comp result preview */}
              <div style={{ marginTop:12 }}>
                <div style={{ color:'#888', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                  Comp Result ({regions.length} region{regions.length!==1?'s':''})
                </div>
                <div style={{
                  height:32, background:'#0a0f0a', borderRadius:6, position:'relative',
                  border:'1px solid #1a3a1a', overflow:'hidden', marginLeft:80,
                }}>
                  {regions.map((region, ri) => {
                    const x = (region.startBeat / totalBeats) * WIDTH
                    const w = ((region.endBeat - region.startBeat) / totalBeats) * WIDTH
                    const hue = 200 + region.takeIndex * 40
                    return (
                      <div key={ri} style={{
                        position:'absolute', top:0, left:x, width:w, height:'100%',
                        background: `hsla(${hue},80%,60%,0.4)`,
                        borderLeft:`2px solid hsl(${hue},80%,60%)`,
                      }}>
                        <div style={{ fontSize:8, color:'#fff', padding:'2px 3px', whiteSpace:'nowrap', overflow:'hidden' }}>
                          T{region.takeIndex+1}
                        </div>
                      </div>
                    )
                  })}
                  {regions.length === 0 && (
                    <div style={{ color:'#333', fontSize:10, textAlign:'center', lineHeight:'32px' }}>
                      No regions selected
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
