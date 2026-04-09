/**
 * FS-AUDIO Granular Synthesizer
 * Sample-based granular synthesis with cloud/texture creation
 */

export interface GrainParams {
  size: number            // Grain duration (ms, 10-500)
  density: number         // Grains per second (1-100)
  spread: number          // Random time spread (ms)
  pitch: number           // Pitch shift (semitones, -24 to +24)
  pitchRandom: number     // Random pitch variation (cents)
  pan: number             // Stereo pan (-1 to +1)
  panRandom: number       // Random pan variation (0-1)
  reverse: number         // Reverse probability (0-1)
  envelope: 'linear' | 'exponential' | 'gaussian'
}

export interface GranularSynthParams {
  // Source
  sampleBuffer: AudioBuffer | null
  position: number        // Playback position (0-1)
  positionRandom: number  // Position randomization (0-1)
  
  // Grain parameters
  grainParams: GrainParams
  
  // Global
  volume: number          // 0-1
  mix: number             // Dry/wet (0-1)
  freeze: boolean         // Freeze position
}

interface ActiveGrain {
  source: AudioBufferSourceNode
  gain: GainNode
  panner: StereoPannerNode
  startTime: number
  endTime: number
}

export class GranularSynth {
  private context: AudioContext
  private output: GainNode
  private dryGain: GainNode
  private wetGain: GainNode
  
  // Sample buffer
  private buffer: AudioBuffer | null = null
  
  // Active grains
  private grains: ActiveGrain[] = []
  private maxGrains = 100
  
  // Grain scheduler
  private schedulerInterval: number | null = null
  private isPlaying = false
  
  // Position control
  private currentPosition = 0
  private positionFrozen = false
  
  constructor(context: AudioContext) {
    this.context = context
    
    this.output = context.createGain()
    this.output.gain.value = 0.7
    
    this.wetGain = context.createGain()
    this.wetGain.gain.value = 1
    this.wetGain.connect(this.output)
    
    this.dryGain = context.createGain()
    this.dryGain.gain.value = 0
    this.dryGain.connect(this.output)
  }
  
  /**
   * Load sample buffer
   */
  loadBuffer(buffer: AudioBuffer) {
    this.buffer = buffer
    this.currentPosition = 0
  }
  
  /**
   * Start grain generation
   */
  start(params: GranularSynthParams) {
    if (this.isPlaying) return
    if (!this.buffer) return
    
    this.isPlaying = true
    this.buffer = params.sampleBuffer
    
    // Calculate grain interval
    const grainInterval = 1000 / params.grainParams.density
    
    // Schedule grain generation
    this.schedulerInterval = window.setInterval(() => {
      if (this.grains.length < this.maxGrains) {
        this.createGrain(params)
      }
    }, grainInterval)
  }
  
  /**
   * Stop grain generation
   */
  stop() {
    if (!this.isPlaying) return
    
    this.isPlaying = false
    
    if (this.schedulerInterval !== null) {
      window.clearInterval(this.schedulerInterval)
      this.schedulerInterval = null
    }
    
    // Stop all active grains
    this.grains.forEach(grain => {
      grain.source.stop()
    })
    this.grains = []
  }
  
  /**
   * Create a single grain
   */
  private createGrain(params: GranularSynthParams) {
    if (!this.buffer) return
    
    const now = this.context.currentTime
    const grainParams = params.grainParams
    
    // Calculate grain parameters
    const grainDuration = grainParams.size / 1000 // ms to seconds
    const randomSpread = (Math.random() - 0.5) * 2 * grainParams.spread / 1000
    
    // Position
    let position = params.freeze ? this.currentPosition : params.position
    position += (Math.random() - 0.5) * params.positionRandom
    position = Math.max(0, Math.min(1, position))
    
    const startOffset = position * this.buffer.duration
    
    // Update current position (if not frozen)
    if (!params.freeze) {
      this.currentPosition = (this.currentPosition + grainDuration / this.buffer.duration) % 1
    }
    
    // Pitch
    let pitchShift = Math.pow(2, grainParams.pitch / 12)
    const randomPitch = (Math.random() - 0.5) * grainParams.pitchRandom / 50
    pitchShift *= Math.pow(2, randomPitch)
    
    // Pan
    let pan = grainParams.pan
    pan += (Math.random() - 0.5) * 2 * grainParams.panRandom
    pan = Math.max(-1, Math.min(1, pan))
    
    // Reverse
    const reverse = Math.random() < grainParams.reverse
    
    // Create grain nodes
    const source = this.context.createBufferSource()
    source.buffer = this.buffer
    source.playbackRate.value = reverse ? -pitchShift : pitchShift
    
    const gainNode = this.context.createGain()
    gainNode.gain.value = 0
    
    const panNode = this.context.createStereoPanner()
    panNode.pan.value = pan
    
    // Connect: source → gain → pan → wet
    source.connect(gainNode)
    gainNode.connect(panNode)
    panNode.connect(this.wetGain)
    
    // Envelope
    const envelope = this.createEnvelope(grainDuration, grainParams.envelope)
    envelope.forEach((point, i) => {
      const time = now + randomSpread + (i / (envelope.length - 1)) * grainDuration
      gainNode.gain.linearRampToValueAtTime(point * params.volume, time)
    })
    
    // Schedule grain
    source.start(now + randomSpread, startOffset, grainDuration)
    source.stop(now + randomSpread + grainDuration)
    
    // Track grain
    const grain: ActiveGrain = {
      source,
      gain: gainNode,
      panner: panNode,
      startTime: now + randomSpread,
      endTime: now + randomSpread + grainDuration
    }
    
    this.grains.push(grain)
    
    // Clean up finished grains
    source.onended = () => {
      const index = this.grains.indexOf(grain)
      if (index > -1) {
        this.grains.splice(index, 1)
      }
      
      gainNode.disconnect()
      panNode.disconnect()
      source.disconnect()
    }
  }
  
  /**
   * Create grain envelope
   */
  private createEnvelope(duration: number, type: 'linear' | 'exponential' | 'gaussian'): number[] {
    const points = 64
    const envelope: number[] = []
    
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1) // 0 to 1
      let value = 0
      
      switch (type) {
        case 'linear':
          // Triangle
          value = t < 0.5 ? t * 2 : (1 - t) * 2
          break
        
        case 'exponential':
          // Smooth fade in/out
          value = Math.sin(t * Math.PI)
          break
        
        case 'gaussian':
          // Bell curve
          const sigma = 0.25
          const mu = 0.5
          value = Math.exp(-Math.pow(t - mu, 2) / (2 * sigma * sigma))
          break
      }
      
      envelope.push(value)
    }
    
    return envelope
  }
  
  /**
   * Update mix
   */
  setMix(wet: number) {
    this.wetGain.gain.value = wet
    this.dryGain.gain.value = 1 - wet
  }
  
  /**
   * Freeze/unfreeze position
   */
  setFreeze(freeze: boolean) {
    this.positionFrozen = freeze
  }
  
  /**
   * Connect to destination
   */
  connect(destination: AudioNode) {
    this.output.connect(destination)
  }
  
  /**
   * Disconnect
   */
  disconnect() {
    this.stop()
    this.output.disconnect()
  }
}

/**
 * Granular Cloud - Multiple granular engines for complex textures
 */
export class GranularCloud {
  private context: AudioContext
  private synths: GranularSynth[] = []
  private output: GainNode
  
  constructor(context: AudioContext, count: number = 4) {
    this.context = context
    this.output = context.createGain()
    this.output.gain.value = 1 / count
    
    // Create multiple granular engines
    for (let i = 0; i < count; i++) {
      const synth = new GranularSynth(context)
      synth.connect(this.output)
      this.synths.push(synth)
    }
  }
  
  /**
   * Load buffer to all engines
   */
  loadBuffer(buffer: AudioBuffer) {
    this.synths.forEach(synth => synth.loadBuffer(buffer))
  }
  
  /**
   * Start cloud
   */
  start(baseParams: GranularSynthParams, variation: number = 0.3) {
    this.synths.forEach((synth, i) => {
      // Create variations of base params
      const params = this.varyParams(baseParams, variation, i)
      synth.start(params)
    })
  }
  
  /**
   * Stop cloud
   */
  stop() {
    this.synths.forEach(synth => synth.stop())
  }
  
  /**
   * Create parameter variations
   */
  private varyParams(base: GranularSynthParams, amount: number, seed: number): GranularSynthParams {
    const rand = (val: number) => val + (Math.random() - 0.5) * val * amount * 2
    
    return {
      ...base,
      position: Math.max(0, Math.min(1, base.position + (Math.random() - 0.5) * amount)),
      grainParams: {
        ...base.grainParams,
        size: rand(base.grainParams.size),
        density: rand(base.grainParams.density),
        pitch: base.grainParams.pitch + (Math.random() - 0.5) * 2,
        pan: (seed / 4 - 0.5) * 2, // Spread across stereo field
      }
    }
  }
  
  /**
   * Connect to destination
   */
  connect(destination: AudioNode) {
    this.output.connect(destination)
  }
  
  /**
   * Disconnect
   */
  disconnect() {
    this.stop()
    this.synths.forEach(synth => synth.disconnect())
    this.output.disconnect()
  }
}
