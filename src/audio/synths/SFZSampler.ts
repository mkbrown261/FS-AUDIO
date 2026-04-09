/**
 * SFZSampler
 *
 * Self-contained SFZ parser + player. No external npm packages.
 * Uses SampleCacheManager for sample fetching/caching (Electron: disk cache;
 * browser/dev: direct fetch).
 *
 * Supports:
 *  - <global> / <group> / <region> headers
 *  - All common opcodes (sample, lokey/hikey, lovel/hivel, pitch_keycenter,
 *    volume, pan, tune, transpose, loop_mode, loop_start/end, ampeg_attack/release)
 *  - seq_position round-robin (plays a different recorded take each note)
 *  - async noteOn — waits for samples to finish loading before playing
 */

import { SampleCacheManager, ProgressCallback } from '../SampleCacheManager'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface SFZRegion {
  sample?:          string
  lokey?:           number
  hikey?:           number
  lovel?:           number
  hivel?:           number
  pitch_keycenter?: number
  volume?:          number
  pan?:             number
  loop_mode?:       string
  loop_start?:      number
  loop_end?:        number
  tune?:            number
  transpose?:       number
  ampeg_attack?:    number
  ampeg_release?:   number
  seq_position?:    number   // round-robin index (1-based)
}

interface SFZGroup {
  groupDefaults: Partial<SFZRegion>
  seqLength:     number          // max seq_position in group
  seqCounter:    number          // current round-robin counter
  regions:       SFZRegion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in SFZ parser
// ─────────────────────────────────────────────────────────────────────────────
function parseSFZ(content: string): { groups: SFZGroup[]; defaultPath: string } {
  const groups:     SFZGroup[] = []
  let currentGroup: SFZGroup | null = null
  let currentRegion: Partial<SFZRegion> | null = null
  let globalDefaults: Partial<SFZRegion> = {}
  let defaultPath = ''

  const toNum  = (v: string) => parseFloat(v)
  const toInt  = (v: string) => parseInt(v, 10)
  const toNote = (v: string): number => {
    const n = parseInt(v, 10)
    if (!isNaN(n)) return n
    const MAP: Record<string, number> = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 }
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
      case 'seq_position':     target.seq_position    = toInt(val);  break
    }
  }

  const applyOpcodeStr = (text: string, target: Partial<SFZRegion>) => {
    const re = /(\w+)\s*=\s*(.*?)(?=\s+\w+=|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) applyOpcode(target, m[1].trim(), m[2].trim())
  }

  const saveRegion = () => {
    if (currentRegion && currentGroup) {
      const r = currentRegion as SFZRegion
      currentGroup.regions.push(r)
      if (r.seq_position && r.seq_position > currentGroup.seqLength)
        currentGroup.seqLength = r.seq_position
    }
    currentRegion = null
  }

  // Strip // comments
  const lines = content.split('\n').map(l => l.replace(/\/\/.*$/, '').trim()).filter(Boolean)

  for (const line of lines) {
    // Split on header tags, keeping them as tokens
    const parts = line.split(/(?=<\w+>)/)
    for (const part of parts) {
      const t = part.trim()
      if (!t) continue

      if (t.startsWith('<control>')) {
        const dp = t.match(/default_path\s*=\s*([^\s]+)/)
        if (dp) defaultPath = dp[1].replace(/\\/g,'/').replace(/\/$/,'')
      } else if (t.startsWith('<global>')) {
        saveRegion(); globalDefaults = {}; currentGroup = null
        applyOpcodeStr(t.replace('<global>',''), globalDefaults)
      } else if (t.startsWith('<group>')) {
        saveRegion()
        currentGroup = { groupDefaults: { ...globalDefaults }, regions: [], seqLength: 1, seqCounter: 0 }
        groups.push(currentGroup); currentRegion = null
        applyOpcodeStr(t.replace('<group>',''), currentGroup.groupDefaults)
      } else if (t.startsWith('<region>')) {
        saveRegion()
        if (!currentGroup) {
          currentGroup = { groupDefaults: { ...globalDefaults }, regions: [], seqLength: 1, seqCounter: 0 }
          groups.push(currentGroup)
        }
        currentRegion = { ...globalDefaults, ...currentGroup.groupDefaults }
        applyOpcodeStr(t.replace('<region>',''), currentRegion)
      } else {
        const target = currentRegion ?? currentGroup?.groupDefaults ?? globalDefaults
        applyOpcodeStr(t, target)
      }
    }
  }
  saveRegion()

  return { groups, defaultPath }
}

// ─────────────────────────────────────────────────────────────────────────────
// SFZSampler
// ─────────────────────────────────────────────────────────────────────────────
export class SFZSampler {
  private ctx:         AudioContext
  private destination: AudioNode
  private groups:      SFZGroup[] = []
  private cache:       SampleCacheManager | null = null
  private activeNotes: Map<number, { source: AudioBufferSourceNode; gain: GainNode }[]> = new Map()

  // resolves when all samples are loaded
  private _ready: Promise<void> = Promise.resolve()

  // Tag we check in useAudioEngine to detect instrument change
  _loadedSfzPath = ''

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx         = ctx
    this.destination = destination
  }

  /**
   * Parse SFZ and start loading samples.
   * @param sfzContent     Raw SFZ text
   * @param samplesBaseUrl Local base URL (e.g. /sfz-instruments) — used for bundled instruments
   * @param remoteBaseUrl  GitHub raw URL — used for downloaded instruments
   * @param instrumentId   Unique ID for disk cache key
   * @param onProgress     Called with download progress
   */
  async loadSFZ(
    sfzContent:     string,
    samplesBaseUrl: string,
    remoteBaseUrl:  string,
    instrumentId:   string,
    onProgress?:    ProgressCallback,
  ) {
    const { groups, defaultPath } = parseSFZ(sfzContent)
    this.groups = groups

    const totalRegions = groups.reduce((s, g) => s + g.regions.length, 0)
    console.log(`[SFZ] Parsed ${groups.length} groups, ${totalRegions} regions. defaultPath="${defaultPath}"`)

    // Collect unique sample filenames
    const sampleFilenames = new Set<string>()
    for (const g of groups)
      for (const r of g.regions)
        if (r.sample) sampleFilenames.add(r.sample)

    console.log(`[SFZ] ${sampleFilenames.size} unique sample files`)

    // Decide where to fetch from:
    //   - remoteBaseUrl → download from GitHub and cache on disk
    //   - samplesBaseUrl → fetch locally (bundled)
    const effectiveBase = remoteBaseUrl || samplesBaseUrl

    this.cache = new SampleCacheManager(instrumentId || 'sfz', effectiveBase, onProgress)

    // Kick off async preload; noteOn awaits this._ready
    this._ready = this.cache.preloadSamples(this.ctx, [...sampleFilenames])
  }

  /** Play a note — waits for samples to be ready first */
  async noteOn(note: number, velocity: number = 127) {
    await this._ready   // blocks until samples decoded

    const now = this.ctx.currentTime

    for (const group of this.groups) {
      // Round-robin: only play the region whose seq_position matches counter
      const seq = group.seqLength > 1
        ? (group.seqCounter % group.seqLength) + 1   // 1-based
        : null

      let played = false

      for (const region of group.regions) {
        if (note     < (region.lokey ?? 0)   || note     > (region.hikey ?? 127)) continue
        if (velocity < (region.lovel ?? 0)   || velocity > (region.hivel ?? 127)) continue
        // seq_position filter
        if (seq !== null && region.seq_position !== undefined && region.seq_position !== seq) continue

        const sampleRef = region.sample
        if (!sampleRef) continue

        const filename = sampleRef.split('/').pop() ?? sampleRef
        const buffer   = this.cache
          ? (await this.cache.getSample(this.ctx, filename) ?? await this.cache.getSample(this.ctx, sampleRef))
          : null

        if (!buffer) {
          console.warn(`[SFZ] No buffer for "${sampleRef}" (note=${note})`)
          continue
        }

        // Build audio graph
        const source   = this.ctx.createBufferSource()
        source.buffer  = buffer

        const center = region.pitch_keycenter ?? note
        const semis  = note - center + (region.transpose ?? 0)
        source.playbackRate.value = Math.pow(2, (semis + (region.tune ?? 0) / 100) / 12)

        if (region.loop_mode === 'loop_continuous') {
          source.loop = true
          if (region.loop_start !== undefined) source.loopStart = region.loop_start / buffer.sampleRate
          if (region.loop_end   !== undefined) source.loopEnd   = region.loop_end   / buffer.sampleRate
        }

        const gainNode   = this.ctx.createGain()
        const volDb      = region.volume ?? 0
        const velFactor  = velocity / 127
        const targetGain = velFactor * Math.pow(10, volDb / 20)
        const attack     = region.ampeg_attack ?? 0.005
        gainNode.gain.setValueAtTime(0, now)
        gainNode.gain.linearRampToValueAtTime(targetGain, now + Math.max(attack, 0.002))

        const panner = this.ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, (region.pan ?? 0) / 100))

        source.connect(gainNode)
        gainNode.connect(panner)
        panner.connect(this.destination)
        source.start(now)

        if (!this.activeNotes.has(note)) this.activeNotes.set(note, [])
        this.activeNotes.get(note)!.push({ source, gain: gainNode })
        played = true
      }

      // Advance round-robin counter if we played something from this group
      if (played && group.seqLength > 1) group.seqCounter++
    }
  }

  noteOff(note: number) {
    const voices = this.activeNotes.get(note)
    if (!voices?.length) return
    const now = this.ctx.currentTime
    const rel = 0.08
    for (const { source, gain } of voices) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + rel)
      try { source.stop(now + rel + 0.05) } catch { /* already stopped */ }
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

  destroy() {
    this.allNotesOff()
    this.cache?.destroy()
  }

  getInfo() {
    return {
      groups:        this.groups.length,
      regions:       this.groups.reduce((s, g) => s + g.regions.length, 0),
      loadedSamples: this.cache ? 'managed by SampleCacheManager' : 0,
    }
  }
}
