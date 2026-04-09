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
  ampeg_release?: number
}

interface SFZGroup {
  groupDefaults: Partial<SFZRegion>
  regions: SFZRegion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in SFZ parser — no external packages needed
// ─────────────────────────────────────────────────────────────────────────────
function parseSFZ(content: string): SFZGroup[] {
  const groups: SFZGroup[] = []
  let currentGroup: SFZGroup | null = null
  let currentRegion: Partial<SFZRegion> | null = null
  let globalDefaults: Partial<SFZRegion> = {}

  const toNum  = (v: string) => parseFloat(v)
  const toInt  = (v: string) => parseInt(v, 10)
  const toNote = (v: string): number => {
    const n = parseInt(v, 10)
    if (!isNaN(n)) return n
    const MAP: Record<string, number> = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }
    const m = v.match(/^([A-Ga-g])(#|b)?(-?\d+)$/)
    if (!m) return 60
    const base   = MAP[m[1].toUpperCase()] ?? 0
    const sharp  = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
    const octave = parseInt(m[3], 10)
    return (octave + 1) * 12 + base + sharp
  }

  const applyOpcode = (target: Partial<SFZRegion>, key: string, val: string) => {
    switch (key) {
      case 'sample':           target.sample          = val.replace(/\\/g, '/').trim(); break
      case 'lokey':            target.lokey           = toNote(val); break
      case 'hikey':            target.hikey           = toNote(val); break
      case 'key':              target.lokey = target.hikey = target.pitch_keycenter = toNote(val); break
      case 'lovel':            target.lovel           = toInt(val);  break
      case 'hivel':            target.hivel           = toInt(val);  break
      case 'pitch_keycenter':  target.pitch_keycenter = toNote(val); break
      case 'volume':           target.volume          = toNum(val);  break
      case 'pan':              target.pan             = toNum(val);  break
      case 'tune':             target.tune            = toNum(val);  break
      case 'transpose':        target.transpose       = toInt(val);  break
      case 'loop_mode':        target.loop_mode       = val.trim();  break
      case 'loop_start':       target.loop_start      = toInt(val);  break
      case 'loop_end':         target.loop_end        = toInt(val);  break
      case 'ampeg_attack':     target.ampeg_attack    = toNum(val);  break
      case 'ampeg_release':    target.ampeg_release   = toNum(val);  break
    }
  }

  // Strip // comments and split into lines
  const lines = content.split('\n')
    .map(l => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)

  const saveRegion = () => {
    if (currentRegion && currentGroup) {
      currentGroup.regions.push(currentRegion as SFZRegion)
      currentRegion = null
    }
  }

  for (const line of lines) {
    // A line may contain a header tag followed by opcodes, e.g.:
    //   <region> sample=foo.wav lokey=36 hikey=48
    // Split on header tags, keeping the delimiters
    const parts = line.split(/(?=<\w+>)/)

    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      if (trimmed.startsWith('<global>')) {
        saveRegion()
        globalDefaults = {}
        currentGroup  = null
        // parse any trailing opcodes
        parseOpcodes(trimmed.replace('<global>', ''), globalDefaults, applyOpcode)
      } else if (trimmed.startsWith('<group>')) {
        saveRegion()
        currentGroup  = { groupDefaults: { ...globalDefaults }, regions: [] }
        groups.push(currentGroup)
        currentRegion = null
        parseOpcodes(trimmed.replace('<group>', ''), currentGroup.groupDefaults, applyOpcode)
      } else if (trimmed.startsWith('<region>')) {
        saveRegion()
        if (!currentGroup) {
          currentGroup = { groupDefaults: { ...globalDefaults }, regions: [] }
          groups.push(currentGroup)
        }
        currentRegion = { ...globalDefaults, ...currentGroup.groupDefaults }
        parseOpcodes(trimmed.replace('<region>', ''), currentRegion, applyOpcode)
      } else {
        // Plain opcode line
        const target = currentRegion ?? (currentGroup?.groupDefaults) ?? globalDefaults
        parseOpcodes(trimmed, target, applyOpcode)
      }
    }
  }

  saveRegion()
  return groups
}

function parseOpcodes(
  text: string,
  target: Partial<SFZRegion>,
  apply: (t: Partial<SFZRegion>, k: string, v: string) => void
) {
  // Match key=value pairs; value runs until next key= or end of string
  const re = /(\w+)\s*=\s*(.*?)(?=\s+\w+=|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    apply(target, m[1].trim(), m[2].trim())
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SFZSampler
// ─────────────────────────────────────────────────────────────────────────────
export class SFZSampler {
  private ctx: AudioContext
  private destination: AudioNode
  private groups: SFZGroup[] = []
  // Stored under EVERY key variant so lookup always succeeds:
  //   "ep-c4.wav", "samples/ep-c4.wav", "/sfz-instruments/samples/ep-c4.wav"
  private audioBuffers: Map<string, AudioBuffer> = new Map()
  private activeNotes: Map<number, { source: AudioBufferSourceNode; gain: GainNode }[]> = new Map()

  // resolves when all samples are loaded — noteOn waits on this
  private _ready: Promise<void> = Promise.resolve()

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.destination = destination
  }

  /** Parse SFZ text and fetch all samples from samplesBaseUrl */
  async loadSFZ(sfzContent: string, samplesBaseUrl: string) {
    this.groups = parseSFZ(sfzContent)
    console.log(`[SFZ] Parsed ${this.groups.length} groups, ${this.totalRegions()} regions`)

    // Collect every unique sample path referenced in the SFZ
    const samplePaths = new Set<string>()
    for (const g of this.groups)
      for (const r of g.regions)
        if (r.sample) samplePaths.add(r.sample)

    console.log('[SFZ] Samples to fetch:', [...samplePaths])

    // Fetch & decode all samples, store under every key variant
    this._ready = (async () => {
      await Promise.all([...samplePaths].map(async (samplePath) => {
        // Build full URL: samplesBaseUrl + '/' + samplePath
        const url = samplesBaseUrl
          ? `${samplesBaseUrl}/${samplePath}`
          : `/${samplePath}`

        try {
          const resp = await fetch(url)
          if (!resp.ok) { console.warn(`[SFZ] HTTP ${resp.status} for ${url}`); return }
          const ab  = await resp.arrayBuffer()
          const buf = await this.ctx.decodeAudioData(ab)

          // Store under multiple keys so any lookup variant works
          const filename = samplePath.split('/').pop() ?? samplePath
          this.audioBuffers.set(filename, buf)         // "ep-c4.wav"
          this.audioBuffers.set(samplePath, buf)       // "samples/ep-c4.wav"
          console.log(`[SFZ] ✅ Decoded: ${filename}`)
        } catch (err) {
          console.error(`[SFZ] ❌ Failed to load sample "${url}":`, err)
        }
      }))
      console.log(`[SFZ] Ready — ${this.audioBuffers.size} samples loaded`)
    })()

    await this._ready
  }

  /** noteOn — waits for samples to be ready before playing */
  async noteOn(note: number, velocity: number = 127) {
    // If samples aren't ready yet, wait
    await this._ready

    const now = this.ctx.currentTime

    for (const group of this.groups) {
      for (const region of group.regions) {
        if (note < (region.lokey ?? 0)   || note > (region.hikey ?? 127))   continue
        if (velocity < (region.lovel ?? 0) || velocity > (region.hivel ?? 127)) continue

        const sampleRef = region.sample
        if (!sampleRef) continue

        // Try filename, then full relative path
        const filename = sampleRef.split('/').pop() ?? sampleRef
        const buffer   = this.audioBuffers.get(filename) ?? this.audioBuffers.get(sampleRef)

        if (!buffer) {
          console.warn(`[SFZ] Buffer not found for "${sampleRef}" (note ${note})`)
          continue
        }

        // --- Build audio graph ---
        const source = this.ctx.createBufferSource()
        source.buffer = buffer

        // Pitch shift
        const center = region.pitch_keycenter ?? note
        const semis  = note - center + (region.transpose ?? 0)
        const cents  = region.tune ?? 0
        source.playbackRate.value = Math.pow(2, (semis + cents / 100) / 12)

        // Looping
        if (region.loop_mode === 'loop_continuous') {
          source.loop = true
          if (region.loop_start !== undefined) source.loopStart = region.loop_start / buffer.sampleRate
          if (region.loop_end   !== undefined) source.loopEnd   = region.loop_end   / buffer.sampleRate
        }

        // Gain (velocity + dB volume)
        const gainNode  = this.ctx.createGain()
        const volDb     = region.volume ?? 0
        const velFactor = velocity / 127
        const targetGain = velFactor * Math.pow(10, volDb / 20)

        // Attack ramp
        const attack = region.ampeg_attack ?? 0.005
        gainNode.gain.setValueAtTime(0, now)
        gainNode.gain.linearRampToValueAtTime(targetGain, now + Math.max(attack, 0.002))

        // Pan
        const panner = this.ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, (region.pan ?? 0) / 100))

        source.connect(gainNode)
        gainNode.connect(panner)
        panner.connect(this.destination)
        source.start(now)

        if (!this.activeNotes.has(note)) this.activeNotes.set(note, [])
        this.activeNotes.get(note)!.push({ source, gain: gainNode })
      }
    }
  }

  noteOff(note: number) {
    const voices = this.activeNotes.get(note)
    if (!voices?.length) return

    const now     = this.ctx.currentTime
    const release = 0.08

    for (const { source, gain } of voices) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + release)
      try { source.stop(now + release + 0.05) } catch { /* already stopped */ }
    }
    this.activeNotes.delete(note)
  }

  allNotesOff() {
    const now = this.ctx.currentTime
    for (const voices of this.activeNotes.values())
      for (const { source, gain } of voices) {
        try {
          gain.gain.cancelScheduledValues(now)
          gain.gain.setValueAtTime(0, now)
          source.stop(now + 0.01)
        } catch { /* ignore */ }
      }
    this.activeNotes.clear()
  }

  private totalRegions() {
    return this.groups.reduce((s, g) => s + g.regions.length, 0)
  }

  getInfo() {
    return {
      groups:        this.groups.length,
      regions:       this.totalRegions(),
      loadedSamples: this.audioBuffers.size,
      activeVoices:  [...this.activeNotes.values()].reduce((s, v) => s + v.length, 0)
    }
  }
}
