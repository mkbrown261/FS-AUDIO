import React, { useEffect, useRef, useState } from 'react'
import { useProjectStore, MidiNote, Clip } from '../store/projectStore'

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const BLACK_KEY_PITCHES = new Set([1,3,6,8,10])

function noteName(pitch: number) {
  return NOTE_NAMES[pitch % 12] + Math.floor(pitch / 12 - 1)
}
function isBlack(pitch: number) { return BLACK_KEY_PITCHES.has(pitch % 12) }

const CELL_H = 14
const BASE_PPB = 80

interface PianoRollProps {
  clipId: string | null
  onPlayNote?: (pitch: number) => void
}

export function PianoRoll({ clipId, onPlayNote }: PianoRollProps) {
  const { tracks, updateClip } = useProjectStore()
  const [ppb, setPpb] = useState(BASE_PPB)
  const [quantize, setQuantize] = useState(0.25)
  const [tool, setTool] = useState<'draw' | 'select' | 'erase'>('draw')
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  // Resolve clip (must come before useEffect that uses clip/notes)
  let clip: Clip | null = null
  let trackColor = '#a855f7'
  for (const t of tracks) {
    const c = t.clips.find(c => c.id === clipId)
    if (c) { clip = c; trackColor = t.color; break }
  }

  const notes: MidiNote[] = clip?.midiNotes ?? []
  const totalBeats = Math.max(clip?.durationBeats ?? 16, 16)
  const totalWidth = totalBeats * ppb
  const totalHeight = 128 * CELL_H

  // ── Delete / Backspace removes selected notes ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNotes.size > 0 && clip) {
        e.preventDefault()
        updateClip(clip.id, { midiNotes: notes.filter(n => !selectedNotes.has(n.id)) })
        setSelectedNotes(new Set())
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedNotes, clip, notes, updateClip])

  // ── Note actions ────────────────────────────────────────────────────────────
  function handleGridClick(e: React.MouseEvent<HTMLDivElement>) {
    if (tool !== 'draw' || !clip) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0)
    const startBeat = Math.floor((x / ppb) / quantize) * quantize
    const pitch = Math.max(0, Math.min(127, 127 - Math.floor(y / CELL_H)))
    // Don't duplicate if clicking on existing note
    if (notes.some(n => n.pitch === pitch && startBeat >= n.startBeat && startBeat < n.startBeat + n.durationBeats)) return
    const newNote: MidiNote = { id: `n-${Date.now()}`, pitch, velocity: 100, startBeat, durationBeats: quantize }
    onPlayNote?.(pitch)
    updateClip(clip.id, { midiNotes: [...notes, newNote] })
  }

  function handleNoteMouseDown(e: React.MouseEvent, note: MidiNote) {
    e.stopPropagation()
    if (!clip) return

    if (tool === 'erase') {
      updateClip(clip.id, { midiNotes: notes.filter(n => n.id !== note.id) })
      return
    }
    if (tool === 'select') {
      const next = new Set(selectedNotes)
      if (e.shiftKey) { next.has(note.id) ? next.delete(note.id) : next.add(note.id) }
      else { next.clear(); next.add(note.id) }
      setSelectedNotes(next)
    }
    // Drag move
    const startX = e.clientX
    const origBeat = note.startBeat
    const id = note.id
    const mv = (me: MouseEvent) => {
      if (!clip) return
      const dx = me.clientX - startX
      const raw = Math.max(0, origBeat + dx / ppb)
      const snapped = Math.floor(raw / quantize) * quantize
      updateClip(clip.id, { midiNotes: notes.map(n => n.id === id ? { ...n, startBeat: snapped } : n) })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  function handleNoteResizeMouseDown(e: React.MouseEvent, note: MidiNote) {
    e.stopPropagation()
    if (!clip) return
    const startX = e.clientX
    const orig = note.durationBeats
    const id = note.id
    const mv = (me: MouseEvent) => {
      if (!clip) return
      const dBeats = (me.clientX - startX) / ppb
      updateClip(clip.id, { midiNotes: notes.map(n => n.id === id ? { ...n, durationBeats: Math.max(quantize / 2, orig + dBeats) } : n) })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  function handleVelDrag(e: React.MouseEvent, note: MidiNote) {
    e.stopPropagation()
    if (!clip) return
    const startY = e.clientY
    const origVel = note.velocity
    const id = note.id
    const mv = (me: MouseEvent) => {
      if (!clip) return
      const dy = startY - me.clientY
      updateClip(clip.id, { midiNotes: notes.map(n => n.id === id ? { ...n, velocity: Math.max(1, Math.min(127, origVel + dy)) } : n) })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  if (!clip) {
    return (
      <div className="piano-roll-empty">
        <div style={{ textAlign:'center' }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ marginBottom:12, opacity:.35 }}>
            <rect x="4" y="10" width="4" height="16" rx="2" fill="#a855f7"/>
            <rect x="10" y="14" width="4" height="12" rx="2" fill="#a855f7"/>
            <rect x="16" y="8" width="4" height="18" rx="2" fill="#a855f7"/>
            <rect x="22" y="12" width="4" height="14" rx="2" fill="#a855f7"/>
            <rect x="28" y="16" width="4" height="10" rx="2" fill="#a855f7"/>
          </svg>
          <div style={{ fontSize:14, color:'#9ca3af' }}>Double-click a MIDI clip to open Piano Roll</div>
        </div>
      </div>
    )
  }

  const cursorMap = { draw: 'crosshair', select: 'default', erase: 'cell' }

  return (
    <div className="piano-roll">
      {/* Toolbar */}
      <div className="pr-toolbar">
        <div className="pr-tools">
          {/* Draw tool — pencil */}
          <button
            className={`pr-tool ${tool === 'draw' ? 'active' : ''}`}
            onClick={() => setTool('draw')}
            title="Draw (N)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="2" y1="10" x2="9" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <polygon points="9,1 11,3 10,4 8,2" fill="currentColor"/>
              <line x1="1" y1="11" x2="3" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          {/* Select tool — arrow cursor */}
          <button
            className={`pr-tool ${tool === 'select' ? 'active' : ''}`}
            onClick={() => setTool('select')}
            title="Select (S)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <polygon points="1,1 1,9 4,7 5.5,11 7,10.5 5.5,6.5 9,6.5" fill="currentColor"/>
            </svg>
          </button>
          {/* Erase tool — X */}
          <button
            className={`pr-tool ${tool === 'erase' ? 'active' : ''}`}
            onClick={() => setTool('erase')}
            title="Erase (E)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="pr-quantize">
          <label className="param-label">Grid</label>
          <select className="key-select" value={quantize} onChange={e => setQuantize(parseFloat(e.target.value))}>
            <option value={4}>1 bar</option>
            <option value={2}>1/2</option>
            <option value={1}>1/4</option>
            <option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option>
            <option value={0.125}>1/32</option>
            <option value={0.083333}>1/16T</option>
          </select>
        </div>

        <div className="pr-zoom">
          <button className="tbt" onClick={() => setPpb(p => Math.max(20, p - 20))}>−</button>
          <span className="param-label" style={{ minWidth:36, textAlign:'center' }}>{ppb}px/b</span>
          <button className="tbt" onClick={() => setPpb(p => Math.min(240, p + 20))}>+</button>
        </div>

        <div className="pr-clip-info">{clip.name} — {notes.length} notes — {tool} tool</div>

        <button
          className="tbt btab-close"
          style={{ marginLeft:'auto' }}
          onClick={() => useProjectStore.getState().setShowPianoRoll(false)}
          title="Close Piano Roll"
        >✕</button>
      </div>

      {/* Scroll area */}
      <div ref={scrollRef} style={{ overflow:'auto', flex:1, display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', width: totalWidth + 52, minHeight: totalHeight }}>

          {/* Piano keyboard */}
          <div className="pr-keyboard" style={{ width:52, flexShrink:0 }}>
            {Array.from({ length: 128 }, (_, i) => {
              const pitch = 127 - i
              const black = isBlack(pitch)
              const isC = pitch % 12 === 0
              return (
                <div
                  key={pitch}
                  className={`pr-key ${black ? 'black-key' : 'white-key'} ${isC ? 'c-key' : ''}`}
                  style={{ height: CELL_H, width: 52 }}
                  title={noteName(pitch)}
                  onMouseDown={() => onPlayNote?.(pitch)}
                >
                  {isC && <span className="key-label">{noteName(pitch)}</span>}
                </div>
              )
            })}
          </div>

          {/* Grid + notes */}
          <div
            className="pr-grid"
            style={{ width: totalWidth, height: totalHeight, position:'relative', cursor: cursorMap[tool], flexShrink:0 }}
            onClick={handleGridClick}
          >
            {/* Row backgrounds */}
            {Array.from({ length: 128 }, (_, i) => {
              const pitch = 127 - i
              const black = isBlack(pitch)
              const isC = pitch % 12 === 0
              return (
                <div key={i} style={{
                  position:'absolute', left:0, right:0, top: i * CELL_H, height: CELL_H,
                  background: black ? 'rgba(0,0,0,0.28)' : isC ? 'rgba(168,85,247,0.06)' : 'transparent',
                  borderBottom: isC ? '1px solid rgba(168,85,247,0.12)' : '1px solid rgba(255,255,255,0.025)',
                }} />
              )
            })}

            {/* Beat columns */}
            {Array.from({ length: Math.ceil(totalBeats) + 1 }, (_, b) => (
              <div key={b} style={{
                position:'absolute', top:0, bottom:0, left: b * ppb, width:1,
                background: b % 4 === 0 ? 'rgba(255,255,255,0.14)' : b % 1 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
              }} />
            ))}

            {/* Quantize grid lines */}
            {Array.from({ length: Math.ceil(totalBeats / quantize) }, (_, i) => {
              const x = i * quantize * ppb
              const isBar = (i * quantize) % 4 === 0
              const isBeat = (i * quantize) % 1 === 0
              if (isBar || isBeat) return null // already drawn above
              return <div key={`q-${i}`} style={{ position:'absolute', top:0, bottom:0, left: x, width:1, background:'rgba(255,255,255,0.03)' }} />
            })}

            {/* Notes */}
            {notes.map(note => (
              <div
                key={note.id}
                className={`midi-note ${selectedNotes.has(note.id) ? 'selected' : ''}`}
                style={{
                  left: note.startBeat * ppb,
                  top: (127 - note.pitch) * CELL_H + 1,
                  width: Math.max(6, note.durationBeats * ppb - 1),
                  height: CELL_H - 2,
                  opacity: 0.5 + (note.velocity / 127) * 0.5,
                  background: `linear-gradient(135deg, ${trackColor}, ${trackColor}aa)`,
                  borderColor: selectedNotes.has(note.id) ? '#fff' : trackColor + 'cc',
                }}
                onMouseDown={e => handleNoteMouseDown(e, note)}
                title={`${noteName(note.pitch)} — vel ${note.velocity}`}
              >
                <div className="note-resize" onMouseDown={e => handleNoteResizeMouseDown(e, note)} />
              </div>
            ))}
          </div>
        </div>

        {/* Velocity lane */}
        <div className="velocity-editor">
          <div className="vel-label">Velocity</div>
          <div style={{ position:'relative', flex:1, height:48, marginLeft:52 }}>
            {notes.map(note => (
              <div
                key={note.id}
                className="vel-bar"
                style={{
                  left: note.startBeat * ppb + 1,
                  width: Math.max(3, note.durationBeats * ppb - 3),
                  height: Math.max(2, (note.velocity / 127) * 44),
                  background: selectedNotes.has(note.id) ? '#fff' : trackColor,
                }}
                onMouseDown={e => handleVelDrag(e, note)}
                title={`Velocity: ${note.velocity}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
