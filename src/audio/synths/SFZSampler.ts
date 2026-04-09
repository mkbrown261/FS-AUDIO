// SFZ Sampler - Professional sample-based instrument
// Fully self-contained: NO external dependencies, built-in SFZ parser

interface SFZRegion {
  sample?: string
  lokey?: number
  hikey?: number
  lovel?: number
  hivel?: number
  pitch_keycenter?: number
  volume?: number
  pan?: number
  loop_mode?: string
  loop_start?: number
  loop_end?: number
  tune?: number
  transpose?: number
  ampeg_attack?: number
  ampeg_decay?: number
  ampeg_sustain?: number
  ampeg_release?: number
}

interface SFZGroup {
  groupDefaults: Partial<SFZRegion>
  regions: SFZRegion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in SFZ parser (no external packages)
// ─────────────────────────────────────────────────────────────────────────────
function parseSFZ(content: string): SFZGroup[] {
  const groups: SFZGroup[] = []
  let currentGroup: SFZGroup | null = null
  let currentRegion: Partial<SFZRegion> | null = null
  let globalDefaults: Partial<SFZRegion> = {}

  // Helpers
  const num  = (v: string) => parseFloat(v)
  const int  = (v: string) => parseInt(v, 10)
  const note = (v: string): number => {
    // Accept MIDI number or note name (e.g. "C4", "A#3")
    const n = parseInt(v, 10)
    if (!isNaN(n)) return n
    const NOTE_MAP: Record<string, number> = {
      C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
    }
    const m = v.match(/^([A-Ga-g])(#|b)?(-?\d+)$/)
    if (!m) return 60
    const base = NOTE_MAP[m[1].toUpperCase()] ?? 0
    const sharp = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
    const octave = parseInt(m[3], 10)
    return (octave + 1) * 12 + base + sharp
  }

  const applyOpcode = (target: Partial<SFZRegion>, key: string, val: string) => {
    switch (key) {
      case 'sample':           target.sample          = val.replace(/\\/g, '/').trim(); break
      case 'lokey':            target.lokey           = note(val); break
      case 'hikey':            target.hikey           = note(val); break
      case 'key':              target.lokey = target.hikey = target.pitch_keycenter = note(val); break
      case 'lovel':            target.lovel           = int(val); break
      case 'hivel':            target.hivel           = int(val); break
      case 'pitch_keycenter':  target.pitch_keycenter = note(val); break
      case 'volume':           target.volume          = num(val); break
      case 'pan':              target.pan             = num(val); break
      case 'tune':             target.tune            = num(val); break
      case 'transpose':        target.transpose       = int(val); break
      case 'loop_mode':        target.loop_mode       = val.trim(); break
      case 'loop_start':       target.loop_start      = int(val); break
      case 'loop_end':         target.loop_end        = int(val); break
      case 'ampeg_attack':     target.ampeg_attack    = num(val); break
      case 'ampeg_decay':      target.ampeg_decay     = num(val); break
      case 'ampeg_sustain':    target.ampeg_sustain   = num(val); break
      case 'ampeg_release':    target.ampeg_release   = num(val); break
    }
  }

  // Strip line-comments (//)
  const lines = content.split('\n').map(l => l.replace(/\/\/.*$/, '').trim()).filter(Boolean)

  for (const rawLine of lines) {
    // Find all header tags and opcodes on one line
    // Tokenise into [<header>, opcode=value, opcode=value, ...]
    const tokens = rawLine.split(/(<\w+>)/).map(t => t.trim()).filter(Boolean)

    for (const token of tokens) {
      if (token === '<global>') {
        globalDefaults = {}
        currentGroup  = null
        currentRegion = null
      } else if (token === '<group>') {
        // Save previous region
        if (currentRegion && currentGroup) {
          currentGroup.regions.push(currentRegion as SFZRegion)
        }
        currentGroup  = { groupDefaults: { ...globalDefaults }, regions: [] }
        currentRegion = null
        groups.push(currentGroup)
      } else if (token === '<region>') {
        // Save previous region
        if (currentRegion && currentGroup) {
          currentGroup.regions.push(currentRegion as SFZRegion)
        }
        // Start new region inheriting group + global defaults
        if (!currentGroup) {
          currentGroup = { groupDefaults: { ...globalDefaults }, regions: [] }
          groups.push(currentGroup)
        }
        currentRegion = { ...globalDefaults, ...currentGroup.groupDefaults }
      } else {
        // Parse key=value opcodes (may be multiple on one token split by spaces)
        // e.g. "sample=samples/808-kick.wav pitch_keycenter=36 lokey=24 hikey=38"
        const pairs = token.match(/(\w+)\s*=\s*([^\s=]+(?:\s+[^\s=<>]+(?=\s+\w+\s*=|$))*)/g) || []
        for (const pair of pairs) {
          const eq = pair.indexOf('=')
          if (eq === -1) continue
          const k = pair.substring(0, eq).trim()
          const v = pair.substring(eq + 1).trim()
          if (currentRegion) {
            applyOpcode(currentRegion, k, v)
          } else if (currentGroup && !currentRegion) {
            applyOpcode(currentGroup.groupDefaults, k, v)
          } else {
            applyOpcode(globalDefaults, k, v)
          }
        }
      }
    }
  }

  // Push last region
  if (currentRegion && currentGroup) {
    currentGroup.regions.push(currentRegion as SFZRegion)
  }

  return groups
}

// ─────────────────────────────────────────────────────────────────────────────
// SFZSampler class
// ─────────────────────────────────────────────────────────────────────────────
export class SFZSampler {
  private ctx: AudioContext
  private destination: AudioNode
  private groups: SFZGroup[] = []
  private audioBuffers: Map<string, AudioBuffer> = new Map()
  private activeNotes: Map<number, { source: AudioBufferSourceNode; gain: GainNode }[]> = new Map()
  private basePath: string = ''

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.destination = destination
  }

  // ── Parse & store SFZ ────────────────────────────────────────────────────
  async loadSFZ(sfzContent: string, basePath: string = '') {
    this.basePath = basePath
    try {
      this.groups = parseSFZ(sfzContent)
      console.log(`[SFZ] Parsed ${this.groups.length} groups, ${this.getTotalRegions()} regions`)
    } catch (err) {
      console.error('[SFZ] Parse error:', err)
      throw err
    }
  }

  // ── Decode and cache a sample ArrayBuffer ────────────────────────────────
  async loadSample(name: string, audioData: ArrayBuffer) {
    try {
      // decodeAudioData consumes the buffer, so clone it
      const copy = audioData.slice(0)
      const buffer = await this.ctx.decodeAudioData(copy)
      // Store under both the plain filename AND possible sub-path variants
      const filename = name.split('/').pop() ?? name
      this.audioBuffers.set(filename, buffer)
      this.audioBuffers.set(name, buffer)
      console.log(`[SFZ] Decoded sample: ${filename}`)
    } catch (err) {
      console.error(`[SFZ] Failed to decode sample "${name}":`, err)
    }
  }

  // ── noteOn ────────────────────────────────────────────────────────────────
  noteOn(note: number, velocity: number = 127) {
    const now = this.ctx.currentTime

    for (const group of this.groups) {
      for (const region of group.regions) {
        const lokey = region.lokey ?? 0
        const hikey = region.hikey ?? 127
        const lovel = region.lovel ?? 0
        const hivel = region.hivel ?? 127

        if (note < lokey || note > hikey) continue
        if (velocity < lovel || velocity > hivel) continue

        const sampleRef = region.sample
        if (!sampleRef) continue

        // Try exact key, then filename only
        const filename = sampleRef.split('/').pop() ?? sampleRef
        const buffer = this.audioBuffers.get(filename) ?? this.audioBuffers.get(sampleRef)
        if (!buffer) {
          console.warn(`[SFZ] Sample not loaded: "${sampleRef}" (key=${note})`)
          continue
        }

        // --- Create nodes ---
        const source = this.ctx.createBufferSource()
        source.buffer = buffer

        // Pitch shift
        const center = region.pitch_keycenter ?? note
        const semis  = note - center + (region.transpose ?? 0)
        const cents  = (region.tune ?? 0)
        source.playbackRate.value = Math.pow(2, (semis + cents / 100) / 12)

        // Looping
        if (region.loop_mode === 'loop_continuous') {
          source.loop = true
          if (region.loop_start !== undefined) source.loopStart = region.loop_start / buffer.sampleRate
          if (region.loop_end   !== undefined) source.loopEnd   = region.loop_end   / buffer.sampleRate
        }

        // Amplitude
        const gainNode = this.ctx.createGain()
        const volDb    = region.volume ?? 0
        const velFac   = velocity / 127
        gainNode.gain.value = velFac * Math.pow(10, volDb / 20)

        // Panning
        const panner = this.ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, (region.pan ?? 0) / 100))

        // Attack envelope (smooth start)
        const attack = region.ampeg_attack ?? 0.005
        gainNode.gain.setValueAtTime(0, now)
        gainNode.gain.linearRampToValueAtTime(velFac * Math.pow(10, volDb / 20), now + attack)

        source.connect(gainNode)
        gainNode.connect(panner)
        panner.connect(this.destination)
        source.start(now)

        if (!this.activeNotes.has(note)) this.activeNotes.set(note, [])
        this.activeNotes.get(note)!.push({ source, gain: gainNode })
      }
    }
  }

  // ── noteOff ───────────────────────────────────────────────────────────────
  noteOff(note: number) {
    const voices = this.activeNotes.get(note)
    if (!voices?.length) return

    const now     = this.ctx.currentTime
    const release = 0.08

    for (const { source, gain } of voices) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + release)
      try { source.stop(now + release + 0.05) } catch { /* already stopped */ }
    }

    this.activeNotes.delete(note)
  }

  // ── allNotesOff ───────────────────────────────────────────────────────────
  allNotesOff() {
    const now = this.ctx.currentTime
    for (const voices of this.activeNotes.values()) {
      for (const { source, gain } of voices) {
        try {
          gain.gain.cancelScheduledValues(now)
          gain.gain.setValueAtTime(0, now)
          source.stop(now + 0.01)
        } catch { /* ignore */ }
      }
    }
    this.activeNotes.clear()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private getTotalRegions() {
    return this.groups.reduce((s, g) => s + g.regions.length, 0)
  }

  getInfo() {
    return {
      groups:        this.groups.length,
      regions:       this.getTotalRegions(),
      loadedSamples: this.audioBuffers.size,
      activeVoices:  Array.from(this.activeNotes.values()).reduce((s, v) => s + v.length, 0)
    }
  }
}
