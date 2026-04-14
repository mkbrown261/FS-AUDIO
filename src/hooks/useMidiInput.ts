/**
 * useMidiInput — Web MIDI API input routing
 *
 * Listens to all connected MIDI input devices and routes:
 *   - Note On  (0x9n) → engine.noteOn(pitch, velocity)
 *   - Note Off (0x8n) → engine.noteOff(pitch)
 *   - Sustain pedal (CC 64) → hold notes / release
 *   - All Notes Off (CC 123) → engine.allNotesOff()
 *   - Pitch Bend (0xEn) → stored in ref for synths that read it
 *
 * Device list is kept in sync via onstatechange (hot-plug).
 * Each input device can be individually enabled/disabled.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface MidiInputPort {
  id: string
  name: string
  manufacturer: string
  state: 'connected' | 'disconnected'
  enabled: boolean
}

export interface MidiInputState {
  supported: boolean
  permissionGranted: boolean
  ports: MidiInputPort[]
  error: string | null
  /** Last received MIDI message (for display / debugging) */
  lastMessage: { type: string; pitch: number; velocity: number; channel: number } | null
}

interface EngineCallbacks {
  noteOn: (pitch: number, velocity: number) => void
  noteOff: (pitch: number) => void
  allNotesOff: () => void
}

export function useMidiInput(engine: EngineCallbacks) {
  const [state, setState] = useState<MidiInputState>({
    supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    permissionGranted: false,
    ports: [],
    error: null,
    lastMessage: null,
  })

  const accessRef  = useRef<MIDIAccess | null>(null)
  const enabledRef = useRef<Set<string>>(new Set()) // enabled port IDs
  const sustainRef = useRef(false)                  // sustain pedal held
  const sustainedNotesRef = useRef<Set<number>>(new Set()) // notes held by pedal

  // ── MIDI message handler ─────────────────────────────────────────────────
  const handleMessage = useCallback((e: MIDIMessageEvent) => {
    if (!e.data || e.data.length < 2) return
    const [status, data1, data2 = 0] = Array.from(e.data)
    const type    = status & 0xf0
    const channel = status & 0x0f
    const pitch   = data1 & 0x7f
    const vel     = data2 & 0x7f

    switch (type) {
      case 0x90: // Note On
        if (vel === 0) {
          // Note On with vel=0 is actually a Note Off
          if (sustainRef.current) {
            sustainedNotesRef.current.add(pitch)
          } else {
            engine.noteOff(pitch)
          }
          setState(prev => ({ ...prev, lastMessage: { type: 'noteOff', pitch, velocity: 0, channel } }))
        } else {
          engine.noteOn(pitch, vel)
          sustainedNotesRef.current.delete(pitch) // no longer "held by pedal"
          setState(prev => ({ ...prev, lastMessage: { type: 'noteOn', pitch, velocity: vel, channel } }))
        }
        break

      case 0x80: // Note Off
        if (sustainRef.current) {
          sustainedNotesRef.current.add(pitch)
        } else {
          engine.noteOff(pitch)
        }
        setState(prev => ({ ...prev, lastMessage: { type: 'noteOff', pitch, velocity: vel, channel } }))
        break

      case 0xb0: // Control Change
        if (data1 === 64) {
          // Sustain pedal
          const down = vel >= 64
          sustainRef.current = down
          if (!down) {
            // Release all notes that were held by the pedal
            sustainedNotesRef.current.forEach(p => engine.noteOff(p))
            sustainedNotesRef.current.clear()
          }
          setState(prev => ({ ...prev, lastMessage: { type: `sustain ${down ? 'on' : 'off'}`, pitch: 0, velocity: vel, channel } }))
        } else if (data1 === 123 || data1 === 120) {
          // All Notes Off / All Sound Off
          engine.allNotesOff()
          sustainedNotesRef.current.clear()
          setState(prev => ({ ...prev, lastMessage: { type: 'allNotesOff', pitch: 0, velocity: 0, channel } }))
        }
        break

      case 0xe0: // Pitch Bend — no direct engine call, but log it
        setState(prev => ({ ...prev, lastMessage: { type: 'pitchBend', pitch: data1, velocity: data2, channel } }))
        break

      default:
        break
    }
  }, [engine])

  // ── Attach / detach message handlers ────────────────────────────────────
  const attachHandlers = useCallback((access: MIDIAccess) => {
    access.inputs.forEach(input => {
      // Always remove first to avoid double-registration
      input.onmidimessage = null
      if (enabledRef.current.has(input.id)) {
        input.onmidimessage = handleMessage
      }
    })
  }, [handleMessage])

  // ── Refresh port list ────────────────────────────────────────────────────
  const refreshPorts = useCallback((access: MIDIAccess) => {
    const ports: MidiInputPort[] = []
    access.inputs.forEach(input => {
      // Auto-enable new ports on first connect
      if (!enabledRef.current.has(input.id) && input.state === 'connected') {
        enabledRef.current.add(input.id)
      }
      ports.push({
        id:           input.id,
        name:         input.name ?? 'Unknown',
        manufacturer: input.manufacturer ?? '',
        state:        input.state as 'connected' | 'disconnected',
        enabled:      enabledRef.current.has(input.id),
      })
    })
    setState(prev => ({
      ...prev,
      permissionGranted: true,
      ports,
      error: null,
    }))
    attachHandlers(access)
  }, [attachHandlers])

  // ── Request MIDI access ──────────────────────────────────────────────────
  const requestAccess = useCallback(async () => {
    if (!state.supported) {
      setState(prev => ({ ...prev, error: 'Web MIDI API not supported. Use Chrome or Electron.' }))
      return
    }
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      accessRef.current = access
      refreshPorts(access)
      access.onstatechange = () => refreshPorts(access)
    } catch (err) {
      setState(prev => ({ ...prev, error: `MIDI access denied: ${(err as Error).message}` }))
    }
  }, [state.supported, refreshPorts])

  // Auto-request on mount
  useEffect(() => {
    if (state.supported) requestAccess()
    return () => {
      // Detach all handlers on unmount
      accessRef.current?.inputs.forEach(input => { input.onmidimessage = null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Toggle a port on/off ─────────────────────────────────────────────────
  const togglePort = useCallback((portId: string) => {
    if (enabledRef.current.has(portId)) {
      enabledRef.current.delete(portId)
    } else {
      enabledRef.current.add(portId)
    }
    if (accessRef.current) {
      refreshPorts(accessRef.current)
    }
  }, [refreshPorts])

  // ── Enable all / none ───────────────────────────────────────────────────
  const enableAll  = useCallback(() => {
    accessRef.current?.inputs.forEach(i => enabledRef.current.add(i.id))
    if (accessRef.current) refreshPorts(accessRef.current)
  }, [refreshPorts])

  const disableAll = useCallback(() => {
    enabledRef.current.clear()
    if (accessRef.current) refreshPorts(accessRef.current)
  }, [refreshPorts])

  return {
    ...state,
    requestAccess,
    togglePort,
    enableAll,
    disableAll,
  }
}
