import React, { useRef, useCallback, useState, useEffect } from 'react'
import { useProjectStore, MidiNote, Clip } from '../store/projectStore'

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const WHITE_KEYS = [0,2,4,5,7,9,11]
const BLACK_KEYS = [1,3,6,8,10]

function noteName(pitch: number) {
  return NOTE_NAMES[pitch % 12] + Math.floor(pitch / 12 - 1)
}

function isBlackKey(pitch: number) {
  return BLACK_KEYS.includes(pitch % 12)
}

const CELL_H = 14      // px per semitone
const BASE_PPB = 80    // pixels per beat base

interface PianoRollProps {
  clipId: string | null
}

export function PianoRoll({ clipId }: PianoRollProps) {
  const { tracks, updateClip, bpm } = useProjectStore()
  const [ppb, setPpb] = useState(BASE_PPB)          // pixels per beat (zoom)
  const [quantize, setQuantize] = useState(0.25)     // beats
  const [tool, setTool] = useState<'draw' | 'select' | 'erase'>('draw')
  const [selectedNotes, setSelectedNotes] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Find the clip and track
  let clip: Clip | null = null
  let track = null
  for (const t of tracks) {
    const c = t.clips.find(c => c.id === clipId)
    if (c) { clip = c; track = t; break }
  }

  const notes: MidiNote[] = clip?.midiNotes ?? []

  const totalBeats = clip ? Math.max(clip.durationBeats, 16) : 16
  const totalPitches = 128
  const totalWidth = totalBeats * ppb
  const totalHeight = totalPitches * CELL_H

  function addNote(e: React.MouseEvent<HTMLDivElement>) {
    if (tool !== 'draw' || !clip) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0)
    const rawBeat = x / ppb
    const startBeat = Math.floor(rawBeat / quantize) * quantize
    const pitch = Math.max(0, Math.min(127, 127 - Math.floor(y / CELL_H)))

    const newNote: MidiNote = {
      id: `note-${Date.now()}`,
      pitch,
      velocity: 100,
      startBeat,
      durationBeats: quantize,
    }
    updateClip(clip.id, { midiNotes: [...notes, newNote] })
  }

  function eraseNote(noteId: string) {
    if (!clip) return
    updateClip(clip.id, { midiNotes: notes.filter(n => n.id !== noteId) })
  }

  function handleNoteMouseDown(e: React.MouseEvent, note: MidiNote) {
    e.stopPropagation()
    if (tool === 'erase') { eraseNote(note.id); return }
    if (tool === 'select') {
      setSelectedNotes(prev => e.shiftKey ? [...prev, note.id] : [note.id])
    }
    // Drag to move
    const startX = e.clientX
    const startBeat = note.startBeat
    const mv = (me: MouseEvent) => {
      const dx = me.clientX - startX
      const newStart = Math.max(0, startBeat + dx / ppb)
      const snapped = Math.floor(newStart / quantize) * quantize
      if (!clip) return
      updateClip(clip.id, {
        midiNotes: notes.map(n => n.id === note.id ? { ...n, startBeat: snapped } : n)
      })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  if (!clip) {
    return (
      <div className="piano-roll-empty">
        <p>Double-click a MIDI clip to open it in the Piano Roll</p>
      </div>
    )
  }

  return (
    <div className="piano-roll">
      {/* Toolbar */}
      <div className="pr-toolbar">
        <div className="pr-tools">
          <button className={`pr-tool ${tool === 'draw' ? 'active' : ''}`} onClick={() => setTool('draw')} title="Draw notes">✏️</button>
          <button className={`pr-tool ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} title="Select">↖</button>
          <button className={`pr-tool ${tool === 'erase' ? 'active' : ''}`} onClick={() => setTool('erase')} title="Erase">🗑️</button>
        </div>
        <div className="pr-quantize">
          <label className="param-label">Quantize</label>
          <select value={quantize} onChange={e => setQuantize(parseFloat(e.target.value))}>
            <option value={1}>1/4 note</option>
            <option value={0.5}>1/8 note</option>
            <option value={0.25}>1/16 note</option>
            <option value={0.125}>1/32 note</option>
            <option value={0.0833}>1/16 triplet</option>
          </select>
        </div>
        <div className="pr-zoom">
          <button onClick={() => setPpb(p => Math.max(20, p - 20))}>－</button>
          <span style={{ minWidth: 40, textAlign: 'center' }}>{ppb}px</span>
          <button onClick={() => setPpb(p => Math.min(200, p + 20))}>＋</button>
        </div>
        <div className="pr-clip-info">{clip.name} — {notes.length} notes</div>
      </div>

      {/* Main scroll area */}
      <div className="pr-scroll" ref={scrollRef} style={{ overflow: 'auto', flex: 1 }}>
        <div style={{ display: 'flex', width: totalWidth + 60, minWidth: '100%' }}>

          {/* Piano keyboard */}
          <div className="pr-keyboard" style={{ height: totalHeight, flexShrink: 0 }}>
            {Array.from({ length: totalPitches }, (_, i) => {
              const pitch = 127 - i
              const isBlack = isBlackKey(pitch)
              const isC = pitch % 12 === 0
              return (
                <div
                  key={pitch}
                  className={`pr-key ${isBlack ? 'black-key' : 'white-key'} ${isC ? 'c-key' : ''}`}
                  style={{ height: CELL_H }}
                  title={noteName(pitch)}
                  onClick={() => {
                    // Play note preview via AudioContext oscillator
                    const ctx = new AudioContext()
                    const osc = ctx.createOscillator()
                    const g = ctx.createGain()
                    osc.type = 'triangle'
                    osc.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12)
                    g.gain.setValueAtTime(0.3, ctx.currentTime)
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
                    osc.connect(g); g.connect(ctx.destination)
                    osc.start(); osc.stop(ctx.currentTime + 0.4)
                  }}
                >
                  {isC && <span className="key-label">{noteName(pitch)}</span>}
                </div>
              )
            })}
          </div>

          {/* Note grid */}
          <div
            className="pr-grid"
            style={{ width: totalWidth, height: totalHeight, position: 'relative' }}
            onClick={addNote}
          >
            {/* Grid lines */}
            {Array.from({ length: totalPitches }, (_, i) => {
              const pitch = 127 - i
              const isBlack = isBlackKey(pitch)
              const isC = pitch % 12 === 0
              return (
                <div
                  key={i}
                  className="pr-grid-row"
                  style={{
                    top: i * CELL_H,
                    height: CELL_H,
                    background: isBlack ? 'rgba(0,0,0,0.3)' : isC ? 'rgba(168,85,247,0.07)' : 'transparent',
                    borderBottom: isC ? '1px solid rgba(168,85,247,0.15)' : '1px solid rgba(255,255,255,0.03)',
                  }}
                />
              )
            })}

            {/* Beat columns */}
            {Array.from({ length: Math.ceil(totalBeats) }, (_, b) => (
              <div
                key={b}
                className="pr-beat-line"
                style={{ left: b * ppb, background: b % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)' }}
              />
            ))}

            {/* Notes */}
            {notes.map(note => (
              <div
                key={note.id}
                className={`midi-note ${selectedNotes.includes(note.id) ? 'selected' : ''}`}
                style={{
                  left: note.startBeat * ppb,
                  top: (127 - note.pitch) * CELL_H,
                  width: Math.max(8, note.durationBeats * ppb - 1),
                  height: CELL_H - 1,
                  opacity: note.velocity / 127 * 0.6 + 0.4,
                }}
                onMouseDown={e => handleNoteMouseDown(e, note)}
                title={`${noteName(note.pitch)} vel:${note.velocity}`}
              >
                <div
                  className="note-resize"
                  onMouseDown={e => {
                    e.stopPropagation()
                    const startX = e.clientX
                    const origDur = note.durationBeats
                    const mv = (me: MouseEvent) => {
                      const dBeats = (me.clientX - startX) / ppb
                      if (!clip) return
                      updateClip(clip.id, {
                        midiNotes: notes.map(n => n.id === note.id ? { ...n, durationBeats: Math.max(quantize, origDur + dBeats) } : n)
                      })
                    }
                    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
                    window.addEventListener('mousemove', mv)
                    window.addEventListener('mouseup', up)
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Velocity editor */}
        <div className="velocity-editor" style={{ width: totalWidth + 60 }}>
          <div className="vel-label">Velocity</div>
          <div className="vel-bars" style={{ width: totalWidth, marginLeft: 60 }}>
            {notes.map(note => (
              <div
                key={note.id}
                className="vel-bar"
                style={{ left: note.startBeat * ppb, height: (note.velocity / 127) * 48, background: track?.color ?? '#a855f7' }}
                title={`Velocity: ${note.velocity}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
