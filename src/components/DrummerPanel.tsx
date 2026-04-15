/**
 * DrummerPanel — Logic Pro-style Drummer Track UI
 * Genre selector, parameter knobs, and "Generate" to create MIDI drum clips.
 */

import React, { useState, useCallback } from 'react'
import { useProjectStore } from '../store/projectStore'
import {
  DrummerGenre, DrummerParams, DRUMMER_DEFAULTS, DRUMMER_GENRES,
  generateDrumPattern, GM_DRUMS,
} from '../audio/DrummerEngine'

interface Props {
  isOpen: boolean
  onClose: () => void
}

// Simple knob with drag
function Knob({
  label, value, min, max, step = 0.01, decimals = 2,
  color = '#10b981', onChange,
}: {
  label: string; value: number; min: number; max: number
  step?: number; decimals?: number; color?: string
  onChange: (v: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const startY = React.useRef(0)
  const startV = React.useRef(value)

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    startY.current = e.clientY
    startV.current = value
    e.preventDefault()
  }
  React.useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const dy = startY.current - e.clientY
      const range = max - min
      const delta = (dy / 100) * range
      onChange(Math.max(min, Math.min(max, startV.current + delta)))
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, min, max, onChange])

  const pct = (value - min) / (max - min)
  const angle = -135 + pct * 270

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'ns-resize', userSelect:'none' }}
         onMouseDown={onMouseDown}>
      <svg width={44} height={44} style={{ display:'block' }}>
        <circle cx={22} cy={22} r={18} fill="#1a1a2e" stroke="#333" strokeWidth={2} />
        <circle cx={22} cy={22} r={18} fill="none" stroke="#222" strokeWidth={4}
          strokeDasharray={`${2*Math.PI*14}`} strokeLinecap="round" />
        <circle cx={22} cy={22} r={14} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={`${2*Math.PI*14 * pct} ${2*Math.PI*14 * (1-pct)}`}
          strokeDashoffset={2*Math.PI*14 * 0.375}
          strokeLinecap="round" />
        <line
          x1={22} y1={22}
          x2={22 + 10 * Math.cos((angle - 90) * Math.PI/180)}
          y2={22 + 10 * Math.sin((angle - 90) * Math.PI/180)}
          stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <span style={{ fontSize:9, color:'#aaa', textTransform:'uppercase', letterSpacing:1 }}>{label}</span>
      <span style={{ fontSize:10, color:'#fff', fontWeight:600 }}>{value.toFixed(decimals)}</span>
    </div>
  )
}

// Pill toggle
function Pill({ options, value, onChange, color = '#10b981' }: {
  options: string[]; value: string; onChange: (v: string) => void; color?: string
}) {
  return (
    <div style={{ display:'flex', gap:2, background:'#111', borderRadius:20, padding:2 }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding:'3px 10px', borderRadius:16, border:'none', cursor:'pointer', fontSize:10, fontWeight:600,
          background: value === o ? color : 'transparent',
          color: value === o ? '#fff' : '#777',
          transition:'all 0.15s',
        }}>{o}</button>
      ))}
    </div>
  )
}

// Mini piano roll preview of generated notes
function DrumPreview({ notes, bars }: { notes: { pitch: number; startBeat: number; durationBeats: number }[]; bars: number }) {
  const totalBeats = bars * 4
  const w = 320, h = 60
  const pitches = Array.from(new Set(notes.map(n => n.pitch))).sort((a,b)=>b-a)
  const rowH = Math.max(4, Math.floor(h / Math.max(pitches.length, 1)))
  const colW = w / (totalBeats * 4) // 16th resolution

  const drumName = (p: number) => {
    const entry = Object.entries(GM_DRUMS).find(([,v]) => v === p)
    return entry ? entry[0] : p.toString()
  }

  return (
    <div style={{ position:'relative', width:w, height:h, background:'#0d0d1a', borderRadius:6, overflow:'hidden', border:'1px solid #222' }}>
      {pitches.map((pitch, row) => {
        const pitchNotes = notes.filter(n => n.pitch === pitch)
        return (
          <React.Fragment key={pitch}>
            <div style={{
              position:'absolute', top: row*rowH, left:0, height:rowH, width:w,
              background: row%2===0 ? '#0d0d1a' : '#111',
            }} />
            {pitchNotes.map((note, i) => {
              const x = (note.startBeat / totalBeats) * w
              const noteW = Math.max(2, (note.durationBeats / totalBeats) * w)
              const colors: Record<number,string> = {
                36:'#ef4444', 38:'#3b82f6', 42:'#10b981', 46:'#f59e0b',
                49:'#8b5cf6', 51:'#ec4899', 50:'#06b6d4', 47:'#f97316', 43:'#84cc16',
              }
              return (
                <div key={i} style={{
                  position:'absolute', top: row*rowH+1, left:x, width:noteW, height:Math.max(2,rowH-2),
                  background: colors[pitch] || '#666', borderRadius:2, opacity:0.9,
                }} title={`${drumName(pitch)} @ ${note.startBeat.toFixed(2)}`} />
              )
            })}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default function DrummerPanel({ isOpen, onClose }: Props) {
  const store = useProjectStore()
  const [params, setParams] = useState<DrummerParams>({ ...DRUMMER_DEFAULTS, bpm: store.bpm })
  const [preview, setPreview] = useState<ReturnType<typeof generateDrumPattern>>([])
  const [generated, setGenerated] = useState(false)

  const set = useCallback(<K extends keyof DrummerParams>(k: K, v: DrummerParams[K]) => {
    setParams(p => ({ ...p, [k]: v }))
    setGenerated(false)
  }, [])

  const handleGenerate = useCallback(() => {
    const notes = generateDrumPattern({ ...params, bpm: store.bpm })
    setPreview(notes)
    setGenerated(true)
  }, [params, store.bpm])

  const handleAddToTimeline = useCallback(() => {
    const notes = generated ? preview : generateDrumPattern({ ...params, bpm: store.bpm })
    // Find or create a drum MIDI track
    let drumTrack = store.tracks.find(t => t.type === 'midi' && t.name.toLowerCase().includes('drum'))
    if (!drumTrack) {
      store.addTrack('midi')
      const tracks = useProjectStore.getState().tracks
      drumTrack = tracks[tracks.length - 1]
      store.updateTrack(drumTrack!.id, { name: 'Drummer', color: '#f59e0b' })
      drumTrack = useProjectStore.getState().tracks.find(t => t.id === drumTrack!.id)!
    }
    // Find start beat (end of last clip on that track)
    const existingClips = drumTrack!.clips
    const startBeat = existingClips.length > 0
      ? Math.max(...existingClips.map(c => c.startBeat + c.durationBeats))
      : 0

    store.addClip({
      id: `drummer-clip-${Date.now()}`,
      trackId: drumTrack!.id,
      name: `Drummer (${params.genre})`,
      type: 'midi' as const,
      startBeat,
      durationBeats: params.bars * 4,
      gain: 1,
      midiNotes: notes,
      color: '#f59e0b',
      fadeIn: 0,
      fadeOut: 0,
      fadeInCurve: 'linear' as const,
      fadeOutCurve: 'linear' as const,
      looped: false,
      muted: false,
      aiGenerated: false,
    })
    setGenerated(false)
    onClose()
  }, [generated, preview, params, store, onClose])

  if (!isOpen) return null

  const selectedGenre = DRUMMER_GENRES.find(g => g.value === params.genre)

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background:'#13131f', border:'1px solid #2a2a3e', borderRadius:16,
        width:520, maxHeight:'85vh', overflowY:'auto',
        boxShadow:'0 24px 80px rgba(0,0,0,0.8)',
        fontFamily:'system-ui,sans-serif',
      }}>
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 20px', borderBottom:'1px solid #1e1e2e',
          background:'linear-gradient(135deg,#1a0a00,#13131f)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:24 }}>🥁</span>
            <div>
              <div style={{ color:'#fff', fontWeight:700, fontSize:16 }}>Drummer</div>
              <div style={{ color:'#888', fontSize:11 }}>Algorithmic Beat Generator</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:20
          }}>✕</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>

          {/* Genre grid */}
          <div>
            <div style={{ color:'#888', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Genre</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
              {DRUMMER_GENRES.map(g => (
                <button key={g.value} onClick={() => set('genre', g.value as DrummerGenre)} style={{
                  padding:'8px 4px', borderRadius:8, border:`1px solid ${params.genre===g.value?'#f59e0b':'#222'}`,
                  background: params.genre===g.value ? '#2a1a00' : '#111',
                  color: params.genre===g.value ? '#f59e0b' : '#888',
                  cursor:'pointer', fontSize:10, fontWeight:600, textAlign:'center',
                  transition:'all 0.15s',
                }}>
                  <div style={{ fontSize:16 }}>{g.emoji}</div>
                  <div>{g.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Bars selector */}
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ color:'#888', fontSize:11 }}>Bars:</span>
            <Pill options={['1','2','4','8']} value={String(params.bars)}
              onChange={v => set('bars', Number(v))} color="#f59e0b" />
            <span style={{ color:'#888', fontSize:11, marginLeft:12 }}>Hi-Hat:</span>
            <Pill options={['closed','open','ride','mixed']} value={params.hihat}
              onChange={v => set('hihat', v as DrummerParams['hihat'])} color="#10b981" />
          </div>

          {/* Main knobs */}
          <div style={{ display:'flex', justifyContent:'space-around', flexWrap:'wrap', gap:8 }}>
            <Knob label="Complexity" value={params.complexity} min={0} max={1}
              color="#f59e0b" onChange={v => set('complexity', v)} />
            <Knob label="Fill Density" value={params.fillDensity} min={0} max={1}
              color="#f97316" onChange={v => set('fillDensity', v)} />
            <Knob label="Swing" value={params.swing} min={0} max={1}
              color="#a855f7" onChange={v => set('swing', v)} />
            <Knob label="Humanize" value={params.humanize} min={0} max={1}
              color="#06b6d4" onChange={v => set('humanize', v)} />
          </div>

          {/* Variation knobs */}
          <div style={{ display:'flex', justifyContent:'space-around', flexWrap:'wrap', gap:8 }}>
            <Knob label="Kick Var" value={params.kickVariation} min={0} max={1}
              color="#ef4444" onChange={v => set('kickVariation', v)} />
            <Knob label="Snare Var" value={params.snareVariation} min={0} max={1}
              color="#3b82f6" onChange={v => set('snareVariation', v)} />
            <Knob label="Hat Var" value={params.hatVariation} min={0} max={1}
              color="#10b981" onChange={v => set('hatVariation', v)} />
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ color:'#888', fontSize:9, textTransform:'uppercase', letterSpacing:1 }}>Add Perc.</div>
              <button onClick={() => set('addPercussion', !params.addPercussion)} style={{
                width:40, height:22, borderRadius:11, border:'none', cursor:'pointer',
                background: params.addPercussion ? '#10b981' : '#222',
                position:'relative', transition:'background 0.2s',
              }}>
                <div style={{
                  position:'absolute', top:2, left: params.addPercussion ? 20 : 2,
                  width:18, height:18, borderRadius:9, background:'#fff', transition:'left 0.2s',
                }} />
              </button>
            </div>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <div style={{ color:'#888', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                Preview — {preview.length} notes, {params.bars} bar{params.bars>1?'s':''}
              </div>
              <DrumPreview notes={preview} bars={params.bars} />
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button onClick={handleGenerate} style={{
              flex:1, padding:'10px 0', borderRadius:8, border:'none',
              background:'linear-gradient(135deg,#92400e,#f59e0b)',
              color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer',
            }}>
              ⚡ Generate Pattern
            </button>
            <button onClick={handleAddToTimeline} style={{
              flex:1, padding:'10px 0', borderRadius:8,
              border: `1px solid ${generated ? '#10b981' : '#333'}`,
              background: generated ? 'linear-gradient(135deg,#065f46,#10b981)' : '#1a1a2e',
              color: generated ? '#fff' : '#666',
              fontWeight:700, fontSize:13, cursor: generated ? 'pointer' : 'default',
            }}>
              ✚ Add to Timeline
            </button>
          </div>
          <p style={{ color:'#555', fontSize:10, textAlign:'center', margin:0 }}>
            Generate first, then add — or Add directly to create & insert in one step.
          </p>
        </div>
      </div>
    </div>
  )
}
