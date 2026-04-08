import React, { useEffect, useRef, useState, useCallback } from 'react'
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
  const [noteClipboard, setNoteClipboard] = useState<MidiNote[]>([])
  const [saveFlash, setSaveFlash] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Resolve clip
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

  // ── Auto-scroll to where most notes are on first open ──────────────────────
  useEffect(() => {
    if (!clip || !notes.length) return
    const avgPitch = notes.reduce((s, n) => s + n.pitch, 0) / notes.length
    const scrollY = (127 - avgPitch) * CELL_H - 120
    scrollRef.current?.scrollTo({ top: Math.max(0, scrollY) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId])

  // ── Piano Roll keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return
      if (!clip) return

      const meta = e.metaKey || e.ctrlKey

      // Delete / Backspace — remove selected notes
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNotes.size > 0) {
        e.preventDefault()
        updateClip(clip.id, { midiNotes: notes.filter(n => !selectedNotes.has(n.id)) })
        setSelectedNotes(new Set())
        return
      }

      // Escape — deselect all notes
      if (e.key === 'Escape') {
        setSelectedNotes(new Set())
        return
      }

      // Tool shortcuts (only inside piano roll, when no text input focused)
      if (!meta && !e.shiftKey) {
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setTool('draw'); return }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); setTool('select'); return }
        if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setTool('erase'); return }
      }

      if (!meta) return

      // Cmd+A — select all notes
      if (e.code === 'KeyA') {
        e.preventDefault()
        setSelectedNotes(new Set(notes.map(n => n.id)))
        return
      }

      // Cmd+C — copy selected notes
      if (e.code === 'KeyC') {
        e.preventDefault()
        const sel = notes.filter(n => selectedNotes.has(n.id))
        if (sel.length > 0) {
          // Normalise so the earliest note starts at beat 0
          const minBeat = Math.min(...sel.map(n => n.startBeat))
          setNoteClipboard(sel.map(n => ({ ...n, startBeat: n.startBeat - minBeat })))
        }
        return
      }

      // Cmd+X — cut selected notes
      if (e.code === 'KeyX') {
        e.preventDefault()
        const sel = notes.filter(n => selectedNotes.has(n.id))
        if (sel.length > 0) {
          const minBeat = Math.min(...sel.map(n => n.startBeat))
          setNoteClipboard(sel.map(n => ({ ...n, startBeat: n.startBeat - minBeat })))
          updateClip(clip.id, { midiNotes: notes.filter(n => !selectedNotes.has(n.id)) })
          setSelectedNotes(new Set())
        }
        return
      }

      // Cmd+V — paste notes at playhead beat
      if (e.code === 'KeyV') {
        e.preventDefault()
        if (noteClipboard.length === 0) return
        const st = useProjectStore.getState()
        const playheadBeat = st.currentTime * (st.bpm / 60)
        const pasted = noteClipboard.map(n => ({
          ...n,
          id: `n-paste-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          startBeat: n.startBeat + playheadBeat,
        }))
        updateClip(clip.id, { midiNotes: [...notes, ...pasted] })
        setSelectedNotes(new Set(pasted.map(n => n.id)))
        return
      }

      // Cmd+D — duplicate selected notes (place immediately after)
      if (e.code === 'KeyD') {
        e.preventDefault()
        const sel = notes.filter(n => selectedNotes.has(n.id))
        if (sel.length === 0) return
        const maxEnd = Math.max(...sel.map(n => n.startBeat + n.durationBeats))
        const minStart = Math.min(...sel.map(n => n.startBeat))
        const offset = maxEnd - minStart
        const duped = sel.map(n => ({
          ...n,
          id: `n-dup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          startBeat: n.startBeat + offset,
        }))
        updateClip(clip.id, { midiNotes: [...notes, ...duped] })
        setSelectedNotes(new Set(duped.map(n => n.id)))
        return
      }

      // Cmd+Q — quantize selected (or all) notes to current grid
      if (e.code === 'KeyQ') {
        e.preventDefault()
        const target = selectedNotes.size > 0 ? selectedNotes : new Set(notes.map(n => n.id))
        const quantized = notes.map(n => {
          if (!target.has(n.id)) return n
          return {
            ...n,
            startBeat: Math.round(n.startBeat / quantize) * quantize,
            durationBeats: Math.max(quantize, Math.round(n.durationBeats / quantize) * quantize),
          }
        })
        updateClip(clip.id, { midiNotes: quantized })
        return
      }

      // Cmd+Z — undo / Cmd+Shift+Z — redo  (delegate to project store)
      if (e.code === 'KeyZ') {
        e.preventDefault()
        const st = useProjectStore.getState()
        e.shiftKey ? st.redo() : st.undo()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNotes, clip, notes, noteClipboard, quantize, updateClip])

  // ── Note actions ────────────────────────────────────────────────────────────
  const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'draw' || !clip) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
    const y = e.clientY - rect.top  + (scrollRef.current?.scrollTop  ?? 0)
    const startBeat = Math.floor((x / ppb) / quantize) * quantize
    const pitch = Math.max(0, Math.min(127, 127 - Math.floor(y / CELL_H)))
    if (notes.some(n => n.pitch === pitch && startBeat >= n.startBeat && startBeat < n.startBeat + n.durationBeats)) return
    const newNote: MidiNote = { id: `n-${Date.now()}`, pitch, velocity: 100, startBeat, durationBeats: quantize }
    onPlayNote?.(pitch)
    updateClip(clip.id, { midiNotes: [...notes, newNote] })
  }, [tool, clip, ppb, quantize, notes, onPlayNote, updateClip])

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
      else if (!next.has(note.id)) { next.clear(); next.add(note.id) }
      setSelectedNotes(next)
    }
    // Drag-move all selected notes (or just this one)
    const startX = e.clientX
    const startY = e.clientY
    const notesToMove = (selectedNotes.has(note.id) && selectedNotes.size > 1)
      ? notes.filter(n => selectedNotes.has(n.id))
      : [note]
    const origBeats = new Map(notesToMove.map(n => [n.id, n.startBeat]))
    const origPitches = new Map(notesToMove.map(n => [n.id, n.pitch]))
    let moved = false

    const mv = (me: MouseEvent) => {
      if (!clip) return
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true
      if (!moved) return
      const dBeats = dx / ppb
      const dPitch  = -Math.round(dy / CELL_H)
      updateClip(clip.id, {
        midiNotes: notes.map(n => {
          if (!origBeats.has(n.id)) return n
          return {
            ...n,
            startBeat: Math.max(0, Math.floor((origBeats.get(n.id)! + dBeats) / quantize) * quantize),
            pitch: Math.max(0, Math.min(127, origPitches.get(n.id)! + dPitch)),
          }
        }),
      })
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
          <button className={`pr-tool ${tool === 'draw' ? 'active' : ''}`} onClick={() => setTool('draw')} title="Draw note (N)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="2" y1="10" x2="9" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <polygon points="9,1 11,3 10,4 8,2" fill="currentColor"/>
              <line x1="1" y1="11" x2="3" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <button className={`pr-tool ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} title="Select (S)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <polygon points="1,1 1,9 4,7 5.5,11 7,10.5 5.5,6.5 9,6.5" fill="currentColor"/>
            </svg>
          </button>
          <button className={`pr-tool ${tool === 'erase' ? 'active' : ''}`} onClick={() => setTool('erase')} title="Erase (E)">
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

        {/* Quantize action button */}
        <button
          className="tbt pr-quantize-btn"
          title="Quantize selected notes to grid (⌘Q)"
          onClick={() => {
            if (!clip) return
            const target = selectedNotes.size > 0 ? selectedNotes : new Set(notes.map(n => n.id))
            const quantized = notes.map(n => {
              if (!target.has(n.id)) return n
              return {
                ...n,
                startBeat: Math.round(n.startBeat / quantize) * quantize,
                durationBeats: Math.max(quantize, Math.round(n.durationBeats / quantize) * quantize),
              }
            })
            updateClip(clip.id, { midiNotes: quantized })
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <rect x="1" y="4" width="2" height="6" rx="1" fill="currentColor" opacity="0.5"/>
            <rect x="4" y="2" width="2" height="8" rx="1" fill="currentColor"/>
            <rect x="7" y="5" width="2" height="5" rx="1" fill="currentColor" opacity="0.7"/>
            <line x1="1" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1" opacity="0.7" strokeDasharray="1.5 1"/>
          </svg>
          <span style={{ marginLeft: 3, fontSize: 9 }}>Q</span>
        </button>

        <div className="pr-zoom">
          <button className="tbt" onClick={() => setPpb(p => Math.max(20, p - 20))} title="Zoom out">−</button>
          <span className="param-label" style={{ minWidth:36, textAlign:'center' }}>{ppb}px/b</span>
          <button className="tbt" onClick={() => setPpb(p => Math.min(240, p + 20))} title="Zoom in">+</button>
        </div>

        <div className="pr-clip-info">
          {clip.name} — {notes.length} notes
          {selectedNotes.size > 0 && <span className="pr-sel-count"> ({selectedNotes.size} selected)</span>}
        </div>

        {/* Keyboard shortcut hints */}
        <div className="pr-shortcut-hints">
          <span className="pr-hint">⌘A select all</span>
          <span className="pr-hint">⌘C copy</span>
          <span className="pr-hint">⌘V paste</span>
          <span className="pr-hint">⌘Q quantize</span>
          <span className="pr-hint">Del delete</span>
        </div>

        <button
          className="tbt btab-close"
          style={{ marginLeft:'auto' }}
          onClick={() => useProjectStore.getState().setShowPianoRoll(false)}
          title="Close Piano Roll (Escape)"
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
            onMouseDown={e => {
              // Click on empty grid space in select mode → deselect all
              if (tool === 'select' && !(e.target as HTMLElement).closest('.midi-note')) {
                setSelectedNotes(new Set())
              }
            }}
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
              if (isBar || isBeat) return null
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
                title={`${noteName(note.pitch)} vel:${note.velocity}`}
              >
                {/* Note name label for wide notes */}
                {note.durationBeats * ppb > 28 && (
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,.8)', paddingLeft: 2, userSelect:'none', pointerEvents:'none' }}>
                    {noteName(note.pitch)}
                  </span>
                )}
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
