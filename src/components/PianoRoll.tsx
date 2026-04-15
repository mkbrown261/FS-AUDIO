import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useProjectStore, MidiNote, Clip, CCPoint as StoreCCPoint } from '../store/projectStore'
import { detectChordFromSelection, detectChordAtBeat } from '../utils/chordDetect'

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const BLACK_KEY_PITCHES = new Set([1,3,6,8,10])

function noteName(pitch: number) {
  return NOTE_NAMES[pitch % 12] + Math.floor(pitch / 12 - 1)
}
function isBlack(pitch: number) { return BLACK_KEY_PITCHES.has(pitch % 12) }

const CELL_H = 14
const BASE_PPB = 80

// ── Scale definitions ────────────────────────────────────────────────────────
const SCALES: Record<string, number[]> = {
  'Major':           [0,2,4,5,7,9,11],
  'Natural Minor':   [0,2,3,5,7,8,10],
  'Harmonic Minor':  [0,2,3,5,7,8,11],
  'Melodic Minor':   [0,2,3,5,7,9,11],
  'Dorian':          [0,2,3,5,7,9,10],
  'Phrygian':        [0,1,3,5,7,8,10],
  'Lydian':          [0,2,4,6,7,9,11],
  'Mixolydian':      [0,2,4,5,7,9,10],
  'Locrian':         [0,1,3,5,6,8,10],
  'Pentatonic Major':[0,2,4,7,9],
  'Pentatonic Minor':[0,3,5,7,10],
  'Blues':           [0,3,5,6,7,10],
  'Chromatic':       [0,1,2,3,4,5,6,7,8,9,10,11],
  'Whole Tone':      [0,2,4,6,8,10],
  'Diminished':      [0,2,3,5,6,8,9,11],
}

const KEY_ROOTS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function isInScale(pitch: number, rootIdx: number, intervals: number[]): boolean {
  return intervals.includes((pitch - rootIdx + 120) % 12)
}

function snapToScale(pitch: number, rootIdx: number, intervals: number[]): number {
  if (isInScale(pitch, rootIdx, intervals)) return pitch
  // Try up and down by 1 semitone at a time
  for (let d = 1; d <= 6; d++) {
    if (pitch + d <= 127 && isInScale(pitch + d, rootIdx, intervals)) return pitch + d
    if (pitch - d >= 0   && isInScale(pitch - d, rootIdx, intervals)) return pitch - d
  }
  return pitch
}

// ── Drum pad map (GM standard) ───────────────────────────────────────────────
const GM_DRUMS: Record<number, string> = {
  35:'Bass Drum 2', 36:'Bass Drum 1', 37:'Side Stick', 38:'Snare 1',
  39:'Clap', 40:'Snare 2', 41:'Lo Floor Tom', 42:'Hi-Hat Closed',
  43:'Hi Floor Tom', 44:'Hi-Hat Pedal', 45:'Lo Tom', 46:'Hi-Hat Open',
  47:'Lo-Mid Tom', 48:'Hi-Mid Tom', 49:'Crash 1', 50:'Hi Tom',
  51:'Ride 1', 52:'China', 53:'Ride Bell', 54:'Tambourine',
  55:'Splash', 56:'Cowbell', 57:'Crash 2', 58:'Vibraslap',
  59:'Ride 2', 60:'Hi Bongo', 61:'Lo Bongo', 62:'Mute Hi Conga',
  63:'Open Hi Conga', 64:'Lo Conga', 65:'Hi Timbale', 66:'Lo Timbale',
}

// ── CC lane definitions ──────────────────────────────────────────────────────
const CC_PRESETS: { label: string; cc: number; color: string }[] = [
  { label: 'Mod Wheel',   cc: 1,   color: '#06b6d4' },
  { label: 'Volume',      cc: 7,   color: '#10b981' },
  { label: 'Pan',         cc: 10,  color: '#a855f7' },
  { label: 'Expression',  cc: 11,  color: '#f59e0b' },
  { label: 'Sustain',     cc: 64,  color: '#ef4444' },
  { label: 'Pitch Bend',  cc: 128, color: '#ec4899' }, // 128 = pitch bend (special)
]

interface CCPoint { beat: number; value: number }

interface PianoRollProps {
  clipId: string | null
  onPlayNote?: (pitch: number) => void
}

// ── Chord Suggestor data ──────────────────────────────────────────────────────
// Each entry: { name, label, intervals (semitones relative to root), octave offset }
interface ChordDef { name: string; intervals: number[]; octave?: number }
const CHORD_SUGGESTIONS: { category: string; color: string; chords: ChordDef[] }[] = [
  { category: 'Triads', color: '#a855f7', chords: [
    { name: 'Maj',   intervals: [0,4,7] },
    { name: 'Min',   intervals: [0,3,7] },
    { name: 'Aug',   intervals: [0,4,8] },
    { name: 'Dim',   intervals: [0,3,6] },
    { name: 'Sus2',  intervals: [0,2,7] },
    { name: 'Sus4',  intervals: [0,5,7] },
  ]},
  { category: '7ths', color: '#06b6d4', chords: [
    { name: 'Maj7',  intervals: [0,4,7,11] },
    { name: 'Min7',  intervals: [0,3,7,10] },
    { name: 'Dom7',  intervals: [0,4,7,10] },
    { name: 'Dim7',  intervals: [0,3,6,9] },
    { name: 'm7♭5',  intervals: [0,3,6,10] },
    { name: 'MinMaj7',intervals:[0,3,7,11] },
  ]},
  { category: '9ths', color: '#10b981', chords: [
    { name: 'Maj9',  intervals: [0,4,7,11,14] },
    { name: 'Min9',  intervals: [0,3,7,10,14] },
    { name: 'Dom9',  intervals: [0,4,7,10,14] },
    { name: 'Add9',  intervals: [0,4,7,14] },
    { name: 'mAdd9', intervals: [0,3,7,14] },
    { name: '6/9',   intervals: [0,4,7,9,14] },
  ]},
  { category: 'Spread', color: '#f59e0b', chords: [
    { name: 'Pow5',  intervals: [0,7,12] },
    { name: 'Oct',   intervals: [0,12] },
    { name: 'Shell7',intervals: [0,7,10] },
    { name: 'Shell9',intervals: [0,7,14] },
    { name: '1-3-5-9',intervals:[0,4,7,14] },
    { name: '1-5-9', intervals: [0,7,14] },
  ]},
]

export function PianoRoll({ clipId, onPlayNote }: PianoRollProps) {
  const { tracks, updateClip, updateClipCCLane } = useProjectStore()
  const [ppb, setPpb] = useState(BASE_PPB)
  const [quantize, setQuantize] = useState(0.25)
  const [tool, setTool] = useState<'draw' | 'select' | 'erase'>('draw')
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set())
  const [noteClipboard, setNoteClipboard] = useState<MidiNote[]>([])
  const [saveFlash, setSaveFlash] = useState(false)
  const [cursorBeat, setCursorBeat] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Chord Suggestor state ──────────────────────────────────────────────────
  const [showChords, setShowChords] = useState(false)
  const [chordRoot, setChordRoot] = useState(60)       // MIDI pitch of root (default C4)
  const [chordInsertBeat, setChordInsertBeat] = useState(0)
  const [chordVelocity, setChordVelocity] = useState(80)
  const [chordDuration, setChordDuration] = useState(1) // beats
  const [chordStagger, setChordStagger] = useState(0)   // seconds stagger between notes (0=block)

  // ── Scale Lock state ───────────────────────────────────────────────────────
  const [scaleLock, setScaleLock] = useState(false)
  const [scaleRoot, setScaleRoot] = useState(0)       // 0=C, 1=C#…
  const [scaleName, setScaleName] = useState('Major')
  const scaleIntervals = SCALES[scaleName] ?? SCALES['Major']

  // ── CC Lane state ──────────────────────────────────────────────────────────
  const [showCCLanes, setShowCCLanes] = useState(false)
  const [activeCCIdx, setActiveCCIdx] = useState(0)
  // CC data stored per clip in a Map keyed by cc number
  const [ccData, setCCData] = useState<Map<number, CCPoint[]>>(new Map())

  // ── Drum Editor mode ───────────────────────────────────────────────────────
  const [drumMode, setDrumMode] = useState(false)

  // ── Humanize dialog ────────────────────────────────────────────────────────
  const [showHumanize, setShowHumanize] = useState(false)
  const [humanizeVel, setHumanizeVel] = useState(15)
  const [humanizeTiming, setHumanizeTiming] = useState(0.02) // beats

  // ── Groove Quantize ────────────────────────────────────────────────────────
  const [showGroove, setShowGroove] = useState(false)
  const [quantizeStrength, setQuantizeStrength] = useState(100) // 0-100 %
  const [swingAmount, setSwingAmount] = useState(0)             // 0-100 % swing

  // ── MIDI Transform ─────────────────────────────────────────────────────────
  const [showTransform, setShowTransform] = useState(false)
  const [txTranspose, setTxTranspose] = useState(0)            // semitones
  const [txVelScale, setTxVelScale] = useState(100)            // %
  const [txVelOffset, setTxVelOffset] = useState(0)            // absolute offset
  const [txTimeStretch, setTxTimeStretch] = useState(100)      // %

  // Resolve clip
  let clip: Clip | null = null
  let trackColor = '#a855f7'
  let isDrumTrack = false
  for (const t of tracks) {
    const c = t.clips.find(c => c.id === clipId)
    if (c) {
      clip = c
      trackColor = t.color
      isDrumTrack = t.plugins.some(p => p.type === 'fs_sampler' || p.type === 'fs_sfz')
      break
    }
  }

  const notes: MidiNote[] = clip?.midiNotes ?? []
  const totalBeats = Math.max(clip?.durationBeats ?? 16, 16)

  // ── Chord detection ──────────────────────────────────────────────────────
  const chordName = useMemo(() => {
    if (selectedNotes.size >= 2) return detectChordFromSelection(notes, selectedNotes)
    if (cursorBeat !== null && notes.length >= 2) return detectChordAtBeat(notes, cursorBeat)
    return ''
  }, [notes, selectedNotes, cursorBeat])

  const totalWidth = totalBeats * ppb
  const totalHeight = 128 * CELL_H

  // ── Drum mode: rows to show (GM range 35–66) ──────────────────────────────
  const drumRows = useMemo(() => {
    const rows: number[] = []
    for (let p = 66; p >= 35; p--) rows.push(p)
    return rows
  }, [])

  // ── Auto-scroll on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (!clip) return
    if (drumMode) {
      // Scroll to drum range
      scrollRef.current?.scrollTo({ top: (127 - 66) * CELL_H })
      return
    }
    if (!notes.length) return
    const avgPitch = notes.reduce((s, n) => s + n.pitch, 0) / notes.length
    scrollRef.current?.scrollTo({ top: Math.max(0, (127 - avgPitch) * CELL_H - 120) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, drumMode])

  // ── Hydrate CC lanes and scale lock from persisted clip data ─────────────
  useEffect(() => {
    if (!clip) return
    // Restore CC lanes
    if (clip.ccLanes && clip.ccLanes.length > 0) {
      const map = new Map<number, CCPoint[]>()
      for (const lane of clip.ccLanes) {
        map.set(lane.cc, lane.points as CCPoint[])
      }
      setCCData(map)
    } else {
      setCCData(new Map())
    }
    // Restore scale lock
    if (clip.scaleLockRoot !== undefined) setScaleRoot(clip.scaleLockRoot)
    if (clip.scaleLockName !== undefined) setScaleName(clip.scaleLockName)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId])

  // ── Scale-lock pitch resolver ─────────────────────────────────────────────
  const resolvedPitch = useCallback((raw: number) => {
    if (!scaleLock) return raw
    return snapToScale(raw, scaleRoot, scaleIntervals)
  }, [scaleLock, scaleRoot, scaleIntervals])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return
      if (!clip) return
      const meta = e.metaKey || e.ctrlKey

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNotes.size > 0) {
        e.preventDefault()
        updateClip(clip.id, { midiNotes: notes.filter(n => !selectedNotes.has(n.id)) })
        setSelectedNotes(new Set()); return
      }
      if (e.key === 'Escape') { setSelectedNotes(new Set()); setShowHumanize(false); return }

      if (!meta && !e.shiftKey) {
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setTool('draw'); return }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); setTool('select'); return }
        if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setTool('erase'); return }
      }
      if (!meta) return

      if (e.code === 'KeyA') { e.preventDefault(); setSelectedNotes(new Set(notes.map(n => n.id))); return }

      if (e.code === 'KeyC') {
        e.preventDefault()
        const sel = notes.filter(n => selectedNotes.has(n.id))
        if (sel.length > 0) {
          const minBeat = Math.min(...sel.map(n => n.startBeat))
          setNoteClipboard(sel.map(n => ({ ...n, startBeat: n.startBeat - minBeat })))
        }; return
      }

      if (e.code === 'KeyX') {
        e.preventDefault()
        const sel = notes.filter(n => selectedNotes.has(n.id))
        if (sel.length > 0) {
          const minBeat = Math.min(...sel.map(n => n.startBeat))
          setNoteClipboard(sel.map(n => ({ ...n, startBeat: n.startBeat - minBeat })))
          updateClip(clip.id, { midiNotes: notes.filter(n => !selectedNotes.has(n.id)) })
          setSelectedNotes(new Set())
        }; return
      }

      if (e.code === 'KeyV') {
        e.preventDefault()
        if (noteClipboard.length === 0) return
        const st = useProjectStore.getState()
        const playheadBeat = st.currentTime * (st.bpm / 60)
        const pasted = noteClipboard.map(n => ({
          ...n, id: `n-paste-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          startBeat: n.startBeat + playheadBeat,
        }))
        updateClip(clip.id, { midiNotes: [...notes, ...pasted] })
        setSelectedNotes(new Set(pasted.map(n => n.id))); return
      }

      if (e.code === 'KeyD') {
        e.preventDefault()
        const sel = notes.filter(n => selectedNotes.has(n.id))
        if (sel.length === 0) return
        const maxEnd = Math.max(...sel.map(n => n.startBeat + n.durationBeats))
        const minStart = Math.min(...sel.map(n => n.startBeat))
        const duped = sel.map(n => ({
          ...n, id: `n-dup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          startBeat: n.startBeat + (maxEnd - minStart),
        }))
        updateClip(clip.id, { midiNotes: [...notes, ...duped] })
        setSelectedNotes(new Set(duped.map(n => n.id))); return
      }

      if (e.code === 'KeyQ') {
        e.preventDefault()
        const target = selectedNotes.size > 0 ? selectedNotes : new Set(notes.map(n => n.id))
        updateClip(clip.id, { midiNotes: notes.map(n => !target.has(n.id) ? n : {
          ...n,
          startBeat: Math.round(n.startBeat / quantize) * quantize,
          durationBeats: Math.max(quantize, Math.round(n.durationBeats / quantize) * quantize),
        }) }); return
      }

      if (e.code === 'KeyZ') {
        e.preventDefault()
        const st = useProjectStore.getState()
        e.shiftKey ? st.redo() : st.undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNotes, clip, notes, noteClipboard, quantize, updateClip])

  // ── Humanize action ───────────────────────────────────────────────────────
  const doHumanize = useCallback(() => {
    if (!clip) return
    const target = selectedNotes.size > 0 ? selectedNotes : new Set(notes.map(n => n.id))
    updateClip(clip.id, { midiNotes: notes.map(n => {
      if (!target.has(n.id)) return n
      const velDelta = (Math.random() * 2 - 1) * humanizeVel
      const timeDelta = (Math.random() * 2 - 1) * humanizeTiming
      return {
        ...n,
        velocity: Math.max(1, Math.min(127, Math.round(n.velocity + velDelta))),
        startBeat: Math.max(0, n.startBeat + timeDelta),
      }
    }) })
    setShowHumanize(false)
  }, [clip, notes, selectedNotes, humanizeVel, humanizeTiming, updateClip])

  // ── Groove / Strength Quantize ────────────────────────────────────────────
  const doGrooveQuantize = useCallback(() => {
    if (!clip) return
    const strength = quantizeStrength / 100   // 0-1
    const swing = swingAmount / 100           // 0-1 (0 = no swing, 1 = full swing = 2/3 offset)
    const target = selectedNotes.size > 0 ? selectedNotes : new Set(notes.map(n => n.id))
    updateClip(clip.id, { midiNotes: notes.map(n => {
      if (!target.has(n.id)) return n
      // Step index in grid
      const stepIdx = Math.round(n.startBeat / quantize)
      // Apply swing: every odd step is pushed forward by swing * quantize * 0.5
      const swingOffset = (stepIdx % 2 === 1) ? swing * quantize * 0.5 : 0
      const gridBeat = stepIdx * quantize + swingOffset
      // Interpolate between current position and quantized grid (strength)
      const newStart = n.startBeat + (gridBeat - n.startBeat) * strength
      return { ...n, startBeat: Math.max(0, newStart) }
    }) })
    setShowGroove(false)
  }, [clip, notes, selectedNotes, quantize, quantizeStrength, swingAmount, updateClip])

  // ── MIDI Transform ────────────────────────────────────────────────────────
  const doMidiTransform = useCallback((action: 'transpose' | 'vel-scale' | 'legato' | 'reverse' | 'randomize-vel') => {
    if (!clip) return
    const target = selectedNotes.size > 0 ? selectedNotes : new Set(notes.map(n => n.id))
    let newNotes = [...notes]
    if (action === 'transpose') {
      newNotes = notes.map(n => target.has(n.id) ? { ...n, pitch: Math.max(0, Math.min(127, n.pitch + txTranspose)) } : n)
    } else if (action === 'vel-scale') {
      newNotes = notes.map(n => {
        if (!target.has(n.id)) return n
        const scaled = Math.round(n.velocity * (txVelScale / 100) + txVelOffset)
        return { ...n, velocity: Math.max(1, Math.min(127, scaled)) }
      })
    } else if (action === 'legato') {
      // Extend each note to reach the next note's start (or +1 beat if last)
      const sorted = [...notes].filter(n => target.has(n.id)).sort((a, b) => a.startBeat - b.startBeat)
      newNotes = notes.map(n => {
        if (!target.has(n.id)) return n
        const idx = sorted.findIndex(s => s.id === n.id)
        const next = sorted[idx + 1]
        const newDur = next ? (next.startBeat - n.startBeat) : (n.durationBeats + 1)
        return { ...n, durationBeats: Math.max(quantize / 2, newDur - 0.01) }
      })
    } else if (action === 'reverse') {
      const sel = notes.filter(n => target.has(n.id))
      if (sel.length < 2) return
      const minBeat = Math.min(...sel.map(n => n.startBeat))
      const maxEnd  = Math.max(...sel.map(n => n.startBeat + n.durationBeats))
      const span    = maxEnd - minBeat
      newNotes = notes.map(n => {
        if (!target.has(n.id)) return n
        const mirrorStart = span - (n.startBeat - minBeat) - n.durationBeats + minBeat
        return { ...n, startBeat: Math.max(0, mirrorStart) }
      })
    } else if (action === 'randomize-vel') {
      newNotes = notes.map(n => !target.has(n.id) ? n : {
        ...n, velocity: Math.max(1, Math.min(127, Math.round(40 + Math.random() * 87)))
      })
    }
    updateClip(clip.id, { midiNotes: newNotes })
  }, [clip, notes, selectedNotes, quantize, txTranspose, txVelScale, txVelOffset, updateClip])

  // ── Insert Chord from Suggestor ───────────────────────────────────────────
  const insertChord = useCallback((intervals: number[]) => {
    if (!clip) return
    const st = useProjectStore.getState()
    const bps = st.bpm / 60
    const staggerBeats = chordStagger * bps  // convert sec → beats
    const newNotes: MidiNote[] = intervals.map((semi, i) => ({
      id: `n-chord-${Date.now()}-${i}`,
      pitch: Math.max(0, Math.min(127, chordRoot + semi)),
      velocity: chordVelocity,
      startBeat: chordInsertBeat + i * staggerBeats,
      durationBeats: chordDuration,
    }))
    updateClip(clip.id, { midiNotes: [...notes, ...newNotes] })
    setSelectedNotes(new Set(newNotes.map(n => n.id)))
  }, [clip, notes, chordRoot, chordInsertBeat, chordVelocity, chordDuration, chordStagger, updateClip])

  // ── Grid click ────────────────────────────────────────────────────────────
  const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>, pitchOverride?: number) => {
    if (tool !== 'draw' || !clip) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
    const y = e.clientY - rect.top  + (scrollRef.current?.scrollTop  ?? 0)
    const startBeat = Math.floor((x / ppb) / quantize) * quantize
    const rawPitch = pitchOverride ?? Math.max(0, Math.min(127, 127 - Math.floor(y / CELL_H)))
    const pitch = resolvedPitch(rawPitch)
    if (notes.some(n => n.pitch === pitch && startBeat >= n.startBeat && startBeat < n.startBeat + n.durationBeats)) return
    const newNote: MidiNote = { id: `n-${Date.now()}`, pitch, velocity: 100, startBeat, durationBeats: quantize }
    onPlayNote?.(pitch)
    updateClip(clip.id, { midiNotes: [...notes, newNote] })
  }, [tool, clip, ppb, quantize, notes, onPlayNote, updateClip, resolvedPitch])

  function handleNoteMouseDown(e: React.MouseEvent, note: MidiNote) {
    e.stopPropagation()
    if (!clip) return
    if (tool === 'erase') { updateClip(clip.id, { midiNotes: notes.filter(n => n.id !== note.id) }); return }
    if (tool === 'select') {
      const next = new Set(selectedNotes)
      if (e.shiftKey) { next.has(note.id) ? next.delete(note.id) : next.add(note.id) }
      else if (!next.has(note.id)) { next.clear(); next.add(note.id) }
      setSelectedNotes(next)
    }
    const startX = e.clientX, startY = e.clientY
    const notesToMove = (selectedNotes.has(note.id) && selectedNotes.size > 1) ? notes.filter(n => selectedNotes.has(n.id)) : [note]
    const origBeats = new Map(notesToMove.map(n => [n.id, n.startBeat]))
    const origPitches = new Map(notesToMove.map(n => [n.id, n.pitch]))
    let moved = false
    const mv = (me: MouseEvent) => {
      if (!clip) return
      const dx = me.clientX - startX, dy = me.clientY - startY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true
      if (!moved) return
      const dBeats = dx / ppb, dPitch = -Math.round(dy / CELL_H)
      updateClip(clip.id, { midiNotes: notes.map(n => {
        if (!origBeats.has(n.id)) return n
        const rawPitch = Math.max(0, Math.min(127, origPitches.get(n.id)! + dPitch))
        return { ...n, startBeat: Math.max(0, Math.floor((origBeats.get(n.id)! + dBeats) / quantize) * quantize), pitch: resolvedPitch(rawPitch) }
      }) })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  function handleNoteResizeMouseDown(e: React.MouseEvent, note: MidiNote) {
    e.stopPropagation(); if (!clip) return
    const startX = e.clientX, orig = note.durationBeats, id = note.id
    const mv = (me: MouseEvent) => {
      if (!clip) return
      updateClip(clip.id, { midiNotes: notes.map(n => n.id === id ? { ...n, durationBeats: Math.max(quantize / 2, orig + (me.clientX - startX) / ppb) } : n) })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  function handleVelDrag(e: React.MouseEvent, note: MidiNote) {
    e.stopPropagation(); if (!clip) return
    const startY = e.clientY, origVel = note.velocity, id = note.id
    const mv = (me: MouseEvent) => {
      if (!clip) return
      updateClip(clip.id, { midiNotes: notes.map(n => n.id === id ? { ...n, velocity: Math.max(1, Math.min(127, origVel + (startY - me.clientY))) } : n) })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  // ── CC lane drawing ───────────────────────────────────────────────────────
  const handleCCLaneDraw = useCallback((e: React.MouseEvent<HTMLDivElement>, cc: number) => {
    if (!clip) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
    const y = e.clientY - rect.top
    const beat = x / ppb
    const value = Math.max(0, Math.min(127, Math.round((1 - y / rect.height) * 127)))
    setCCData(prev => {
      const next = new Map(prev)
      const pts = [...(next.get(cc) ?? [])].filter(p => Math.abs(p.beat - beat) > 0.1)
      pts.push({ beat, value })
      pts.sort((a, b) => a.beat - b.beat)
      next.set(cc, pts)
      // Persist to store
      updateClipCCLane(clip.id, cc, pts as StoreCCPoint[])
      return next
    })
  }, [clip, ppb, updateClipCCLane])

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
  const activeCC = CC_PRESETS[activeCCIdx]

  // ── DRUM EDITOR VIEW ──────────────────────────────────────────────────────
  if (drumMode) {
    const drumH = 26
    const drumTotalH = drumRows.length * drumH
    return (
      <div className="piano-roll" style={{ flexDirection: 'column' }}>
        {/* Drum toolbar */}
        <div className="pr-toolbar">
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginRight: 8 }}>🥁 DRUM EDITOR</div>
          <div className="pr-quantize">
            <label className="param-label">Grid</label>
            <select className="key-select" value={quantize} onChange={e => setQuantize(parseFloat(e.target.value))}>
              <option value={1}>1/4</option><option value={0.5}>1/8</option>
              <option value={0.25}>1/16</option><option value={0.125}>1/32</option>
            </select>
          </div>
          <div className="pr-zoom">
            <button className="tbt" onClick={() => setPpb(p => Math.max(20, p - 20))}>−</button>
            <span className="param-label" style={{ minWidth:36, textAlign:'center' }}>{ppb}px/b</span>
            <button className="tbt" onClick={() => setPpb(p => Math.min(240, p + 20))}>+</button>
          </div>
          <button className="tbt" style={{ marginLeft: 8 }} onClick={() => setDrumMode(false)}>Piano Roll</button>
          <button className="tbt btab-close" style={{ marginLeft:'auto' }} onClick={() => useProjectStore.getState().setShowPianoRoll(false)}>✕</button>
        </div>

        <div ref={scrollRef} style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', width: totalWidth + 120 }}>
            {/* Drum labels */}
            <div style={{ width: 120, flexShrink: 0 }}>
              {drumRows.map(pitch => (
                <div key={pitch} style={{ height: drumH, display: 'flex', alignItems: 'center', paddingLeft: 8, borderBottom: '1px solid rgba(255,255,255,0.04)', background: pitch % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent', cursor: 'pointer', fontSize: 10, color: '#94a3b8', userSelect: 'none' }}
                  onMouseDown={() => onPlayNote?.(pitch)}>
                  <span style={{ color: '#64748b', fontSize: 9, marginRight: 4 }}>{pitch}</span>
                  {GM_DRUMS[pitch] ?? noteName(pitch)}
                </div>
              ))}
            </div>
            {/* Drum grid */}
            <div style={{ position: 'relative', width: totalWidth, height: drumTotalH, flexShrink: 0 }}>
              {/* Grid lines */}
              {drumRows.map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * drumH, height: drumH, borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'rgba(0,0,0,0.08)' : 'transparent' }} />
              ))}
              {/* Beat columns */}
              {Array.from({ length: Math.ceil(totalBeats / quantize) }, (_, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * quantize * ppb, width: 1, background: (i * quantize) % 4 === 0 ? 'rgba(255,255,255,0.12)' : (i * quantize) % 1 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)' }} />
              ))}
              {/* Clickable cells */}
              {drumRows.map((pitch, rowIdx) => (
                Array.from({ length: Math.ceil(totalBeats / quantize) }, (_, stepIdx) => {
                  const beatPos = stepIdx * quantize
                  const hasNote = notes.some(n => n.pitch === pitch && Math.abs(n.startBeat - beatPos) < quantize * 0.5)
                  return (
                    <div key={`${pitch}-${stepIdx}`}
                      style={{ position: 'absolute', left: beatPos * ppb + 1, top: rowIdx * drumH + 2, width: Math.max(4, quantize * ppb - 3), height: drumH - 4, borderRadius: 3, background: hasNote ? trackColor : 'rgba(255,255,255,0.03)', border: `1px solid ${hasNote ? trackColor + 'cc' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', boxShadow: hasNote ? `0 0 6px ${trackColor}55` : 'none' }}
                      onMouseDown={e => {
                        e.stopPropagation(); if (!clip) return
                        if (hasNote) {
                          updateClip(clip.id, { midiNotes: notes.filter(n => !(n.pitch === pitch && Math.abs(n.startBeat - beatPos) < quantize * 0.5)) })
                        } else {
                          updateClip(clip.id, { midiNotes: [...notes, { id: `n-${Date.now()}`, pitch, velocity: 100, startBeat: beatPos, durationBeats: quantize }] })
                          onPlayNote?.(pitch)
                        }
                      }}
                    />
                  )
                })
              ))}
              {/* Note velocity bars overlaid */}
              {notes.filter(n => drumRows.includes(n.pitch)).map(note => {
                const rowIdx = drumRows.indexOf(note.pitch)
                if (rowIdx < 0) return null
                return (
                  <div key={`vel-${note.id}`}
                    style={{ position: 'absolute', left: note.startBeat * ppb + 2, top: rowIdx * drumH + 2, width: 2, height: Math.max(2, (note.velocity / 127) * (drumH - 4)), background: '#fff6', borderRadius: 1, pointerEvents: 'none' }} />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── STANDARD PIANO ROLL VIEW ──────────────────────────────────────────────
  return (
    <div className="piano-roll">
      {/* Toolbar */}
      <div className="pr-toolbar">
        <div className="pr-tools">
          <button className={`pr-tool ${tool === 'draw'   ? 'active' : ''}`} onClick={() => setTool('draw')}   title="Draw note (N)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2" y1="10" x2="9" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><polygon points="9,1 11,3 10,4 8,2" fill="currentColor"/><line x1="1" y1="11" x2="3" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <button className={`pr-tool ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} title="Select (S)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="1,1 1,9 4,7 5.5,11 7,10.5 5.5,6.5 9,6.5" fill="currentColor"/></svg>
          </button>
          <button className={`pr-tool ${tool === 'erase'  ? 'active' : ''}`} onClick={() => setTool('erase')}  title="Erase (E)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Grid quantize */}
        <div className="pr-quantize">
          <label className="param-label">Grid</label>
          <select className="key-select" value={quantize} onChange={e => setQuantize(parseFloat(e.target.value))}>
            <option value={4}>1 bar</option><option value={2}>1/2</option><option value={1}>1/4</option>
            <option value={0.5}>1/8</option><option value={0.25}>1/16</option><option value={0.125}>1/32</option>
            <option value={0.083333}>1/16T</option>
          </select>
        </div>

        {/* Quantize button */}
        <button className="tbt pr-quantize-btn" title="Quantize selected notes to grid (⌘Q)"
          onClick={() => {
            if (!clip) return
            const target = selectedNotes.size > 0 ? selectedNotes : new Set(notes.map(n => n.id))
            updateClip(clip.id, { midiNotes: notes.map(n => !target.has(n.id) ? n : {
              ...n,
              startBeat: Math.round(n.startBeat / quantize) * quantize,
              durationBeats: Math.max(quantize, Math.round(n.durationBeats / quantize) * quantize),
            }) })
          }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="4" width="2" height="6" rx="1" fill="currentColor" opacity="0.5"/><rect x="4" y="2" width="2" height="8" rx="1" fill="currentColor"/><rect x="7" y="5" width="2" height="5" rx="1" fill="currentColor" opacity="0.7"/><line x1="1" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1" opacity="0.7" strokeDasharray="1.5 1"/></svg>
          <span style={{ marginLeft: 3, fontSize: 9 }}>Q</span>
        </button>

        {/* ── Scale Lock ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
          <button
            className={`tbt ${scaleLock ? 'active' : ''}`}
            title="Scale Lock — snap notes to scale"
            onClick={() => setScaleLock(s => !s)}
            style={{ color: scaleLock ? '#10b981' : undefined, borderColor: scaleLock ? '#10b981' : undefined, fontSize: 10, padding: '2px 6px' }}
          >♩ SCALE</button>
          {scaleLock && (<>
            <select className="key-select" value={scaleRoot} onChange={e => { const v = Number(e.target.value); setScaleRoot(v); if (clip) updateClip(clip.id, { scaleLockRoot: v }) }} style={{ fontSize: 10, padding: '1px 4px' }}>
              {KEY_ROOTS.map((k, i) => <option key={k} value={i}>{k}</option>)}
            </select>
            <select className="key-select" value={scaleName} onChange={e => { const v = e.target.value; setScaleName(v); if (clip) updateClip(clip.id, { scaleLockName: v }) }} style={{ fontSize: 10, padding: '1px 4px' }}>
              {Object.keys(SCALES).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </>)}
        </div>

        {/* ── Chord Suggestor ── */}
        <div style={{ position: 'relative' }}>
          <button
            className={`tbt ${showChords ? 'active' : ''}`}
            title="Chord Suggestor — click to insert chords at playhead/cursor"
            onClick={() => setShowChords(c => !c)}
            style={{ fontSize: 10, padding: '2px 6px', color: showChords ? '#a855f7' : undefined, borderColor: showChords ? '#a855f7' : undefined }}
          >♟ CHORDS</button>

          {showChords && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300, background: '#12122a', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 10, padding: 12, minWidth: 320, boxShadow: '0 12px 32px rgba(0,0,0,0.7)' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>♟ Chord Suggestor</span>
                <button className="tbt" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => setShowChords(false)}>✕</button>
              </div>

              {/* Controls row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                {/* Root note */}
                <div>
                  <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>Root note</div>
                  <select
                    className="key-select" style={{ width: '100%', fontSize: 10 }}
                    value={chordRoot}
                    onChange={e => setChordRoot(Number(e.target.value))}
                  >
                    {Array.from({ length: 3 }, (_, oct) =>
                      KEY_ROOTS.map((k, i) => {
                        const pitch = (oct + 3) * 12 + i
                        return <option key={pitch} value={pitch}>{k}{oct + 3}</option>
                      })
                    )}
                  </select>
                </div>
                {/* Insert beat */}
                <div>
                  <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>Insert at beat</div>
                  <input type="number" min={0} step={0.25}
                    style={{ width: '100%', fontSize: 10, background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', padding: '3px 6px' }}
                    value={chordInsertBeat}
                    onChange={e => setChordInsertBeat(Number(e.target.value))}
                  />
                </div>
                {/* Duration */}
                <div>
                  <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>Duration (beats): {chordDuration}</div>
                  <input type="range" min={0.25} max={8} step={0.25}
                    style={{ width: '100%' }}
                    value={chordDuration}
                    onChange={e => setChordDuration(Number(e.target.value))}
                  />
                </div>
                {/* Velocity */}
                <div>
                  <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>Velocity: {chordVelocity}</div>
                  <input type="range" min={1} max={127}
                    style={{ width: '100%' }}
                    value={chordVelocity}
                    onChange={e => setChordVelocity(Number(e.target.value))}
                  />
                </div>
                {/* Stagger */}
                <div style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>
                    Stagger: {chordStagger === 0 ? 'Block (simultaneous)' : `${(chordStagger * 1000).toFixed(0)} ms`}
                  </div>
                  <input type="range" min={0} max={0.12} step={0.005}
                    style={{ width: '100%' }}
                    value={chordStagger}
                    onChange={e => setChordStagger(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Set insert beat to cursor button */}
              {cursorBeat !== null && (
                <button className="tbt" style={{ fontSize: 9, marginBottom: 8, background: 'rgba(168,85,247,0.15)', borderColor: '#a855f7', color: '#c084fc' }}
                  onClick={() => setChordInsertBeat(Math.floor(cursorBeat! / quantize) * quantize)}>
                  ↖ Snap to cursor ({(Math.floor(cursorBeat / quantize) * quantize).toFixed(2)} b)
                </button>
              )}

              {/* Chord categories */}
              {CHORD_SUGGESTIONS.map(cat => (
                <div key={cat.category} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, color: cat.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{cat.category}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {cat.chords.map(chord => {
                      // Build display name with root
                      const rootName = KEY_ROOTS[chordRoot % 12]
                      return (
                        <button key={chord.name}
                          style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', border: `1px solid ${cat.color}55`, color: cat.color, cursor: 'pointer', fontWeight: 600, transition: 'all 0.1s' }}
                          title={`Insert ${rootName}${chord.name} at beat ${chordInsertBeat}`}
                          onClick={() => insertChord(chord.intervals)}
                          onMouseEnter={e => { (e.target as HTMLElement).style.background = cat.color + '22'; (e.target as HTMLElement).style.borderColor = cat.color }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.target as HTMLElement).style.borderColor = cat.color + '55' }}
                        >
                          {rootName}{chord.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Humanize ── */}
        <div style={{ position: 'relative' }}>
          <button className="tbt" onClick={() => setShowHumanize(h => !h)} title="Humanize selected notes" style={{ fontSize: 10, padding: '2px 6px' }}>~ HUM</button>
          {showHumanize && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 12, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Humanize</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Velocity ± {humanizeVel}</div>
              <input type="range" min={0} max={50} value={humanizeVel} onChange={e => setHumanizeVel(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }} />
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Timing ± {(humanizeTiming * 480).toFixed(0)} ticks</div>
              <input type="range" min={0} max={0.25} step={0.005} value={humanizeTiming} onChange={e => setHumanizeTiming(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }} />
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 8 }}>{selectedNotes.size > 0 ? `${selectedNotes.size} selected notes` : 'All notes'}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="tbt" style={{ flex: 1, background: '#10b981', color: '#fff', borderColor: '#10b981' }} onClick={doHumanize}>Apply</button>
                <button className="tbt" style={{ flex: 1 }} onClick={() => setShowHumanize(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Groove / Swing Quantize ── */}
        <div style={{ position: 'relative' }}>
          <button className={`tbt ${showGroove ? 'active' : ''}`} onClick={() => { setShowGroove(g => !g); setShowTransform(false) }} title="Groove & Strength Quantize" style={{ fontSize: 10, padding: '2px 6px', color: showGroove ? '#f59e0b' : undefined, borderColor: showGroove ? '#f59e0b' : undefined }}>≈ GRV</button>
          {showGroove && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 12, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Groove Quantize</div>
              <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4 }}>Strength: {quantizeStrength}%</div>
              <input type="range" min={0} max={100} value={quantizeStrength} onChange={e => setQuantizeStrength(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }} />
              <div style={{ fontSize: 10, color: '#06b6d4', marginBottom: 4 }}>Swing: {swingAmount}%</div>
              <input type="range" min={0} max={100} value={swingAmount} onChange={e => setSwingAmount(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }} />
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 8 }}>{selectedNotes.size > 0 ? `${selectedNotes.size} selected` : 'All notes'}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="tbt" style={{ flex: 1, background: '#f59e0b', color: '#000', borderColor: '#f59e0b' }} onClick={doGrooveQuantize}>Apply</button>
                <button className="tbt" style={{ flex: 1 }} onClick={() => setShowGroove(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MIDI Transform ── */}
        <div style={{ position: 'relative' }}>
          <button className={`tbt ${showTransform ? 'active' : ''}`} onClick={() => { setShowTransform(t => !t); setShowGroove(false) }} title="MIDI Transform" style={{ fontSize: 10, padding: '2px 6px', color: showTransform ? '#a855f7' : undefined, borderColor: showTransform ? '#a855f7' : undefined }}>⇄ XFMR</button>
          {showTransform && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 12, minWidth: 240, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>MIDI Transform</div>

              {/* Transpose */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#a855f7', marginBottom: 4 }}>Transpose: {txTranspose > 0 ? `+${txTranspose}` : txTranspose} st</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="range" min={-48} max={48} value={txTranspose} onChange={e => setTxTranspose(Number(e.target.value))} style={{ flex: 1 }} />
                  <button className="tbt" style={{ fontSize: 10, padding: '2px 8px', background: '#a855f7', color: '#fff', borderColor: '#a855f7' }} onClick={() => doMidiTransform('transpose')}>Apply</button>
                </div>
              </div>

              {/* Velocity scale */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#10b981', marginBottom: 2 }}>Velocity Scale: {txVelScale}%  Offset: {txVelOffset > 0 ? `+${txVelOffset}` : txVelOffset}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="range" min={0} max={200} value={txVelScale} onChange={e => setTxVelScale(Number(e.target.value))} style={{ flex: 1 }} title="Scale %" />
                  <input type="range" min={-64} max={64} value={txVelOffset} onChange={e => setTxVelOffset(Number(e.target.value))} style={{ flex: 1 }} title="Offset" />
                  <button className="tbt" style={{ fontSize: 10, padding: '2px 8px', background: '#10b981', color: '#fff', borderColor: '#10b981' }} onClick={() => doMidiTransform('vel-scale')}>Apply</button>
                </div>
              </div>

              {/* One-shot actions */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button className="tbt" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => doMidiTransform('legato')} title="Extend each note to the start of the next">Legato</button>
                <button className="tbt" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => doMidiTransform('reverse')} title="Mirror note positions in time">Reverse</button>
                <button className="tbt" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => doMidiTransform('randomize-vel')} title="Randomize velocities">Rnd Vel</button>
                <button className="tbt" style={{ flex: 1 }} onClick={() => setShowTransform(false)}>Close</button>
              </div>
            </div>
          )}
        </div>

        {/* ── CC Lanes toggle ── */}
        <button className={`tbt ${showCCLanes ? 'active' : ''}`} onClick={() => setShowCCLanes(s => !s)} title="Show CC lanes" style={{ fontSize: 10, padding: '2px 6px', color: showCCLanes ? '#06b6d4' : undefined, borderColor: showCCLanes ? '#06b6d4' : undefined }}>CC</button>

        {/* ── Drum editor mode ── */}
        {isDrumTrack && (
          <button className="tbt" onClick={() => setDrumMode(true)} title="Drum Editor mode" style={{ fontSize: 10, padding: '2px 6px', color: '#f59e0b' }}>🥁</button>
        )}

        <div className="pr-zoom">
          <button className="tbt" onClick={() => setPpb(p => Math.max(20, p - 20))} title="Zoom out">−</button>
          <span className="param-label" style={{ minWidth:36, textAlign:'center' }}>{ppb}px/b</span>
          <button className="tbt" onClick={() => setPpb(p => Math.min(240, p + 20))} title="Zoom in">+</button>
        </div>

        <div className="pr-clip-info">
          {clip.name} — {notes.length} notes
          {selectedNotes.size > 0 && <span className="pr-sel-count"> ({selectedNotes.size} selected)</span>}
          {scaleLock && <span style={{ color: '#10b981', fontSize: 9, marginLeft: 6 }}>♩{KEY_ROOTS[scaleRoot]} {scaleName}</span>}
          {chordName && <span className="pr-chord-name"> ⬡ {chordName}</span>}
        </div>

        <div className="pr-shortcut-hints">
          <span className="pr-hint">⌘A all</span>
          <span className="pr-hint">⌘C copy</span>
          <span className="pr-hint">⌘V paste</span>
          <span className="pr-hint">⌘Q quantize</span>
          <span className="pr-hint">Del delete</span>
        </div>

        <button className="tbt btab-close" style={{ marginLeft:'auto' }} onClick={() => useProjectStore.getState().setShowPianoRoll(false)} title="Close Piano Roll (Escape)">✕</button>
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
              const inScale = scaleLock && isInScale(pitch, scaleRoot, scaleIntervals)
              return (
                <div key={pitch}
                  className={`pr-key ${black ? 'black-key' : 'white-key'} ${isC ? 'c-key' : ''}`}
                  style={{ height: CELL_H, width: 52, outline: (scaleLock && inScale && !black) ? `1px solid ${trackColor}66` : undefined }}
                  title={noteName(pitch)}
                  onMouseDown={() => onPlayNote?.(resolvedPitch(pitch))}>
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
            onMouseMove={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setCursorBeat((e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)) / ppb)
            }}
            onMouseLeave={() => setCursorBeat(null)}
            onMouseDown={e => { if (tool === 'select' && !(e.target as HTMLElement).closest('.midi-note')) setSelectedNotes(new Set()) }}
          >
            {/* Row backgrounds — scale lock highlights in-scale rows */}
            {Array.from({ length: 128 }, (_, i) => {
              const pitch = 127 - i
              const black = isBlack(pitch)
              const isC = pitch % 12 === 0
              const inScale = scaleLock && isInScale(pitch, scaleRoot, scaleIntervals)
              const outOfScale = scaleLock && !inScale
              return (
                <div key={i} style={{
                  position:'absolute', left:0, right:0, top: i * CELL_H, height: CELL_H,
                  background: outOfScale
                    ? (black ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)')
                    : black ? 'rgba(0,0,0,0.28)' : isC ? 'rgba(168,85,247,0.06)' : 'transparent',
                  borderBottom: isC ? '1px solid rgba(168,85,247,0.12)' : '1px solid rgba(255,255,255,0.025)',
                  // Subtle tint for in-scale rows
                  ...(inScale && !black ? { boxShadow: `inset 0 0 0 1px ${trackColor}18` } : {}),
                }} />
              )
            })}

            {/* Beat columns */}
            {Array.from({ length: Math.ceil(totalBeats) + 1 }, (_, b) => (
              <div key={b} style={{ position:'absolute', top:0, bottom:0, left: b * ppb, width:1, background: b % 4 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)' }} />
            ))}

            {/* Sub-beat grid */}
            {Array.from({ length: Math.ceil(totalBeats / quantize) }, (_, i) => {
              const x = i * quantize * ppb
              if ((i * quantize) % 1 === 0) return null
              return <div key={`q-${i}`} style={{ position:'absolute', top:0, bottom:0, left: x, width:1, background:'rgba(255,255,255,0.03)' }} />
            })}

            {/* Notes */}
            {notes.map(note => (
              <div key={note.id}
                className={`midi-note ${selectedNotes.has(note.id) ? 'selected' : ''}`}
                style={{
                  left: note.startBeat * ppb, top: (127 - note.pitch) * CELL_H + 1,
                  width: Math.max(6, note.durationBeats * ppb - 1), height: CELL_H - 2,
                  opacity: 0.5 + (note.velocity / 127) * 0.5,
                  background: `linear-gradient(135deg, ${trackColor}, ${trackColor}aa)`,
                  borderColor: selectedNotes.has(note.id) ? '#fff' : trackColor + 'cc',
                }}
                onMouseDown={e => handleNoteMouseDown(e, note)}
                title={`${noteName(note.pitch)} vel:${note.velocity}`}>
                {note.durationBeats * ppb > 28 && (
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,.8)', paddingLeft: 2, userSelect:'none', pointerEvents:'none' }}>{noteName(note.pitch)}</span>
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
              <div key={note.id} className="vel-bar"
                style={{ left: note.startBeat * ppb + 1, width: Math.max(3, note.durationBeats * ppb - 3), height: Math.max(2, (note.velocity / 127) * 44), background: selectedNotes.has(note.id) ? '#fff' : trackColor }}
                onMouseDown={e => handleVelDrag(e, note)}
                title={`Velocity: ${note.velocity}`} />
            ))}
          </div>
        </div>

        {/* CC Lanes */}
        {showCCLanes && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
            {/* CC lane selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {CC_PRESETS.map((cc, i) => (
                <button key={i} onClick={() => setActiveCCIdx(i)}
                  style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: activeCCIdx === i ? cc.color : 'rgba(255,255,255,0.05)', border: `1px solid ${activeCCIdx === i ? cc.color : 'rgba(255,255,255,0.1)'}`, color: activeCCIdx === i ? '#fff' : '#94a3b8', cursor: 'pointer', fontWeight: 700 }}>
                  {cc.label}
                </button>
              ))}
            </div>
            {/* CC draw area */}
            <div style={{ display: 'flex' }}>
              <div style={{ width: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#64748b', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                {activeCC.label}
              </div>
              <div
                style={{ flex: 1, height: 60, position: 'relative', cursor: 'crosshair', background: 'rgba(0,0,0,0.15)', borderLeft: `2px solid ${activeCC.color}33` }}
                onMouseDown={e => handleCCLaneDraw(e, activeCC.cc)}
                onMouseMove={e => { if (e.buttons === 1) handleCCLaneDraw(e, activeCC.cc) }}
              >
                {/* CC points as a line path */}
                {(() => {
                  const pts = ccData.get(activeCC.cc) ?? []
                  if (pts.length < 2) return null
                  const pathD = pts.map((p, i) => {
                    const x = p.beat * ppb
                    const y = (1 - p.value / 127) * 60
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
                  }).join(' ')
                  return (
                    <svg style={{ position: 'absolute', inset: 0, width: totalWidth, height: 60, pointerEvents: 'none' }}>
                      <path d={pathD} fill="none" stroke={activeCC.color} strokeWidth={1.5} opacity={0.8} />
                    </svg>
                  )
                })()}
                {/* CC dots */}
                {(ccData.get(activeCC.cc) ?? []).map((p, i) => (
                  <div key={i} style={{ position: 'absolute', left: p.beat * ppb - 3, top: (1 - p.value / 127) * 60 - 3, width: 6, height: 6, borderRadius: '50%', background: activeCC.color, boxShadow: `0 0 4px ${activeCC.color}` }} />
                ))}
                {/* Zero line */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.04)' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
