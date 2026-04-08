/**
 * useMidiOutput — Web MIDI API output routing (offline-capable, no internet needed)
 * Provides MIDI port enumeration, selection, and noteOn/noteOff dispatch.
 * The Web MIDI API communicates with locally connected hardware (USB synths, interfaces, etc.)
 */
import { useState, useEffect, useCallback, useRef } from 'react'

export interface MidiPort {
  id: string
  name: string
  manufacturer: string
  state: 'connected' | 'disconnected'
}

export interface MidiOutputState {
  supported: boolean
  permissionGranted: boolean
  ports: MidiPort[]
  selectedPortId: string | null
  error: string | null
}

export function useMidiOutput() {
  const [state, setState] = useState<MidiOutputState>({
    supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    permissionGranted: false,
    ports: [],
    selectedPortId: null,
    error: null,
  })
  const accessRef = useRef<MIDIAccess | null>(null)

  // Enumerate MIDI output ports
  const refreshPorts = useCallback((access: MIDIAccess) => {
    const ports: MidiPort[] = []
    access.outputs.forEach(output => {
      ports.push({
        id: output.id,
        name: output.name ?? 'Unknown',
        manufacturer: output.manufacturer ?? '',
        state: output.state,
      })
    })
    setState(prev => ({
      ...prev,
      permissionGranted: true,
      ports,
      // Auto-select first port if none selected
      selectedPortId: prev.selectedPortId ?? (ports[0]?.id ?? null),
      error: null,
    }))
  }, [])

  // Request MIDI access
  const requestAccess = useCallback(async () => {
    if (!state.supported) {
      setState(prev => ({ ...prev, error: 'Web MIDI API not supported in this browser. Try Chrome or Edge.' }))
      return
    }
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      accessRef.current = access
      refreshPorts(access)

      // Hot-plug: listen for device changes
      access.onstatechange = () => refreshPorts(access)
    } catch (err) {
      setState(prev => ({ ...prev, error: `MIDI access denied: ${err}` }))
    }
  }, [state.supported, refreshPorts])

  // Auto-request on mount
  useEffect(() => {
    if (state.supported) requestAccess()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Select a port
  const selectPort = useCallback((portId: string | null) => {
    setState(prev => ({ ...prev, selectedPortId: portId }))
  }, [])

  // Send note-on
  const noteOn = useCallback((channel: number, pitch: number, velocity: number) => {
    if (!accessRef.current || !state.selectedPortId) return
    const output = accessRef.current.outputs.get(state.selectedPortId)
    if (!output) return
    output.send([0x90 | (channel & 0x0f), pitch & 0x7f, velocity & 0x7f])
  }, [state.selectedPortId])

  // Send note-off
  const noteOff = useCallback((channel: number, pitch: number) => {
    if (!accessRef.current || !state.selectedPortId) return
    const output = accessRef.current.outputs.get(state.selectedPortId)
    if (!output) return
    output.send([0x80 | (channel & 0x0f), pitch & 0x7f, 0])
  }, [state.selectedPortId])

  // Send CC (Control Change)
  const sendCC = useCallback((channel: number, cc: number, value: number) => {
    if (!accessRef.current || !state.selectedPortId) return
    const output = accessRef.current.outputs.get(state.selectedPortId)
    if (!output) return
    output.send([0xb0 | (channel & 0x0f), cc & 0x7f, value & 0x7f])
  }, [state.selectedPortId])

  // All notes off (panic)
  const allNotesOff = useCallback((channel = 0) => {
    if (!accessRef.current || !state.selectedPortId) return
    const output = accessRef.current.outputs.get(state.selectedPortId)
    if (!output) return
    output.send([0xb0 | (channel & 0x0f), 123, 0]) // CC 123 = all notes off
  }, [state.selectedPortId])

  return {
    ...state,
    requestAccess,
    selectPort,
    noteOn,
    noteOff,
    sendCC,
    allNotesOff,
  }
}
