import React, { useEffect, useRef, useState, useCallback } from 'react'

// ── Note layout for 2 octaves starting at C4 ─────────────────────────────────
// White keys: A S D F G H J K L  → C4 D4 E4 F4 G4 A4 B4 C5 D5
// Black keys: W E   R T Y   U I O P → C#4 D#4 F#4 G#4 A#4 C#5 D#5 F#5 G#5

const WHITE_KEY_MAP: Record<string, number> = {
  a: 60, // C4
  s: 62, // D4
  d: 64, // E4
  f: 65, // F4
  g: 67, // G4
  h: 69, // A4
  j: 71, // B4
  k: 72, // C5
  l: 74, // D5
}

const BLACK_KEY_MAP: Record<string, number> = {
  w: 61, // C#4
  e: 63, // D#4
  r: 66, // F#4
  t: 68, // G#4
  y: 70, // A#4
  u: 73, // C#5
  i: 75, // D#5
  o: 78, // F#5 (actually 77, but spec says 78)
  p: 80, // G#5
}

const NOTE_KEY_MAP: Record<string, number> = { ...WHITE_KEY_MAP, ...BLACK_KEY_MAP }

// White key display order for 2 octaves (C4–D5)
const WHITE_KEYS = [
  { pitch: 60, label: 'C4', key: 'A' },
  { pitch: 62, label: 'D4', key: 'S' },
  { pitch: 64, label: 'E4', key: 'D' },
  { pitch: 65, label: 'F4', key: 'F' },
  { pitch: 67, label: 'G4', key: 'G' },
  { pitch: 69, label: 'A4', key: 'H' },
  { pitch: 71, label: 'B4', key: 'J' },
  { pitch: 72, label: 'C5', key: 'K' },
  { pitch: 74, label: 'D5', key: 'L' },
]

// Black keys with pixel offset from left (each white key is 28px wide)
// C#4 between C4(0) and D4(1): left = 0*28 + 19 = 19
// D#4 between D4(1) and E4(2): left = 1*28 + 19 = 47
// F#4 between F4(3) and G4(4): left = 3*28 + 19 = 103
// G#4 between G4(4) and A4(5): left = 4*28 + 19 = 131
// A#4 between A4(5) and B4(6): left = 5*28 + 19 = 159
// C#5 between C5(7) and D5(8): left = 7*28 + 19 = 215
// D#5 after D5(8): left = 8*28 + 19 = 243  (note: no E5 white key shown, so D#5 shown)
// F#5, G#5: shown after the 9 white keys – but we only render 9 white keys.
// We'll add 2 more implied positions for visual context:
const BLACK_KEYS = [
  { pitch: 61, label: 'C#4', key: 'W', left: 19 },
  { pitch: 63, label: 'D#4', key: 'E', left: 47 },
  { pitch: 66, label: 'F#4', key: 'R', left: 103 },
  { pitch: 68, label: 'G#4', key: 'T', left: 131 },
  { pitch: 70, label: 'A#4', key: 'Y', left: 159 },
  { pitch: 73, label: 'C#5', key: 'U', left: 215 },
  { pitch: 75, label: 'D#5', key: 'I', left: 243 },
]

interface MusicalTypingProps {
  isOpen: boolean
  onClose: () => void
  onNoteOn: (pitch: number, velocity: number) => void
  onNoteOff: (pitch: number) => void
  onPlayNote: (pitch: number, durationSec?: number) => void // for mouse clicks (auto-release)
}

export function MusicalTyping({ isOpen, onClose, onNoteOn, onNoteOff, onPlayNote }: MusicalTypingProps) {
  const [octaveOffset, setOctaveOffset] = useState(0)
  const [velocity, setVelocity] = useState(100)
  const [sustain, setSustain] = useState(false)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())
  const [pitchBend, setPitchBend] = useState(0)
  const [modulation, setModulation] = useState(0)

  // Track which physical keys are currently held (to avoid repeat on keydown)
  const heldKeys = useRef<Set<string>>(new Set())

  const isInputFocused = useCallback(() => {
    const el = document.activeElement
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return

      const key = e.key.toLowerCase()

      // Prevent browser defaults for handled keys
      if (key === 'tab') e.preventDefault()

      // Skip repeat events for note keys
      if (heldKeys.current.has(key)) return

      // ── Note keys ──────────────────────────────────────────────────────────
      if (NOTE_KEY_MAP[key] !== undefined) {
        heldKeys.current.add(key)
        const basePitch = NOTE_KEY_MAP[key]
        const pitch = Math.max(0, Math.min(127, basePitch + octaveOffset * 12))
        onNoteOn(pitch, velocity)
        setActiveNotes(prev => new Set(prev).add(pitch))
        return
      }

      // ── Control keys ────────────────────────────────────────────────────────
      switch (key) {
        case 'z':
          setOctaveOffset(o => Math.max(-2, o - 1))
          break
        case 'x':
          setOctaveOffset(o => Math.min(4, o + 1))
          break
        case 'c':
          setVelocity(v => Math.max(1, v - 10))
          break
        case 'v':
          setVelocity(v => Math.min(127, v + 10))
          break
        case '1':
          heldKeys.current.add(key)
          setPitchBend(-64)
          break
        case '2':
          heldKeys.current.add(key)
          setPitchBend(64)
          break
        case '3':
          setModulation(0)
          break
        case '4':
          setModulation(64)
          break
        case '5':
          setModulation(80)
          break
        case '6':
          setModulation(96)
          break
        case '7':
          setModulation(112)
          break
        case '8':
          setModulation(127)
          break
        case 'tab':
          setSustain(s => !s)
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isInputFocused()) return

      const key = e.key.toLowerCase()
      heldKeys.current.delete(key)

      if (NOTE_KEY_MAP[key] !== undefined) {
        const basePitch = NOTE_KEY_MAP[key]
        const pitch = Math.max(0, Math.min(127, basePitch + octaveOffset * 12))
        setActiveNotes(prev => {
          const next = new Set(prev)
          next.delete(pitch)
          return next
        })
        if (!sustain) {
          onNoteOff(pitch)
        }
      }

      if (key === '1' || key === '2') {
        setPitchBend(0)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [isOpen, octaveOffset, velocity, sustain, onNoteOn, onNoteOff, isInputFocused])

  if (!isOpen) return null

  // Apply octave offset to displayed pitches
  const displayedWhiteKeys = WHITE_KEYS.map(k => ({
    ...k,
    pitch: Math.max(0, Math.min(127, k.pitch + octaveOffset * 12)),
    label: k.label.replace(/\d+/, String(4 + octaveOffset)),
  }))
  const displayedBlackKeys = BLACK_KEYS.map(k => ({
    ...k,
    pitch: Math.max(0, Math.min(127, k.pitch + octaveOffset * 12)),
  }))

  return (
    <div className="musical-typing">
      {/* Title bar */}
      <div className="mt-titlebar">
        <span>Musical Typing</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-m)',
            cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px',
          }}
          title="Close"
        >✕</button>
      </div>

      {/* Status row */}
      <div className="mt-status">
        <div>Oct: <span>{4 + octaveOffset}</span></div>
        <div>Vel: <span>{velocity}</span></div>
        <div>Sus: <span style={{ color: sustain ? 'var(--green)' : undefined }}>{sustain ? 'ON' : 'OFF'}</span></div>
        <div>Bend: <span>{pitchBend}</span></div>
        <div>Mod: <span>{modulation}</span></div>
      </div>

      {/* Keyboard */}
      <div className="mt-keyboard-wrap">
        <div className="mt-piano">
          {/* White keys */}
          {displayedWhiteKeys.map(k => (
            <div
              key={k.key}
              className={`mt-white-key${activeNotes.has(k.pitch) ? ' active' : ''}`}
              onMouseDown={() => {
                onNoteOn(k.pitch, velocity)
                setActiveNotes(prev => new Set(prev).add(k.pitch))
              }}
              onMouseUp={() => {
                setActiveNotes(prev => { const n = new Set(prev); n.delete(k.pitch); return n })
                if (!sustain) onNoteOff(k.pitch)
              }}
              onMouseLeave={() => {
                setActiveNotes(prev => { const n = new Set(prev); n.delete(k.pitch); return n })
                if (!sustain) onNoteOff(k.pitch)
              }}
              title={`${k.label} (${k.key})`}
            >
              {k.label}
            </div>
          ))}

          {/* Black keys — absolutely positioned */}
          {displayedBlackKeys.map(k => (
            <div
              key={k.key}
              className={`mt-black-key${activeNotes.has(k.pitch) ? ' active' : ''}`}
              style={{ left: k.left }}
              onMouseDown={e => {
                e.stopPropagation()
                onNoteOn(k.pitch, velocity)
                setActiveNotes(prev => new Set(prev).add(k.pitch))
              }}
              onMouseUp={e => {
                e.stopPropagation()
                setActiveNotes(prev => { const n = new Set(prev); n.delete(k.pitch); return n })
                if (!sustain) onNoteOff(k.pitch)
              }}
              onMouseLeave={() => {
                setActiveNotes(prev => { const n = new Set(prev); n.delete(k.pitch); return n })
                if (!sustain) onNoteOff(k.pitch)
              }}
              title={`${k.label} (${k.key})`}
            >
              {k.key}
            </div>
          ))}
        </div>

        {/* Control hints */}
        <div className="mt-hints">
          <span className="mt-hint">Z/X — Oct ±</span>
          <span className="mt-hint">C/V — Vel ±10</span>
          <span className="mt-hint">Tab — Sustain</span>
          <span className="mt-hint">1/2 — Pitch Bend</span>
          <span className="mt-hint">3–8 — Mod</span>
          <span className="mt-hint">Shift+P — Close</span>
        </div>
      </div>
    </div>
  )
}
