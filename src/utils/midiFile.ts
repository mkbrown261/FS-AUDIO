/**
 * Minimal Standard MIDI File (SMF) parser and writer.
 * Supports Type-0 (single track) and Type-1 (multi-track) files.
 * No external dependencies — pure TypeScript / Web APIs only.
 */

import type { MidiNote } from '../store/projectStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MidiTrackData {
  name: string
  notes: MidiNote[]   // beats relative to clip start (startBeat=0 means start of clip)
  durationBeats: number
}

// ─── Variable-length quantity ─────────────────────────────────────────────────

function readVlq(data: Uint8Array, pos: number): { value: number; newPos: number } {
  let value = 0
  let shift = 0
  let byte: number
  do {
    byte = data[pos++]
    value = (value << 7) | (byte & 0x7f)
    shift++
    if (shift > 4) break // guard against corrupt files
  } while (byte & 0x80)
  return { value, newPos: pos }
}

function writeVlq(value: number): number[] {
  if (value < 0x80) return [value]
  const bytes: number[] = []
  bytes.unshift(value & 0x7f)
  value >>= 7
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80)
    value >>= 7
  }
  return bytes
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/** Parse a .mid ArrayBuffer into one MidiTrackData per MIDI track (Type-0 returns 1 track). */
export function parseMidiFile(buffer: ArrayBuffer): MidiTrackData[] {
  const data = new Uint8Array(buffer)
  let pos = 0

  function readU16() { const v = (data[pos] << 8) | data[pos + 1]; pos += 2; return v }
  function readU32() { const v = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3]; pos += 4; return v >>> 0 }
  function readBytes(n: number) { const s = pos; pos += n; return data.slice(s, pos) }

  // Header chunk
  const hdrTag = String.fromCharCode(...readBytes(4))
  if (hdrTag !== 'MThd') throw new Error('Not a MIDI file')
  readU32() // header length (always 6)
  const format  = readU16()
  const nTracks = readU16()
  const ticksPerBeat = readU16()

  const results: MidiTrackData[] = []

  for (let ti = 0; ti < nTracks; ti++) {
    const trackTag = String.fromCharCode(...readBytes(4))
    if (trackTag !== 'MTrk') { pos += readU32(); continue }
    const trackLen = readU32()
    const trackEnd = pos + trackLen

    let tick = 0
    let trackName = `Track ${ti + 1}`
    const activeNotes = new Map<number, { startTick: number; velocity: number }>()
    const rawNotes: Array<{ startTick: number; durationTicks: number; pitch: number; velocity: number }> = []
    let runningStatus = 0

    while (pos < trackEnd) {
      const { value: delta, newPos } = readVlq(data, pos)
      pos = newPos
      tick += delta

      let statusByte = data[pos]

      // Running status
      if (statusByte & 0x80) {
        runningStatus = statusByte
        pos++
      } else {
        statusByte = runningStatus
      }

      const type    = statusByte >> 4
      const channel = statusByte & 0x0f

      if (statusByte === 0xff) {
        // Meta event
        const metaType = data[pos++]
        const { value: metaLen, newPos: mp } = readVlq(data, pos)
        pos = mp
        if (metaType === 0x03) {
          // Track name
          trackName = new TextDecoder().decode(data.slice(pos, pos + metaLen))
        }
        pos += metaLen
        runningStatus = 0
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        // SysEx
        const { value: sxLen, newPos: sp } = readVlq(data, pos)
        pos = sp + sxLen
        runningStatus = 0
      } else if (type === 0x9 && data[pos + 1] > 0) {
        // Note On
        const pitch = data[pos++]
        const velocity = data[pos++]
        activeNotes.set(pitch, { startTick: tick, velocity })
      } else if (type === 0x8 || (type === 0x9 && data[pos + 1] === 0)) {
        // Note Off (or Note On with vel=0)
        const pitch = data[pos++]
        pos++ // velocity
        const start = activeNotes.get(pitch)
        if (start) {
          rawNotes.push({ startTick: start.startTick, durationTicks: tick - start.startTick, pitch, velocity: start.velocity })
          activeNotes.delete(pitch)
        }
      } else {
        // Other channel messages — skip data bytes
        const dataBytes = [0x8,0x9,0xa,0xb,0xe].includes(type) ? 2 : 1
        pos += dataBytes
      }
    }

    pos = trackEnd // safety

    if (rawNotes.length === 0 && format === 1 && ti === 0) continue // skip tempo track

    // Convert ticks → beats
    const notes: MidiNote[] = rawNotes.map((n, i) => ({
      id: `n-${ti}-${i}`,
      startBeat:     n.startTick / ticksPerBeat,
      durationBeats: Math.max(0.0625, n.durationTicks / ticksPerBeat),
      pitch:         n.pitch,
      velocity:      n.velocity,
    }))

    const maxEnd = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0)

    results.push({
      name: trackName,
      notes,
      durationBeats: Math.max(maxEnd, 4),
    })
  }

  return results
}

// ─── Writer ───────────────────────────────────────────────────────────────────

/** Encode MidiNote[] into a Type-0 MIDI file ArrayBuffer. */
export function encodeMidiFile(notes: MidiNote[], bpm: number, ticksPerBeat = 480): ArrayBuffer {
  const msPerBeat = Math.round(60_000_000 / bpm) // microseconds per quarter note

  // Build events: note-on + note-off pairs, sorted by tick
  type MidiEvent = { tick: number; bytes: number[] }
  const events: MidiEvent[] = []

  for (const note of notes) {
    const startTick  = Math.round(note.startBeat * ticksPerBeat)
    const endTick    = Math.round((note.startBeat + note.durationBeats) * ticksPerBeat)
    const pitch      = Math.max(0, Math.min(127, note.pitch))
    const velocity   = Math.max(1, Math.min(127, note.velocity ?? 100))

    events.push({ tick: startTick, bytes: [0x90, pitch, velocity] })
    events.push({ tick: endTick,   bytes: [0x80, pitch, 0] })
  }

  events.sort((a, b) => a.tick - b.tick)

  // Track data: tempo meta + note events + end-of-track
  const trackBytes: number[] = []

  // Tempo meta event (at tick 0, delta=0)
  trackBytes.push(0x00) // delta
  trackBytes.push(0xff, 0x51, 0x03)
  trackBytes.push((msPerBeat >> 16) & 0xff, (msPerBeat >> 8) & 0xff, msPerBeat & 0xff)

  let prevTick = 0
  for (const ev of events) {
    const delta = ev.tick - prevTick
    prevTick = ev.tick
    trackBytes.push(...writeVlq(delta), ...ev.bytes)
  }

  // End of track
  trackBytes.push(0x00, 0xff, 0x2f, 0x00)

  // Build full SMF
  const totalBytes = 14 + 8 + trackBytes.length
  const buf = new ArrayBuffer(totalBytes)
  const view = new DataView(buf)
  let o = 0

  // Header chunk
  'MThd'.split('').forEach(c => view.setUint8(o++, c.charCodeAt(0)))
  view.setUint32(o, 6); o += 4                      // header length
  view.setUint16(o, 0); o += 2                       // format 0
  view.setUint16(o, 1); o += 2                       // 1 track
  view.setUint16(o, ticksPerBeat); o += 2            // ticks per beat

  // Track chunk
  'MTrk'.split('').forEach(c => view.setUint8(o++, c.charCodeAt(0)))
  view.setUint32(o, trackBytes.length); o += 4
  trackBytes.forEach(b => view.setUint8(o++, b))

  return buf
}

/** Trigger a browser download of a MIDI file. */
export function downloadMidiFile(notes: MidiNote[], bpm: number, filename: string) {
  const buf = encodeMidiFile(notes, bpm)
  const blob = new Blob([buf], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.mid') ? filename : filename + '.mid'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 1000)
}
