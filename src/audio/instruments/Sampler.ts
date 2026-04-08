/**
 * FS-AUDIO Professional Sampler Engine
 * 
 * Features:
 * - Multi-sample playback with pitch shifting
 * - ADSR envelope per pad
 * - Velocity layers
 * - Pitch shift via playback rate
 * - Individual pad controls (volume, pan, pitch, ADSR)
 * - 16-pad drum machine layout
 */

export interface SamplePad {
  id: number
  name: string
  sample?: AudioBuffer
  sampleUrl?: string
  volume: number       // 0-1
  pan: number          // -1 to 1
  pitch: number        // semitones -24 to +24
  
  // ADSR
  attack: number       // 0-1s
  decay: number        // 0-1s
  sustain: number      // 0-1
  release: number      // 0-2s
  
  // Playback
  loop: boolean
  reverse: boolean
  chokeGroup?: number  // For hi-hat groups (close mutes open)
}

export interface SamplerParams {
  pads: SamplePad[]
  masterVolume: number
  masterPitch: number  // semitones -12 to +12
}

interface ActiveVoice {
  padId: number
  source: AudioBufferSourceNode
  gainNode: GainNode
  panNode: StereoPannerNode
  startTime: number
  noteNumber: number
  releaseTime?: number
}

export class Sampler {
  private ctx: AudioContext
  private output: GainNode
  private params: SamplerParams
  private activeVoices: Map<string, ActiveVoice> = new Map()
  
  constructor(ctx: AudioContext, params: Partial<SamplerParams> = {}) {
    this.ctx = ctx
    this.output = ctx.createGain()
    
    // Initialize 16 pads (like MPC/Akai)
    const defaultPads: SamplePad[] = []
    for (let i = 0; i < 16; i++) {
      defaultPads.push({
        id: i,
        name: `Pad ${i + 1}`,
        volume: 0.8,
        pan: 0,
        pitch: 0,
        attack: 0.001,
        decay: 0.1,
        sustain: 0.7,
        release: 0.2,
        loop: false,
        reverse: false
      })
    }
    
    this.params = {
      pads: defaultPads,
      masterVolume: 0.8,
      masterPitch: 0,
      ...params
    }
    
    this.output.gain.value = this.params.masterVolume
  }
  
  /**
   * Load a sample into a pad
   */
  async loadSample(padId: number, url: string) {
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer)
      
      const pad = this.params.pads.find(p => p.id === padId)
      if (pad) {
        pad.sample = audioBuffer
        pad.sampleUrl = url
        // Auto-name from URL
        const filename = url.split('/').pop() || `Pad ${padId + 1}`
        pad.name = filename.replace(/\.(wav|mp3|ogg)$/i, '')
      }
      
      return audioBuffer
    } catch (error) {
      console.error(`Failed to load sample for pad ${padId}:`, error)
      throw error
    }
  }
  
  /**
   * Load multiple samples (for 808 kit, etc.)
   */
  async loadKit(samples: { padId: number, url: string, name?: string }[]) {
    const promises = samples.map(async ({ padId, url, name }) => {
      await this.loadSample(padId, url)
      if (name) {
        const pad = this.params.pads.find(p => p.id === padId)
        if (pad) pad.name = name
      }
    })
    
    await Promise.all(promises)
  }
  
  /**
   * Play a pad by ID or MIDI note number
   */
  playNote(noteOrPadId: number, velocity: number = 100) {
    // Map MIDI notes to pads: C4 (60) = pad 0, C#4 (61) = pad 1, etc.
    const padId = noteOrPadId >= 60 ? noteOrPadId - 60 : noteOrPadId
    
    if (padId < 0 || padId >= this.params.pads.length) return
    
    const pad = this.params.pads[padId]
    if (!pad.sample) return
    
    const now = this.ctx.currentTime
    const vel = velocity / 127
    
    // Handle choke groups (hi-hats)
    if (pad.chokeGroup !== undefined) {
      this.stopChokeGroup(pad.chokeGroup)
    }
    
    // Create audio nodes
    const source = this.ctx.createBufferSource()
    source.buffer = pad.reverse ? this.reverseBuffer(pad.sample) : pad.sample
    source.loop = pad.loop
    
    // Calculate playback rate (pitch shift)
    const totalPitch = pad.pitch + this.params.masterPitch
    const playbackRate = Math.pow(2, totalPitch / 12)
    source.playbackRate.value = playbackRate
    
    // Create gain node for envelope
    const gainNode = this.ctx.createGain()
    gainNode.gain.value = 0
    
    // Create pan node
    const panNode = this.ctx.createStereoPanner()
    panNode.pan.value = pad.pan
    
    // Connect: source -> gain -> pan -> output
    source.connect(gainNode)
    gainNode.connect(panNode)
    panNode.connect(this.output)
    
    // Store voice
    const voiceKey = `${padId}-${now}`
    const voice: ActiveVoice = {
      padId,
      source,
      gainNode,
      panNode,
      startTime: now,
      noteNumber: noteOrPadId
    }
    this.activeVoices.set(voiceKey, voice)
    
    // Apply ADSR envelope
    const peakGain = pad.volume * vel
    const { attack, decay, sustain, release } = pad
    
    // Attack
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(peakGain, now + attack)
    
    // Decay to sustain
    gainNode.gain.linearRampToValueAtTime(peakGain * sustain, now + attack + decay)
    
    // Start playback
    source.start(now)
    
    // If not looping, schedule stop after release
    if (!pad.loop && pad.sample.duration < 10) {
      const duration = pad.sample.duration / playbackRate
      const totalDuration = duration + release
      
      setTimeout(() => {
        if (this.activeVoices.has(voiceKey)) {
          this.stopVoice(voiceKey)
        }
      }, totalDuration * 1000)
    }
  }
  
  /**
   * Stop a note/pad
   */
  stopNote(noteOrPadId: number) {
    const padId = noteOrPadId >= 60 ? noteOrPadId - 60 : noteOrPadId
    
    // Find and release all voices for this pad
    const voicesToRelease: string[] = []
    this.activeVoices.forEach((voice, key) => {
      if (voice.padId === padId && !voice.releaseTime) {
        voicesToRelease.push(key)
      }
    })
    
    voicesToRelease.forEach(key => this.stopVoice(key))
  }
  
  private stopVoice(voiceKey: string) {
    const voice = this.activeVoices.get(voiceKey)
    if (!voice || voice.releaseTime) return
    
    const pad = this.params.pads[voice.padId]
    const now = this.ctx.currentTime
    
    voice.releaseTime = now
    
    // Release envelope
    voice.gainNode.gain.cancelScheduledValues(now)
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now)
    voice.gainNode.gain.linearRampToValueAtTime(0, now + pad.release)
    
    // Stop and cleanup after release
    setTimeout(() => {
      voice.source.stop()
      voice.source.disconnect()
      voice.gainNode.disconnect()
      voice.panNode.disconnect()
      this.activeVoices.delete(voiceKey)
    }, pad.release * 1000 + 100)
  }
  
  private stopChokeGroup(chokeGroup: number) {
    const voicesToStop: string[] = []
    
    this.activeVoices.forEach((voice, key) => {
      const pad = this.params.pads[voice.padId]
      if (pad.chokeGroup === chokeGroup) {
        voicesToStop.push(key)
      }
    })
    
    voicesToStop.forEach(key => {
      const voice = this.activeVoices.get(key)
      if (voice) {
        voice.source.stop()
        voice.source.disconnect()
        voice.gainNode.disconnect()
        voice.panNode.disconnect()
        this.activeVoices.delete(key)
      }
    })
  }
  
  /**
   * Reverse an audio buffer
   */
  private reverseBuffer(buffer: AudioBuffer): AudioBuffer {
    const reversed = this.ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    )
    
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const inputData = buffer.getChannelData(channel)
      const outputData = reversed.getChannelData(channel)
      
      for (let i = 0; i < buffer.length; i++) {
        outputData[i] = inputData[buffer.length - 1 - i]
      }
    }
    
    return reversed
  }
  
  /**
   * Update sampler parameters
   */
  updateParams(newParams: Partial<SamplerParams>) {
    if (newParams.pads) {
      this.params.pads = newParams.pads
    }
    
    if (newParams.masterVolume !== undefined) {
      this.params.masterVolume = newParams.masterVolume
      this.output.gain.value = newParams.masterVolume
    }
    
    if (newParams.masterPitch !== undefined) {
      this.params.masterPitch = newParams.masterPitch
    }
  }
  
  /**
   * Update individual pad parameters
   */
  updatePad(padId: number, updates: Partial<SamplePad>) {
    const pad = this.params.pads.find(p => p.id === padId)
    if (pad) {
      Object.assign(pad, updates)
    }
  }
  
  /**
   * Get output node
   */
  getOutput(): GainNode {
    return this.output
  }
  
  /**
   * Stop all notes
   */
  panic() {
    const voiceKeys = Array.from(this.activeVoices.keys())
    voiceKeys.forEach(key => this.stopVoice(key))
  }
  
  /**
   * Cleanup
   */
  dispose() {
    this.panic()
    this.output.disconnect()
  }
  
  /**
   * Get pad info
   */
  getPad(padId: number): SamplePad | undefined {
    return this.params.pads.find(p => p.id === padId)
  }
  
  /**
   * Get all pads
   */
  getPads(): SamplePad[] {
    return this.params.pads
  }
}
