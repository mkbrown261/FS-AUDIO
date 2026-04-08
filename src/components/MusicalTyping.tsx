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
  r: 66,  // F#4
  t: 68,  // G#4
  y: 70,  // A#4
  u: 73,  // C#5
  i: 75,  // D#5
  o: 78,  // F#5
  p: 80,  // G#5
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
  onPlayNote: (pitch: number, durationSec?: number) => void
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

  // ─── EXCLUSIVE KEYBOARD CAPTURE ───────────────────────────────────────────
  // We register on the CAPTURE phase (useCapture = true) so our handler fires
  // BEFORE any bubble-phase listener in App.tsx. For every key event we
  // call stopImmediatePropagation() to prevent App shortcuts from firing.
  // The ONLY exception is Shift+P which closes the window (same shortcut as open).
  useEffect(() => {
    if (!isOpen) return

    // ── Capture-phase blocker: intercepts ALL keyboard events first ──────────
    const captureBlocker = (e: KeyboardEvent) => {
      // Always stop propagation — nothing below us in the capture chain
      // (App.tsx bubble-phase handler) should see this event while MT is open.
      e.stopImmediatePropagation()
      e.preventDefault()

      // Shift+P → close the Musical Typing window
      if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        onClose()
        return
      }

      // Escape → also closes the window
      if (e.key === 'Escape') {
        onClose()
        return
      }
    }

    // ── Bubble-phase note handler: does the actual music logic ───────────────
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()

      // Already handled by captureBlocker — but double-check close shortcuts
      if (e.shiftKey && (e.key === 'P' || e.key === 'p')) return
      if (e.key === 'Escape') return

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

    // CAPTURE phase = true → fires before any bubble-phase handler
    document.addEventListener('keydown', captureBlocker, true)
    document.addEventListener('keydown', handleKeyDown, false)
    document.addEventListener('keyup', handleKeyUp, false)

    return () => {
      document.removeEventListener('keydown', captureBlocker, true)
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
