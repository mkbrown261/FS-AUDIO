/**
 * MidiOutputPanel — MIDI output routing panel shown in the Mixer
 * Lets user select a MIDI output port and test it.
 * Works offline — Web MIDI API only needs locally connected devices.
 */
import React, { useState, useContext, createContext, useCallback } from 'react'
import { useMidiOutput } from '../hooks/useMidiOutput'

// ── Context so PianoRoll can access noteOn/noteOff globally ───────────────────
interface MidiCtxValue {
  noteOn: (ch: number, pitch: number, vel: number) => void
  noteOff: (ch: number, pitch: number) => void
  allNotesOff: (ch?: number) => void
  selectedPortId: string | null
}

const MidiContext = createContext<MidiCtxValue>({
  noteOn: () => {},
  noteOff: () => {},
  allNotesOff: () => {},
  selectedPortId: null,
})

export function useMidiContext() { return useContext(MidiContext) }

// ── Provider to wrap the app ──────────────────────────────────────────────────
export function MidiProvider({ children }: { children: React.ReactNode }) {
  const midi = useMidiOutput()
  return (
    <MidiContext.Provider value={{
      noteOn: midi.noteOn,
      noteOff: midi.noteOff,
      allNotesOff: midi.allNotesOff,
      selectedPortId: midi.selectedPortId,
    }}>
      {children}
    </MidiContext.Provider>
  )
}

// ── Panel component ───────────────────────────────────────────────────────────
export function MidiOutputPanel() {
  const midi = useMidiOutput()
  const [testNote, setTestNote] = useState(60) // Middle C
  const [channel, setChannel] = useState(1)
  const [isHolding, setIsHolding] = useState(false)

  const handleTestNoteDown = useCallback(() => {
    midi.noteOn(channel - 1, testNote, 100)
    setIsHolding(true)
  }, [midi, channel, testNote])

  const handleTestNoteUp = useCallback(() => {
    midi.noteOff(channel - 1, testNote)
    setIsHolding(false)
  }, [midi, channel, testNote])

  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
  const noteName = NOTE_NAMES[testNote % 12] + Math.floor(testNote / 12 - 1)

  return (
    <div className="midi-panel">
      <div className="midi-panel-header">
        <span className="midi-panel-title">MIDI OUTPUT</span>
        {!midi.supported && (
          <span className="midi-unsupported">Not supported — use Chrome/Edge</span>
        )}
      </div>

      {midi.error && (
        <div className="midi-error">{midi.error}</div>
      )}

      {!midi.permissionGranted && midi.supported && (
        <button className="midi-request-btn" onClick={midi.requestAccess}>
          Request MIDI Access
        </button>
      )}

      {midi.permissionGranted && (
        <>
          {/* Port selector */}
          <div className="midi-row">
            <label className="midi-label">Output Port</label>
            <select
              className="midi-select"
              value={midi.selectedPortId ?? ''}
              onChange={e => midi.selectPort(e.target.value || null)}
            >
              <option value="">— None —</option>
              {midi.ports.map(p => (
                <option key={p.id} value={p.id} disabled={p.state === 'disconnected'}>
                  {p.name} {p.manufacturer ? `(${p.manufacturer})` : ''} {p.state === 'disconnected' ? '⚠' : ''}
                </option>
              ))}
            </select>
          </div>

          {midi.ports.length === 0 && (
            <div className="midi-no-ports">
              No MIDI output devices detected. Connect a USB MIDI device and click Refresh.
            </div>
          )}

          {/* Channel selector */}
          <div className="midi-row">
            <label className="midi-label">Channel</label>
            <input
              type="number" min={1} max={16} value={channel}
              className="midi-channel-input"
              onChange={e => setChannel(Math.max(1, Math.min(16, parseInt(e.target.value) || 1)))}
            />
          </div>

          {/* Test note */}
          <div className="midi-row">
            <label className="midi-label">Test Note</label>
            <input
              type="range" min={0} max={127} value={testNote}
              className="midi-note-slider"
              onChange={e => setTestNote(parseInt(e.target.value))}
              disabled={isHolding}
            />
            <span className="midi-note-name">{noteName}</span>
          </div>

          {/* Play note button */}
          <div className="midi-row">
            <button
              className={`midi-play-btn ${isHolding ? 'holding' : ''}`}
              onMouseDown={handleTestNoteDown}
              onMouseUp={handleTestNoteUp}
              onMouseLeave={handleTestNoteUp}
              disabled={!midi.selectedPortId}
              title="Hold to play test note"
            >
              {isHolding ? '♪ Sounding…' : '▶ Test Note'}
            </button>
            <button
              className="midi-panic-btn"
              onClick={() => midi.allNotesOff(channel - 1)}
              disabled={!midi.selectedPortId}
              title="All Notes Off (MIDI Panic)"
            >
              ⚠ Panic
            </button>
            <button
              className="midi-refresh-btn"
              onClick={midi.requestAccess}
              title="Refresh device list"
            >
              ↺
            </button>
          </div>

          {/* Status */}
          {midi.selectedPortId && (
            <div className="midi-status">
              ● Active — {midi.ports.find(p => p.id === midi.selectedPortId)?.name ?? 'Unknown'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
