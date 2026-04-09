// SFZ Sampler - Professional sample-based instrument
// Supports loading SFZ libraries (orchestral, drums, guitars, etc.)

import * as sfzParser from 'sfz-parser'

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
}

interface SFZGroup {
  regions: SFZRegion[]
}

export class SFZSampler {
  private ctx: AudioContext
  private destination: AudioNode
  private groups: SFZGroup[] = []
  private audioBuffers: Map<string, AudioBuffer> = new Map()
  private activeNotes: Map<number, { source: AudioBufferSourceNode, gain: GainNode }[]> = new Map()
  private basePath: string = ''

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.destination = destination
  }

  /**
   * Load an SFZ file and its samples
   * @param sfzContent The SFZ file content as string
   * @param basePath Base path for loading samples (e.g., '/samples/piano/')
   */
  async loadSFZ(sfzContent: string, basePath: string = '') {
    this.basePath = basePath
    
    try {
      // Parse the SFZ file
      const parsed = sfzParser.parse(sfzContent)
      console.log('[SFZ] Parsed SFZ file:', parsed)
      
      // Convert parsed data to our format
      this.groups = this.convertParsedData(parsed)
      
      console.log(`[SFZ] Loaded ${this.groups.length} groups with ${this.getTotalRegions()} regions`)
    } catch (error) {
      console.error('[SFZ] Failed to parse SFZ file:', error)
      throw error
    }
  }

  private convertParsedData(parsed: any): SFZGroup[] {
    const groups: SFZGroup[] = []
    
    // Simple conversion - handle basic SFZ structure
    if (parsed && Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.regions) {
          groups.push({
            regions: item.regions.map((r: any) => this.convertRegion(r))
          })
        }
      }
    }
    
    return groups
  }

  private convertRegion(region: any): SFZRegion {
    return {
      sample: region.sample,
      lokey: region.lokey ?? 0,
      hikey: region.hikey ?? 127,
      lovel: region.lovel ?? 0,
      hivel: region.hivel ?? 127,
      pitch_keycenter: region.pitch_keycenter ?? region.lokey ?? 60,
      volume: region.volume ?? 0,
      pan: region.pan ?? 0,
      loop_mode: region.loop_mode,
      loop_start: region.loop_start,
      loop_end: region.loop_end,
      tune: region.tune ?? 0,
      transpose: region.transpose ?? 0
    }
  }

  private getTotalRegions(): number {
    return this.groups.reduce((sum, g) => sum + g.regions.length, 0)
  }

  /**
   * Load a sample file for a region
   */
  async loadSample(samplePath: string, audioData: ArrayBuffer) {
    try {
      const buffer = await this.ctx.decodeAudioData(audioData)
      this.audioBuffers.set(samplePath, buffer)
      console.log(`[SFZ] Loaded sample: ${samplePath}`)
    } catch (error) {
      console.error(`[SFZ] Failed to load sample ${samplePath}:`, error)
    }
  }

  /**
   * Play a note
   */
  noteOn(note: number, velocity: number = 127) {
    const now = this.ctx.currentTime
    
    // Find matching regions for this note/velocity
    for (const group of this.groups) {
      for (const region of group.regions) {
        // Check if note and velocity match this region
        if (note >= (region.lokey ?? 0) && 
            note <= (region.hikey ?? 127) &&
            velocity >= (region.lovel ?? 0) &&
            velocity <= (region.hivel ?? 127)) {
          
          const sample = region.sample
          if (!sample) continue
          
          const buffer = this.audioBuffers.get(sample)
          if (!buffer) {
            console.warn(`[SFZ] Sample not loaded: ${sample}`)
            continue
          }

          // Create audio nodes
          const source = this.ctx.createBufferSource()
          source.buffer = buffer
          
          // Calculate pitch shift
          const pitchCenter = region.pitch_keycenter ?? 60
          const semitoneShift = note - pitchCenter + (region.transpose ?? 0)
          const tuneShift = (region.tune ?? 0) / 100 // cents to semitones
          source.playbackRate.value = Math.pow(2, (semitoneShift + tuneShift) / 12)
          
          // Set up looping if specified
          if (region.loop_mode === 'loop_continuous') {
            source.loop = true
            if (region.loop_start !== undefined) source.loopStart = region.loop_start / buffer.sampleRate
            if (region.loop_end !== undefined) source.loopEnd = region.loop_end / buffer.sampleRate
          }
          
          // Create gain node for velocity and volume
          const gain = this.ctx.createGain()
          const volumeDb = region.volume ?? 0
          const velocityFactor = velocity / 127
          gain.gain.value = velocityFactor * Math.pow(10, volumeDb / 20)
          
          // Create panner for stereo positioning
          const panner = this.ctx.createStereoPanner()
          panner.pan.value = Math.max(-1, Math.min(1, (region.pan ?? 0) / 100))
          
          // Connect: source -> gain -> panner -> destination
          source.connect(gain)
          gain.connect(panner)
          panner.connect(this.destination)
          
          // Start playback
          source.start(now)
          
          // Track active note
          if (!this.activeNotes.has(note)) {
            this.activeNotes.set(note, [])
          }
          this.activeNotes.get(note)!.push({ source, gain })
        }
      }
    }
  }

  /**
   * Stop a note
   */
  noteOff(note: number) {
    const voices = this.activeNotes.get(note)
    if (!voices || voices.length === 0) return
    
    const now = this.ctx.currentTime
    const releaseTime = 0.05 // 50ms release
    
    for (const voice of voices) {
      // Fade out
      voice.gain.gain.cancelScheduledValues(now)
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime)
      
      // Stop and cleanup
      voice.source.stop(now + releaseTime + 0.1)
    }
    
    this.activeNotes.delete(note)
  }

  /**
   * Stop all notes immediately
   */
  allNotesOff() {
    const now = this.ctx.currentTime
    
    for (const [note, voices] of this.activeNotes.entries()) {
      for (const voice of voices) {
        try {
          voice.gain.gain.cancelScheduledValues(now)
          voice.gain.gain.setValueAtTime(0, now)
          voice.source.stop(now + 0.01)
        } catch (e) {
          // Ignore if already stopped
        }
      }
    }
    
    this.activeNotes.clear()
  }

  /**
   * Get info about loaded SFZ
   */
  getInfo() {
    return {
      groups: this.groups.length,
      regions: this.getTotalRegions(),
      loadedSamples: this.audioBuffers.size,
      activingVoices: Array.from(this.activeNotes.values()).reduce((sum, v) => sum + v.length, 0)
    }
  }
}
