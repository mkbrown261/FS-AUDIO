/**
 * FS-AUDIO Score View — Notation Editor
 * Renders MIDI notes as treble + bass clef notation on a grand staff.
 * Supports note display, basic editing, and PDF-like print view.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useProjectStore, MidiNote, Clip } from '../store/projectStore'

// ── Music theory helpers ──────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
const DIATONIC  = [0,2,4,5,7,9,11]  // C major diatonic intervals

function midiToName(midi: number): string {
  return NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1)
}

// Staff position (0 = middle C ledger line = B4 first space above bass)
// Returns steps from top of treble staff (C4 = step 6 counting from top)
function staffPosition(midi: number): { staff: 'treble'|'bass'; line: number; accidental: '#'|'b'|'' } {
  const octave = Math.floor(midi / 12) - 1
  const pitchClass = midi % 12
  // Find diatonic position
  let diatonicStep = -1
  let accidental: '#'|'b'|'' = ''
  for (let i = 0; i < 7; i++) {
    if (DIATONIC[i] === pitchClass) { diatonicStep = i; break }
    if (DIATONIC[i] === pitchClass - 1 && i < 6) {
      diatonicStep = i + 1  // sharp
      accidental = '#'
      break
    }
    if (DIATONIC[i] === pitchClass + 1) {
      diatonicStep = i  // flat
      accidental = 'b'
      break
    }
  }
  if (diatonicStep < 0) { diatonicStep = 0; accidental = '#' }
  // Line from top of treble staff: E5=0, D5=1, C5=2 (middle of staff), B4=3...
  // Treble staff top line = E5 (midi 76), each step = 1 line/space = 3.5px
  const trebleTopMidi = 76  // E5
  // Convert midi to diatonic steps from E5
  const octSteps = (octave - 4) * 7 + diatonicStep
  const trebleTopSteps = 4 + 2  // E5 is step 4 in octave 4 (C4=0,D4=1,E4=2,F4=3,G4=4,A4=5,B4=6)
  const stepsFromTop = (4 * 7 + 4) - (octave * 7 + diatonicStep)

  const staff: 'treble'|'bass' = midi >= 60 ? 'treble' : 'bass'
  const line = stepsFromTop  // higher = more negative on canvas (above)
  return { staff, line, accidental }
}

// ── Score renderer ─────────────────────────────────────────────────────────────
const STAFF_LINE_GAP = 8   // px between staff lines
const MEASURE_W = 120       // px per measure
const STAFF_TOP = 30        // treble staff top
const BASS_TOP = 130        // bass staff top

function drawStaff(ctx: CanvasRenderingContext2D, x: number, w: number, staffTop: number) {
  ctx.strokeStyle = '#555'
  ctx.lineWidth = 1
  for (let i = 0; i < 5; i++) {
    const y = staffTop + i * STAFF_LINE_GAP * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y)
    ctx.stroke()
  }
}

function drawClef(ctx: CanvasRenderingContext2D, x: number, staffTop: number, type: 'treble'|'bass') {
  ctx.fillStyle = '#888'
  ctx.font = '36px serif'
  ctx.textBaseline = 'alphabetic'
  if (type === 'treble') {
    ctx.fillText('𝄞', x, staffTop + STAFF_LINE_GAP * 7)
  } else {
    ctx.fillText('𝄢', x, staffTop + STAFF_LINE_GAP * 4)
  }
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  x: number, staffTop: number,
  lineStep: number,   // steps from top line (0 = top line, 4 = bottom line of 5-line staff)
  isHalf: boolean,
  isDotted: boolean,
  accidental: string,
  selected: boolean
) {
  const noteRadius = STAFF_LINE_GAP * 0.85
  const y = staffTop + lineStep * STAFF_LINE_GAP

  ctx.fillStyle = selected ? '#22d3ee' : (isHalf ? 'none' : '#fff')
  ctx.strokeStyle = selected ? '#22d3ee' : '#fff'
  ctx.lineWidth = isHalf ? 1.5 : 1

  // Ledger lines
  ctx.strokeStyle = '#555'
  if (lineStep < 0) {
    for (let l = 0; l >= lineStep; l--) {
      if (l % 2 === 0) {
        const ly = staffTop + l * STAFF_LINE_GAP
        ctx.beginPath(); ctx.moveTo(x-10, ly); ctx.lineTo(x+10, ly); ctx.stroke()
      }
    }
  }
  if (lineStep > 8) {
    for (let l = 10; l <= lineStep; l++) {
      if (l % 2 === 0) {
        const ly = staffTop + l * STAFF_LINE_GAP
        ctx.beginPath(); ctx.moveTo(x-10, ly); ctx.lineTo(x+10, ly); ctx.stroke()
      }
    }
  }

  ctx.strokeStyle = selected ? '#22d3ee' : '#fff'
  // Notehead
  ctx.beginPath()
  ctx.ellipse(x, y, noteRadius * 1.1, noteRadius * 0.8, -0.2, 0, Math.PI * 2)
  if (isHalf) { ctx.stroke() }
  else { ctx.fill(); ctx.stroke() }

  // Stem
  const stemDir = lineStep < 4 ? 1 : -1  // down if above middle, up if below
  ctx.strokeStyle = selected ? '#22d3ee' : '#fff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + noteRadius * 1.0 * stemDir, y)
  ctx.lineTo(x + noteRadius * 1.0 * stemDir, y + stemDir * STAFF_LINE_GAP * 3.5)
  ctx.stroke()

  // Accidental
  if (accidental) {
    ctx.fillStyle = selected ? '#22d3ee' : '#aaa'
    ctx.font = `${STAFF_LINE_GAP * 1.8}px serif`
    ctx.textBaseline = 'middle'
    ctx.fillText(accidental === '#' ? '♯' : '♭', x - 14, y)
  }

  // Dot
  if (isDotted) {
    ctx.fillStyle = selected ? '#22d3ee' : '#fff'
    ctx.beginPath()
    ctx.arc(x + noteRadius * 1.5, y - STAFF_LINE_GAP * 0.3, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

interface Props {
  isOpen: boolean
  onClose: () => void
  clipId: string | null
}

export default function ScoreView({ isOpen, onClose, clipId }: Props) {
  const store = useProjectStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)

  // Find clip
  let clip: Clip | null = null
  if (clipId) {
    for (const track of store.tracks) {
      const f = track.clips.find(c => c.id === clipId)
      if (f) { clip = f; break }
    }
  }

  const notes = clip?.midiNotes || []
  const timeSignNum = store.timeSignature?.[0] || 4
  const bpm = store.bpm

  // Group notes into measures
  const beatsPerMeasure = timeSignNum
  const totalMeasures = Math.max(4, Math.ceil((clip?.durationBeats || 8) / beatsPerMeasure))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const totalW = Math.max(800, (totalMeasures + 1) * MEASURE_W * zoom + 80)
    canvas.width = totalW
    canvas.height = 220
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Title
    ctx.fillStyle = '#888'
    ctx.font = '11px system-ui'
    ctx.textBaseline = 'top'
    ctx.fillText(clip?.name || 'Score', 10, 6)

    // Time signature & BPM
    ctx.fillStyle = '#666'
    ctx.fillText(`${bpm} BPM  |  ${timeSignNum}/4`, 10, 20)

    const staffWidth = totalW - 60
    const startX = 60

    // Draw grand staff
    drawStaff(ctx, startX, staffWidth, STAFF_TOP)
    drawStaff(ctx, startX, staffWidth, BASS_TOP)

    // Brace
    ctx.fillStyle = '#666'
    ctx.fillText('{', 42, STAFF_TOP + 14)

    // Bar lines
    for (let m = 0; m <= totalMeasures; m++) {
      const x = startX + m * MEASURE_W * zoom
      ctx.strokeStyle = m === 0 || m === totalMeasures ? '#888' : '#333'
      ctx.lineWidth = m === 0 || m === totalMeasures ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(x, STAFF_TOP)
      ctx.lineTo(x, STAFF_TOP + 4 * STAFF_LINE_GAP * 2)
      ctx.moveTo(x, BASS_TOP)
      ctx.lineTo(x, BASS_TOP + 4 * STAFF_LINE_GAP * 2)
      ctx.stroke()

      // Measure numbers
      if (m < totalMeasures) {
        ctx.fillStyle = '#444'
        ctx.font = '9px system-ui'
        ctx.textBaseline = 'bottom'
        ctx.fillText(String(m + 1), x + 4, STAFF_TOP - 2)
      }
    }

    // Clefs
    drawClef(ctx, startX + 4, STAFF_TOP, 'treble')
    drawClef(ctx, startX + 4, BASS_TOP, 'bass')

    // Notes
    notes.forEach(note => {
      const { staff, line, accidental } = staffPosition(note.pitch)
      const staffTop = staff === 'treble' ? STAFF_TOP : BASS_TOP

      // X position from beat
      const measureIdx = Math.floor(note.startBeat / beatsPerMeasure)
      const beatInMeasure = note.startBeat % beatsPerMeasure
      const noteX = startX + (measureIdx + beatInMeasure / beatsPerMeasure) * MEASURE_W * zoom + 24

      const isHalf = note.durationBeats >= 2
      const isDotted = Math.abs((note.durationBeats % 1) - 0.5) < 0.05
      const isSelected = selectedNotes.has(note.id)

      drawNote(ctx, noteX, staffTop, line, isHalf, isDotted, accidental, isSelected)
    })

    // Final double bar
    ctx.strokeStyle = '#888'
    ctx.lineWidth = 1
    const lastX = startX + totalMeasures * MEASURE_W * zoom
    ctx.beginPath()
    ctx.moveTo(lastX - 3, STAFF_TOP)
    ctx.lineTo(lastX - 3, BASS_TOP + 4 * STAFF_LINE_GAP * 2)
    ctx.stroke()
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(lastX + 1, STAFF_TOP)
    ctx.lineTo(lastX + 1, BASS_TOP + 4 * STAFF_LINE_GAP * 2)
    ctx.stroke()

  }, [notes, totalMeasures, zoom, selectedNotes, clip, bpm, timeSignNum, beatsPerMeasure])

  // Note click selection
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width)
    const my = (e.clientY - rect.top) * (canvas.height / rect.height)

    const startX = 60
    const beatsPerMeasure = timeSignNum

    // Find closest note
    let closest: MidiNote | null = null
    let closestDist = Infinity

    notes.forEach(note => {
      const { staff, line } = staffPosition(note.pitch)
      const staffTop = staff === 'treble' ? STAFF_TOP : BASS_TOP
      const measureIdx = Math.floor(note.startBeat / beatsPerMeasure)
      const beatInMeasure = note.startBeat % beatsPerMeasure
      const noteX = startX + (measureIdx + beatInMeasure / beatsPerMeasure) * MEASURE_W * zoom + 24
      const noteY = staffTop + line * STAFF_LINE_GAP
      const dist = Math.sqrt((mx - noteX)**2 + (my - noteY)**2)
      if (dist < closestDist) { closestDist = dist; closest = note }
    })

    if (closest && closestDist < 14) {
      setSelectedNotes(prev => {
        const next = new Set(prev)
        if (next.has((closest as MidiNote).id)) next.delete((closest as MidiNote).id)
        else next.add((closest as MidiNote).id)
        return next
      })
    } else {
      setSelectedNotes(new Set())
    }
  }, [notes, zoom, timeSignNum])

  if (!isOpen) return null

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:2400,
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => { if (e.target===e.currentTarget) onClose() }}>
      <div style={{
        background:'#0d0d1a', border:'1px solid #2a2a3e', borderRadius:14,
        width:'min(90vw, 900px)', maxHeight:'80vh', display:'flex', flexDirection:'column',
        fontFamily:'system-ui,sans-serif', color:'#fff',
        boxShadow:'0 24px 80px rgba(0,0,0,0.9)',
      }}>
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 18px', borderBottom:'1px solid #1e1e2e', flexShrink:0,
          background:'linear-gradient(135deg,#001a00,#0d0d1a)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>🎼</span>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>Score View</div>
              <div style={{ color:'#888', fontSize:10 }}>
                {clip ? `${clip.name} — ${notes.length} notes` : 'No clip selected'}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ color:'#888', fontSize:10 }}>Zoom:</span>
            <input type="range" min={0.5} max={3} step={0.1} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ width:80, accentColor:'#22c55e' }} />
            <span style={{ color:'#22c55e', fontSize:11, width:28 }}>{zoom.toFixed(1)}×</span>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:18, marginLeft:8 }}>✕</button>
          </div>
        </div>

        {/* Score canvas */}
        <div style={{ flex:1, overflowX:'auto', overflowY:'auto', background:'#0d0d1a', padding:'10px 0' }}>
          {!clip ? (
            <div style={{ color:'#555', textAlign:'center', padding:60 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🎼</div>
              <div>Select a MIDI clip in the Timeline first.</div>
            </div>
          ) : notes.length === 0 ? (
            <div style={{ color:'#555', textAlign:'center', padding:60 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📭</div>
              <div>This clip has no MIDI notes.</div>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              style={{
                display:'block', cursor:'default', minWidth:'100%',
                imageRendering:'crisp-edges',
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding:'8px 18px', borderTop:'1px solid #1e1e2e', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'#0a0a14',
        }}>
          <div style={{ color:'#555', fontSize:10 }}>
            Click notes to select • {selectedNotes.size} selected
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => {
              // Print
              const canvas = canvasRef.current
              if (!canvas) return
              const win = window.open('')
              if (!win) return
              win.document.write(`<img src="${canvas.toDataURL()}" style="max-width:100%;filter:invert(1)"><script>window.print()</script>`)
              win.document.close()
            }} style={{
              padding:'5px 12px', borderRadius:6, border:'1px solid #333',
              background:'#111', color:'#888', cursor:'pointer', fontSize:11,
            }}>🖨 Print</button>
            {selectedNotes.size > 0 && (
              <button onClick={() => {
                if (!clip) return
                const newNotes = notes.filter(n => !selectedNotes.has(n.id))
                store.updateClip(clip.id, { midiNotes: newNotes })
                setSelectedNotes(new Set())
              }} style={{
                padding:'5px 12px', borderRadius:6, border:'1px solid #ef444433',
                background:'#1a0000', color:'#ef4444', cursor:'pointer', fontSize:11,
              }}>Delete Selected</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
