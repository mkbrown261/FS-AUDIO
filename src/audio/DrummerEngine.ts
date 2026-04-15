/**
 * FS-AUDIO DrummerEngine
 * Logic Pro-style algorithmic drum pattern generator.
 * Generates realistic MIDI drum patterns from genre presets,
 * complexity, fill density, and swing — outputs MidiNote[].
 */

import { MidiNote } from '../store/projectStore'

// GM Drum map (General MIDI standard)
export const GM_DRUMS: Record<string, number> = {
  kick:        36,  // Bass Drum 1
  kick2:       35,  // Bass Drum 2
  snare:       38,  // Acoustic Snare
  snareRim:    37,  // Side Stick
  snareGhost:  38,
  closedHat:   42,  // Closed Hi-Hat
  openHat:     46,  // Open Hi-Hat
  pedalHat:    44,  // Pedal Hi-Hat
  hatEdge:     42,
  ride:        51,  // Ride Cymbal
  rideBell:    53,  // Ride Bell
  crash:       49,  // Crash Cymbal 1
  crash2:      57,  // Crash Cymbal 2
  hiTom:       50,  // High Floor Tom
  midTom:      47,  // Low-Mid Tom
  lowTom:      43,  // High Floor Tom
  floorTom:    41,  // Low Floor Tom
  tamb:        54,  // Tambourine
  clap:        39,  // Hand Clap
  cowbell:     56,  // Cowbell
  shaker:      70,  // Maracas
  rimshot:     37,
  china:       52,  // Chinese Cymbal
  openHat2:    46,
}

export type DrummerGenre =
  | 'pop' | 'rock' | 'hiphop' | 'jazz' | 'funk'
  | 'rnb' | 'edm' | 'trap' | 'latin' | 'metal'
  | 'reggae' | 'bossa' | 'shuffle' | 'brushes'

export interface DrummerParams {
  genre: DrummerGenre
  bars: number          // 1, 2, 4 (default 2)
  complexity: number    // 0-1  (0 = simple, 1 = busy)
  fillDensity: number   // 0-1  (fill frequency, 0 = none)
  swing: number         // 0-1  (0 = straight, 1 = full shuffle)
  humanize: number      // 0-1  (timing + velocity randomness)
  kickVariation: number // 0-1
  snareVariation: number
  hatVariation: number
  hihat: 'closed' | 'open' | 'ride' | 'mixed'
  addPercussion: boolean
  bpm: number           // for feel reference only (used for swing calc)
}

export const DRUMMER_DEFAULTS: DrummerParams = {
  genre: 'pop',
  bars: 2,
  complexity: 0.5,
  fillDensity: 0.3,
  swing: 0,
  humanize: 0.15,
  kickVariation: 0.4,
  snareVariation: 0.3,
  hatVariation: 0.5,
  hihat: 'closed',
  addPercussion: false,
  bpm: 120,
}

// ── Internal pattern cell: 16th note resolution ──────────────────────────────
interface Cell {
  pitch: number
  vel: number     // 0 = silent
  prob: number    // 0-1 probability this cell fires
}

type Grid = Cell[][]  // [voice][step] where steps are 16th notes

// ── Genre pattern libraries ───────────────────────────────────────────────────
// Each pattern is 16 steps (1 bar of 16ths). vel 0 = off.
// Arrays: [kick, snare, closedHat, openHat, ride, crash, hiTom, midTom, lowTom, clap]

interface PatternLib {
  kick:  number[]   // velocity per 16th (0=off)
  snare: number[]
  hat:   number[]
  ohat:  number[]
  ride:  number[]
  crash: number[]
  toms:  number[][]  // hi/mid/low tom rows
  extra: { pitch: number; vel: number }[][]  // additional percussion hits
}

function mk16(hits: [number, number][]): number[] {
  const row = new Array(16).fill(0)
  for (const [step, vel] of hits) row[step] = vel
  return row
}

// Patterns are 16-step (1 bar). Generator repeats/extends to `bars`.
const PATTERNS: Record<DrummerGenre, PatternLib> = {
  pop: {
    kick:  mk16([[0,100],[6,80],[8,100],[14,70]]),
    snare: mk16([[4,110],[12,110]]),
    hat:   mk16([[0,80],[2,70],[4,80],[6,70],[8,80],[10,70],[12,80],[14,70]]),
    ohat:  mk16([[6,90],[14,85]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,100]]),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[]],
  },
  rock: {
    kick:  mk16([[0,110],[2,70],[8,110],[10,80],[14,70]]),
    snare: mk16([[4,120],[12,120]]),
    hat:   mk16([[0,90],[2,85],[4,90],[6,85],[8,90],[10,85],[12,90],[14,85]]),
    ohat:  mk16([[7,90],[15,90]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,110]]),
    toms:  [mk16([[11,90],[12,80]]), mk16([[13,90]]), mk16([[14,100]])],
    extra: [[]],
  },
  hiphop: {
    kick:  mk16([[0,110],[5,90],[8,100],[11,70],[14,80]]),
    snare: mk16([[4,100],[12,90],[15,60]]),
    hat:   mk16([[0,70],[2,65],[4,70],[6,65],[8,70],[10,65],[12,70],[14,65]]),
    ohat:  mk16([[2,80],[6,80],[10,80],[14,80]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,90]]),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[{pitch:GM_DRUMS.clap,vel:80},{pitch:GM_DRUMS.clap,vel:80}]],
  },
  jazz: {
    kick:  mk16([[0,75],[6,65],[10,70],[14,60]]),
    snare: mk16([[4,70],[8,65],[12,80],[14,60]]),
    hat:   new Array(16).fill(0),
    ohat:  new Array(16).fill(0),
    ride:  mk16([[0,80],[1,70],[2,75],[3,65],[4,80],[5,70],[6,75],[7,65],
                 [8,80],[9,70],[10,75],[11,65],[12,80],[13,70],[14,75],[15,65]]),
    crash: new Array(16).fill(0),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[]],
  },
  funk: {
    kick:  mk16([[0,110],[3,70],[8,100],[11,65],[13,80]]),
    snare: mk16([[4,100],[7,75],[12,100],[15,80]]),
    hat:   mk16([[0,85],[1,75],[2,80],[3,70],[4,85],[5,75],[6,80],[7,70],
                 [8,85],[9,75],[10,80],[11,70],[12,85],[13,75],[14,80],[15,70]]),
    ohat:  mk16([[2,90],[6,90],[10,90],[14,90]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,100]]),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[{pitch:GM_DRUMS.clap,vel:80}]],
  },
  rnb: {
    kick:  mk16([[0,105],[3,80],[8,105],[11,75]]),
    snare: mk16([[4,105],[12,105],[14,75]]),
    hat:   mk16([[0,75],[2,68],[4,75],[6,68],[8,75],[10,68],[12,75],[14,68]]),
    ohat:  mk16([[6,85],[14,85]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,90]]),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[]],
  },
  edm: {
    kick:  mk16([[0,120],[4,120],[8,120],[12,120]]),
    snare: mk16([[4,110],[12,110]]),
    hat:   mk16([[0,80],[2,75],[4,80],[6,75],[8,80],[10,75],[12,80],[14,75]]),
    ohat:  mk16([[6,100],[14,100]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,115]]),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[]],
  },
  trap: {
    kick:  mk16([[0,110],[6,80],[9,90],[14,75]]),
    snare: mk16([[4,90],[12,90]]),
    hat:   mk16([[0,70],[1,65],[2,68],[3,65],[4,70],[5,65],[6,68],[7,65],
                 [8,70],[9,65],[10,68],[11,65],[12,70],[13,65],[14,68],[15,65]]),
    ohat:  mk16([[7,85],[15,85]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,100]]),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[]],
  },
  latin: {
    kick:  mk16([[0,100],[3,80],[7,90],[10,85]]),
    snare: mk16([[4,90],[8,85],[12,90]]),
    hat:   mk16([[0,80],[2,70],[4,80],[6,70],[8,80],[10,70],[12,80],[14,70]]),
    ohat:  new Array(16).fill(0),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,90]]),
    toms:  [mk16([[2,80],[10,75]]), mk16([[6,85]]), new Array(16).fill(0)],
    extra: [[{pitch:GM_DRUMS.cowbell,vel:90},{pitch:GM_DRUMS.tamb,vel:70}]],
  },
  metal: {
    kick:  mk16([[0,120],[2,100],[4,120],[6,100],[8,120],[10,100],[12,120],[14,100]]),
    snare: mk16([[4,120],[12,120]]),
    hat:   mk16([[0,90],[1,85],[2,90],[3,85],[4,90],[5,85],[6,90],[7,85],
                 [8,90],[9,85],[10,90],[11,85],[12,90],[13,85],[14,90],[15,85]]),
    ohat:  new Array(16).fill(0),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,120]]),
    toms:  [mk16([[11,110],[12,100]]), mk16([[13,110]]), mk16([[14,120]])],
    extra: [[]],
  },
  reggae: {
    kick:  mk16([[0,100],[10,90]]),
    snare: mk16([[8,100]]),
    hat:   mk16([[0,80],[4,75],[8,80],[12,75]]),
    ohat:  mk16([[2,90],[6,90],[10,90],[14,90]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,85]]),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[]],
  },
  bossa: {
    kick:  mk16([[0,80],[3,70],[7,75],[10,72]]),
    snare: mk16([[2,65],[6,70],[10,65],[14,70]]),
    hat:   new Array(16).fill(0),
    ohat:  new Array(16).fill(0),
    ride:  mk16([[0,75],[2,68],[4,75],[6,68],[8,75],[10,68],[12,75],[14,68]]),
    crash: new Array(16).fill(0),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[{pitch:GM_DRUMS.tamb,vel:70},{pitch:GM_DRUMS.shaker,vel:60}]],
  },
  shuffle: {
    kick:  mk16([[0,110],[6,80],[8,100],[14,70]]),
    snare: mk16([[4,110],[12,110]]),
    hat:   mk16([[0,85],[2,60],[4,85],[6,60],[8,85],[10,60],[12,85],[14,60]]),
    ohat:  mk16([[6,90],[14,90]]),
    ride:  new Array(16).fill(0),
    crash: mk16([[0,95]]),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[]],
  },
  brushes: {
    kick:  mk16([[0,75],[8,70]]),
    snare: mk16([[4,65],[12,65]]),
    hat:   new Array(16).fill(0),
    ohat:  new Array(16).fill(0),
    ride:  mk16([[0,70],[1,60],[2,65],[3,60],[4,70],[5,60],[6,65],[7,60],
                 [8,70],[9,60],[10,65],[11,60],[12,70],[13,60],[14,65],[15,60]]),
    crash: new Array(16).fill(0),
    toms:  [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)],
    extra: [[]],
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rnd(lo = 0, hi = 1) { return lo + Math.random() * (hi - lo) }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function clampVel(v: number) { return Math.max(1, Math.min(127, Math.round(v))) }

/** Apply swing to a 16th-note step index. Returns fractional beat offset. */
function swingOffset(step: number, swing: number): number {
  // Swing delays every odd 16th note
  if (step % 2 === 1) return swing * (1 / 6)  // up to 1/6 beat delay
  return 0
}

// ── Core Generator ────────────────────────────────────────────────────────────
export function generateDrumPattern(params: DrummerParams): MidiNote[] {
  const lib = PATTERNS[params.genre]
  const stepsPerBar = 16
  const totalSteps = stepsPerBar * params.bars
  const stepDur = 1 / 4  // 16th note = 0.25 beats
  const notes: MidiNote[] = []
  let noteId = 0

  const addNote = (step: number, pitch: number, vel: number) => {
    const jitter = params.humanize > 0
      ? (Math.random() - 0.5) * params.humanize * 0.08  // ± beats
      : 0
    const velJitter = params.humanize > 0
      ? (Math.random() - 0.5) * params.humanize * 18
      : 0
    const startBeat = step * stepDur + swingOffset(step, params.swing) + jitter
    notes.push({
      id: `drummer-${noteId++}`,
      pitch,
      velocity: clampVel(vel + velJitter),
      startBeat: Math.max(0, startBeat),
      durationBeats: stepDur * 0.9,
    })
  }

  // ── Build variation arrays (probability-weighted alternatives) ───────────────
  const buildRow = (base: number[], variation: number, bars: number): number[] => {
    const out: number[] = []
    for (let b = 0; b < bars; b++) {
      for (let s = 0; s < stepsPerBar; s++) {
        let vel = base[s] ?? 0
        if (vel > 0 && Math.random() < variation * 0.3) vel = 0      // drop hit
        if (vel === 0 && Math.random() < variation * 0.15) {
          // ghost / extra hit
          vel = Math.round(rnd(40, 75))
        }
        out.push(vel)
      }
    }
    return out
  }

  const kicks  = buildRow(lib.kick,  params.kickVariation,  params.bars)
  const snares = buildRow(lib.snare, params.snareVariation, params.bars)

  // Hat selection
  let hatBase = lib.hat
  if (params.hihat === 'open')  hatBase = lib.ohat.map((v, i) => v || lib.hat[i % stepsPerBar])
  if (params.hihat === 'ride')  hatBase = lib.ride
  if (params.hihat === 'mixed') hatBase = lib.hat.map((v, i) => (i % 4 === 2 ? (lib.ohat[i] || v) : v))
  const hats = buildRow(hatBase, params.hatVariation, params.bars)

  // ── Emit notes ────────────────────────────────────────────────────────────────
  for (let step = 0; step < totalSteps; step++) {
    const s = step % stepsPerBar

    if (kicks[step])  addNote(step, GM_DRUMS.kick,        kicks[step])
    if (snares[step]) addNote(step, GM_DRUMS.snare,       snares[step])
    if (hats[step]) {
      const hPitch = params.hihat === 'ride'
        ? GM_DRUMS.ride
        : (lib.ohat[s] && params.hihat !== 'closed' ? GM_DRUMS.openHat : GM_DRUMS.closedHat)
      addNote(step, hPitch, hats[step])
    }

    // Open hat on up-beats (when hat is mixed or open)
    if ((params.hihat === 'mixed' || params.hihat === 'open') && lib.ohat[s]) {
      addNote(step, GM_DRUMS.openHat, lib.ohat[s])
    }

    // Crash on bar 1 beat 1
    if (step === 0 && lib.crash[0]) {
      addNote(0, GM_DRUMS.crash, lib.crash[0])
    }

    // Toms
    lib.toms.forEach((tomRow, t) => {
      const pitch = [GM_DRUMS.hiTom, GM_DRUMS.midTom, GM_DRUMS.lowTom][t]
      if (tomRow[s]) addNote(step, pitch, tomRow[s])
    })

    // Extra percussion (cowbell, tamb, etc.) — lower probability
    if (params.addPercussion) {
      for (const bar of lib.extra) {
        for (const hit of bar) {
          if (Math.random() < 0.25) addNote(step, hit.pitch, hit.vel)
        }
      }
    }
  }

  // ── Complexity extras: ghost notes + fills ────────────────────────────────────
  if (params.complexity > 0.4) {
    const ghostCount = Math.floor(params.complexity * 4 * params.bars)
    for (let g = 0; g < ghostCount; g++) {
      const step = Math.floor(Math.random() * totalSteps)
      const vel = clampVel(rnd(30, 60))
      addNote(step, GM_DRUMS.snareRim, vel)
    }
  }

  // Fills at end of every 2nd bar
  if (params.fillDensity > 0) {
    for (let bar = 1; bar < params.bars; bar++) {
      if (Math.random() < params.fillDensity) {
        const fillStart = (bar * stepsPerBar) + 12   // last beat of bar
        const fillPitches = [GM_DRUMS.snare, GM_DRUMS.hiTom, GM_DRUMS.midTom, GM_DRUMS.lowTom]
        for (let f = fillStart; f < (bar + 1) * stepsPerBar; f++) {
          if (Math.random() < 0.65) {
            addNote(f, pick(fillPitches), clampVel(rnd(85, 115)))
          }
        }
      }
    }
  }

  return notes.sort((a, b) => a.startBeat - b.startBeat)
}

export const DRUMMER_GENRES: { value: DrummerGenre; label: string; emoji: string }[] = [
  { value: 'pop',     label: 'Pop',        emoji: '🎵' },
  { value: 'rock',    label: 'Rock',       emoji: '🎸' },
  { value: 'hiphop',  label: 'Hip-Hop',    emoji: '🎤' },
  { value: 'trap',    label: 'Trap',       emoji: '🔊' },
  { value: 'rnb',     label: 'R&B',        emoji: '🎶' },
  { value: 'funk',    label: 'Funk',       emoji: '🕺' },
  { value: 'jazz',    label: 'Jazz',       emoji: '🎷' },
  { value: 'edm',     label: 'EDM',        emoji: '⚡' },
  { value: 'latin',   label: 'Latin',      emoji: '🥁' },
  { value: 'metal',   label: 'Metal',      emoji: '🤘' },
  { value: 'reggae',  label: 'Reggae',     emoji: '🌴' },
  { value: 'bossa',   label: 'Bossa Nova', emoji: '🎻' },
  { value: 'shuffle', label: 'Shuffle',    emoji: '🔀' },
  { value: 'brushes', label: 'Brushes',    emoji: '🖌️' },
]
