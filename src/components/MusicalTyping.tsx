import React, { useEffect, useRef, useState, useCallback } from 'react'

// ── Note layout for 2 octaves starting at C4 ─────────────────────────────────
// White keys: A S D F G H J K L  → C4 D4 E4 F4 G4 A4 B4 C5 D5
// Black keys: W E   R T Y   U I   → C#4 D#4 F#4 G#4 A#4 C#5 D#5

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
  w: 61,  // C#4
  e: 63,  // D#4
  t: 66,  // F#4
  y: 68,  // G#4
  u: 70,  // A#4
  i: 73,  // C#5
  o: 75,  // D#5
  // R key reserved for record function
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
const BLACK_KEYS = [
  { pitch: 61, label: 'C#4', key: 'W', left: 19 },
  { pitch: 63, label: 'D#4', key: 'E', left: 47 },
  { pitch: 66, label: 'F#4', key: 'T', left: 103 },
  { pitch: 68, label: 'G#4', key: 'Y', left: 131 },
  { pitch: 70, label: 'A#4', key: 'U', left: 159 },
  { pitch: 73, label: 'C#5', key: 'I', left: 215 },
  { pitch: 75, label: 'D#5', key: 'O', left: 243 },
]

interface MusicalTypingProps {
  isOpen: boolean
  onClose: () => void
  onNoteOn: (pitch: number, velocity: number) => void
  onNoteOff: (pitch: number) => void
  onPlayNote: (pitch: number, durationSec?: number) => void
  onTogglePlay?: () => void
}

export function MusicalTyping({ isOpen, onClose, onNoteOn, onNoteOff, onPlayNote, onTogglePlay }: MusicalTypingProps) {
  const [octaveOffset, setOctaveOffset] = useState(0)
  const [velocity, setVelocity] = useState(100)
  const [sustain, setSustain] = useState(false)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())
  const [pitchBend, setPitchBend] = useState(0)
  const [modulation, setModulation] = useState(0)

  // Track which physical keys are currently held (to avoid repeat on keydown)
  const heldKeys = useRef<Set<string>>(new Set())

  // ─── EXCLUSIVE KEYBOARD HANDLER ───────────────────────────────────────────
  // Single handler that processes all keys and prevents App.tsx shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      
      // ── WHITELIST: Allow critical transport keys to pass through ──────────
      // These keys work BOTH in musical typing AND as transport controls
      const isTransportKey = 
        key === 'r' ||           // Record
        e.code === 'Space' ||    // Play/Pause (spacebar)
        e.key === 'Escape' ||    // Exit musical typing
        (e.shiftKey && key === 'p') // Exit musical typing (Shift+P)
      
      if (!isTransportKey) {
        // Stop propagation for all other keys to prevent App.tsx shortcuts
        e.stopPropagation()
      }

      // Shift+P → close the Musical Typing window
      if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault()
        onClose()
        return
      }

      // Escape → also closes the window
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Spacebar → toggle playback (MIDI panic)
      if (e.code === 'Space') {
        e.preventDefault()
        if (onTogglePlay) {
          console.log('[MusicalTyping] Spacebar pressed - calling onTogglePlay()')
          onTogglePlay()
        }
        return
      }

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
      const key = e.key.toLowerCase()
      
      // Allow transport keys to pass through on keyup too
      const isTransportKey = 
        key === 'r' || 
        e.code === 'Space' ||
        e.key === 'Escape' ||
        (e.shiftKey && key === 'p')
      
      if (!isTransportKey) {
        e.stopPropagation()
      }
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

    document.addEventListener('keydown', handleKeyDown, false)
    document.addEventListener('keyup', handleKeyUp, false)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, false)
      document.removeEventListener('keyup', handleKeyUp, false)
      // Release any held keys / notes when closing
      heldKeys.current.clear()
    }
  }, [isOpen, octaveOffset, velocity, sustain, onNoteOn, onNoteOff, onClose])

  // When the window closes, clear active notes display
  useEffect(() => {
    if (!isOpen) {
      setActiveNotes(new Set())
      heldKeys.current.clear()
    }
  }, [isOpen])

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
    <>
      {/* ── Semi-transparent backdrop to visually indicate modal focus ─────── */}
      <div
        className="mt-backdrop"
        onClick={onClose}
        aria-label="Close Musical Typing"
      />

      <div className="musical-typing" role="dialog" aria-modal="true" aria-label="Musical Typing Keyboard">
        {/* Title bar */}
        <div className="mt-titlebar">
          <span>🎹 Musical Typing</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-m)', opacity: 0.8 }}>
              Keyboard locked to piano
            </span>
            <button
              onClick={onClose}
              className="mt-close-btn"
              title="Close (Shift+P or Esc)"
            >✕</button>
          </div>
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
            <span className="mt-hint"><strong>Shift+P or Esc — Close</strong></span>
          </div>
        </div>
      </div>
    </>
  )
}
