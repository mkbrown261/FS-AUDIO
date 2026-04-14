/**
 * Arpeggiator — real-time MIDI arp processor
 *
 * Intercepts noteOn/noteOff calls and generates arpeggiated patterns.
 * All timing is driven by Web Audio API's AudioContext clock for sample-accurate scheduling.
 *
 * Params (all stored in Plugin.params so they're persisted with the project):
 *   rate      — 0.25 | 0.5 | 1 | 2 | 4   (note values: whole | half | quarter | 8th | 16th)
 *   pattern   — 'up' | 'down' | 'updown' | 'random' | 'played'
 *   octaves   — 1 | 2 | 3 | 4  (octave range)
 *   gate      — 0.05 – 1.0   (note duration as fraction of step)
 *   velocity  — 0 – 127 (0 = use input velocity, 1-127 = fixed)
 *   swing     — 0.0 – 0.5  (swing amount; 0 = straight, 0.5 = full dotted)
 *   enabled   — 1 | 0 (bypass)
 */

export type ArpPattern = 'up' | 'down' | 'updown' | 'random' | 'played'

export interface ArpParams {
  rate: number        // steps per beat (1 = quarter, 2 = 8th, 4 = 16th, 0.5 = half)
  pattern: ArpPattern
  octaves: number     // 1-4
  gate: number        // 0.05-1.0
  velocity: number    // 0 = input vel, 1-127 = fixed
  swing: number       // 0-0.5
  enabled: number     // 0|1
}

export const ARP_DEFAULTS: ArpParams = {
  rate:     2,        // 8th notes
  pattern:  'up',
  octaves:  1,
  gate:     0.7,
  velocity: 0,        // pass-through
  swing:    0,
  enabled:  1,
}

type NoteOnFn  = (pitch: number, velocity: number) => void
type NoteOffFn = (pitch: number) => void

export class Arpeggiator {
  private ctx: AudioContext
  private noteOn:  NoteOnFn
  private noteOff: NoteOffFn
  private params: ArpParams

  // ── note pool (held notes from user) ──────────────────────────────────────
  private heldNotes: { pitch: number; velocity: number }[] = []
  private heldVelocities = new Map<number, number>()

  // ── arp state ─────────────────────────────────────────────────────────────
  private stepIndex  = 0
  private direction  = 1           // 1 = ascending, -1 = descending (used by updown)
  private sequence:  number[] = [] // expanded pitch list including octave copies
  private lastPitch  = -1          // last pitched fired (for noteOff)

  // ── scheduler ─────────────────────────────────────────────────────────────
  private lookahead      = 0.05    // look ahead window in seconds
  private scheduleInterval = 0.025 // polling interval in seconds
  private nextNoteTime   = 0       // next step time in AudioContext clock
  private timerId: ReturnType<typeof setInterval> | null = null

  // ── BPM ref (passed in from engine) ──────────────────────────────────────
  private bpm = 120

  constructor(
    ctx: AudioContext,
    noteOn: NoteOnFn,
    noteOff: NoteOffFn,
    params: ArpParams,
    bpm = 120,
  ) {
    this.ctx     = ctx
    this.noteOn  = noteOn
    this.noteOff = noteOff
    this.params  = { ...ARP_DEFAULTS, ...params }
    this.bpm     = bpm
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Set live parameter (single key/value pair) */
  setParam<K extends keyof ArpParams>(key: K, value: ArpParams[K]) {
    this.params[key] = value
    this._rebuildSequence()
  }

  /** Replace all params at once (e.g., after loading a project) */
  setParams(p: Partial<ArpParams>) {
    Object.assign(this.params, p)
    this._rebuildSequence()
  }

  /** Update BPM from the engine */
  setBpm(bpm: number) { this.bpm = bpm }

  /** User pressed a key */
  pressNote(pitch: number, velocity: number) {
    if (!this.heldVelocities.has(pitch)) {
      this.heldNotes.push({ pitch, velocity })
      this.heldVelocities.set(pitch, velocity)
      this._rebuildSequence()
    }
    // Start arp on first note if not running
    if (!this.timerId) this._start()
  }

  /** User released a key */
  releaseNote(pitch: number) {
    this.heldNotes = this.heldNotes.filter(n => n.pitch !== pitch)
    this.heldVelocities.delete(pitch)
    this._rebuildSequence()
    if (this.heldNotes.length === 0) this._stop()
  }

  /** Kill all notes / stop the arp (panic) */
  allNotesOff() {
    this._stop()
    if (this.lastPitch >= 0) {
      this.noteOff(this.lastPitch)
      this.lastPitch = -1
    }
  }

  /** Whether the arp currently has anything to do */
  get isActive() { return this.heldNotes.length > 0 && !!this.timerId }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _start() {
    this.stepIndex   = 0
    this.direction   = 1
    this.nextNoteTime = this.ctx.currentTime
    this.timerId = setInterval(() => this._scheduler(), this.scheduleInterval * 1000)
  }

  private _stop() {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null }
    if (this.lastPitch >= 0) { this.noteOff(this.lastPitch); this.lastPitch = -1 }
  }

  private _rebuildSequence() {
    const sorted = [...this.heldNotes].sort((a, b) => a.pitch - b.pitch)
    const notes  = sorted.map(n => n.pitch)
    const octaves = Math.max(1, Math.min(4, Math.round(this.params.octaves)))
    const expanded: number[] = []

    for (let o = 0; o < octaves; o++) {
      for (const p of notes) {
        expanded.push(p + o * 12)
      }
    }

    this.sequence = expanded

    // Clamp stepIndex to new length
    if (this.sequence.length > 0) {
      this.stepIndex = this.stepIndex % this.sequence.length
    } else {
      this.stepIndex = 0
    }
  }

  private _scheduler() {
    if (!this.sequence.length) return

    const windowEnd = this.ctx.currentTime + this.lookahead

    while (this.nextNoteTime < windowEnd) {
      this._scheduleNote(this.nextNoteTime)
      this.nextNoteTime += this._stepDuration()
    }
  }

  private _stepDuration(): number {
    // rate is steps per beat (1 beat = 1 quarter note)
    // e.g. rate=2 → 8th note = 0.5 beats
    const beatsPerStep = 1 / Math.max(0.125, this.params.rate)
    const secondsPerBeat = 60 / this.bpm
    let duration = beatsPerStep * secondsPerBeat

    // Apply swing: every other step is lengthened/shortened
    const swing = Math.max(0, Math.min(0.49, this.params.swing))
    if (swing > 0) {
      const isOddStep = this.stepIndex % 2 === 0
      // Swing shifts time within a pair of notes:
      // even step gets extra swing, odd step gets less
      duration = isOddStep
        ? beatsPerStep * secondsPerBeat * (1 + swing * 2)
        : beatsPerStep * secondsPerBeat * (1 - swing * 2)
    }

    return duration
  }

  private _scheduleNote(time: number) {
    if (!this.sequence.length) return

    const pitch = this._nextPitch()
    const stepDur = this._stepDuration()
    const gate    = Math.max(0.05, Math.min(0.99, this.params.gate))
    const noteDur = stepDur * gate

    const vel = this.params.velocity > 0
      ? this.params.velocity
      : (this.heldVelocities.get(this.sequence[this.stepIndex] % 128) ?? 100)

    // Use AudioContext scheduling via the host's callbacks.
    // We pass the pitch immediately; the host engine must fire the actual
    // Web Audio events at `time`. Since noteOn/noteOff from the engine are
    // instantaneous JS calls (not AudioContext-scheduled), we use setTimeout
    // with the delta from currentTime to give as-good-as-possible timing.
    const delta      = Math.max(0, time - this.ctx.currentTime) * 1000

    const prevPitch = this.lastPitch
    this.lastPitch  = pitch

    setTimeout(() => {
      if (prevPitch >= 0) this.noteOff(prevPitch)
      this.noteOn(pitch, vel)
    }, delta)

    setTimeout(() => {
      if (this.lastPitch === pitch) {
        this.noteOff(pitch)
        // Don't clear lastPitch yet — next note will handle it
      }
    }, delta + noteDur * 1000)

    this._advanceStep()
  }

  private _nextPitch(): number {
    const seq = this.sequence
    if (!seq.length) return 60

    const idx = Math.max(0, Math.min(this.stepIndex, seq.length - 1))
    return Math.min(127, Math.max(0, seq[idx]))
  }

  private _advanceStep() {
    const len = this.sequence.length
    if (!len) { this.stepIndex = 0; return }

    switch (this.params.pattern) {
      case 'up':
        this.stepIndex = (this.stepIndex + 1) % len
        break

      case 'down':
        this.stepIndex = (this.stepIndex - 1 + len) % len
        break

      case 'updown':
        if (len <= 1) { this.stepIndex = 0; break }
        this.stepIndex += this.direction
        if (this.stepIndex >= len - 1) { this.direction = -1; this.stepIndex = len - 1 }
        else if (this.stepIndex <= 0)  { this.direction =  1; this.stepIndex = 0 }
        break

      case 'random':
        this.stepIndex = Math.floor(Math.random() * len)
        break

      case 'played':
        // notes in order they were pressed — heldNotes order
        this.stepIndex = (this.stepIndex + 1) % this.heldNotes.length
        break

      default:
        this.stepIndex = (this.stepIndex + 1) % len
    }
  }
}
