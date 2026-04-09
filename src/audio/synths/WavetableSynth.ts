/**
 * FS-AUDIO Wavetable Synthesizer
 * Serum/Vital-style wavetable synthesis with morphing
 */

export interface Wavetable {
  name: string
  description: string
  frames: Float32Array[]  // Array of waveforms (each 2048 samples)
}

export interface WavetableSynthParams {
  wavetableA: number      // Wavetable A index
  wavetableB: number      // Wavetable B index
  positionA: number       // Frame position in table A (0-1)
  positionB: number       // Frame position in table B (0-1)
  mix: number             // A/B mix (0-1)
  
  // Oscillator
  octave: number          // -2 to +2
  semitone: number        // -12 to +12
  detune: number          // -100 to +100 cents
  unison: number          // 1-8 voices
  unisonDetune: number    // 0-50 cents
  unisonSpread: number    // Stereo spread (0-1)
  
  // Filter
  filterType: BiquadFilterType
  filterCutoff: number    // 20-20000 Hz
  filterResonance: number // 0-20
  filterEnvAmount: number // -1 to +1
  
  // Envelopes
  ampAttack: number
  ampDecay: number
  ampSustain: number
  ampRelease: number
  
  filterAttack: number
  filterDecay: number
  filterSustain: number
  filterRelease: number
  
  // LFO
  lfoRate: number         // 0.1-20 Hz
  lfoAmount: number       // 0-1
  lfoDestination: 'position' | 'cutoff' | 'pitch'
  
  // Effects
  distortion: number      // 0-1
  bitcrush: number        // 1-16 bits
  
  // Output
  volume: number          // 0-1
}

// Built-in wavetables
export const WAVETABLES: Wavetable[] = [
  {
    name: 'Basic Shapes',
    description: 'Sine → Triangle → Saw → Square',
    frames: generateBasicShapes(),
  },
  {
    name: 'Harmonic Series',
    description: 'Additive harmonic buildup',
    frames: generateHarmonicSeries(),
  },
  {
    name: 'PWM',
    description: 'Pulse width modulation',
    frames: generatePWM(),
  },
  {
    name: 'Digital',
    description: 'Digital/lo-fi waveforms',
    frames: generateDigital(),
  },
  {
    name: 'Vocal',
    description: 'Formant-like shapes',
    frames: generateVocal(),
  },
]

export class WavetableSynth {
  private context: AudioContext
  private output: GainNode
  
  // Voice pool
  private voices: WavetableVoice[] = []
  private maxVoices = 16
  
  // LFO
  private lfo: OscillatorNode
  private lfoGain: GainNode
  
  constructor(context: AudioContext) {
    this.context = context
    this.output = context.createGain()
    this.output.gain.value = 0.7
    
    // Create LFO
    this.lfo = context.createOscillator()
    this.lfo.frequency.value = 5
    this.lfo.type = 'sine'
    this.lfoGain = context.createGain()
    this.lfoGain.gain.value = 0
    this.lfo.connect(this.lfoGain)
    this.lfo.start()
    
    // Pre-allocate voice pool
    for (let i = 0; i < this.maxVoices; i++) {
      this.voices.push(new WavetableVoice(context))
    }
  }
  
  /**
   * Trigger note
   */
  noteOn(midiNote: number, velocity: number, params: WavetableSynthParams) {
    // Find free voice or steal oldest
    let voice = this.voices.find(v => !v.isActive())
    if (!voice) {
      voice = this.voices[0] // Voice stealing
    }
    
    const freq = this.midiToFreq(midiNote + params.octave * 12 + params.semitone + params.detune / 100)
    
    // Get blended wavetable
    const wavetable = this.blendWavetables(
      WAVETABLES[params.wavetableA],
      WAVETABLES[params.wavetableB],
      params.positionA,
      params.positionB,
      params.mix
    )
    
    voice.start(freq, velocity, wavetable, params)
  }
  
  /**
   * Release note
   */
  noteOff(midiNote: number, params: WavetableSynthParams) {
    // Find voices playing this note
    this.voices.forEach(voice => {
      if (voice.isPlaying(midiNote)) {
        voice.stop(params)
      }
    })
  }
  
  /**
   * Blend two wavetables
   */
  private blendWavetables(
    tableA: Wavetable,
    tableB: Wavetable,
    posA: number,
    posB: number,
    mix: number
  ): Float32Array {
    const frameA = this.getWavetableFrame(tableA, posA)
    const frameB = this.getWavetableFrame(tableB, posB)
    
    const blended = new Float32Array(frameA.length)
    for (let i = 0; i < frameA.length; i++) {
      blended[i] = frameA[i] * (1 - mix) + frameB[i] * mix
    }
    
    return blended
  }
  
  /**
   * Get interpolated frame from wavetable
   */
  private getWavetableFrame(table: Wavetable, position: number): Float32Array {
    const frameCount = table.frames.length
    const exactFrame = position * (frameCount - 1)
    const frame1 = Math.floor(exactFrame)
    const frame2 = Math.min(frame1 + 1, frameCount - 1)
    const frac = exactFrame - frame1
    
    const waveform1 = table.frames[frame1]
    const waveform2 = table.frames[frame2]
    
    // Linear interpolation between frames
    const result = new Float32Array(waveform1.length)
    for (let i = 0; i < waveform1.length; i++) {
      result[i] = waveform1[i] * (1 - frac) + waveform2[i] * frac
    }
    
    return result
  }
  
  /**
   * MIDI to frequency
   */
  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12)
  }
  
  /**
   * Connect to destination
   */
  connect(destination: AudioNode) {
    this.voices.forEach(voice => voice.connect(this.output))
    this.output.connect(destination)
  }
  
  /**
   * Disconnect
   */
  disconnect() {
    this.voices.forEach(voice => voice.disconnect())
    this.output.disconnect()
    this.lfo.stop()
  }
}

/**
 * Single wavetable voice
 */
class WavetableVoice {
  private context: AudioContext
  private bufferSource: AudioBufferSourceNode | null = null
  private gainNode: GainNode
  private filterNode: BiquadFilterNode
  private active = false
  private midiNote = 0
  
  constructor(context: AudioContext) {
    this.context = context
    this.gainNode = context.createGain()
    this.gainNode.gain.value = 0
    this.filterNode = context.createBiquadFilter()
    this.filterNode.type = 'lowpass'
    this.filterNode.connect(this.gainNode)
  }
  
  start(frequency: number, velocity: number, waveform: Float32Array, params: WavetableSynthParams) {
    const now = this.context.currentTime
    this.active = true
    
    // Create buffer from waveform
    const buffer = this.context.createBuffer(1, waveform.length, this.context.sampleRate)
    buffer.copyToChannel(waveform, 0)
    
    // Create buffer source
    this.bufferSource = this.context.createBufferSource()
    this.bufferSource.buffer = buffer
    this.bufferSource.loop = true
    this.bufferSource.playbackRate.value = frequency / (this.context.sampleRate / waveform.length)
    this.bufferSource.connect(this.filterNode)
    
    // Setup filter
    this.filterNode.type = params.filterType
    this.filterNode.frequency.value = params.filterCutoff
    this.filterNode.Q.value = params.filterResonance
    
    // Filter envelope
    const filterTarget = params.filterCutoff * (1 + params.filterEnvAmount)
    this.filterNode.frequency.setValueAtTime(params.filterCutoff, now)
    this.filterNode.frequency.linearRampToValueAtTime(filterTarget, now + params.filterAttack / 1000)
    this.filterNode.frequency.linearRampToValueAtTime(
      params.filterCutoff + (filterTarget - params.filterCutoff) * params.filterSustain,
      now + params.filterAttack / 1000 + params.filterDecay / 1000
    )
    
    // Amp envelope
    this.gainNode.gain.setValueAtTime(0, now)
    this.gainNode.gain.linearRampToValueAtTime(velocity * params.volume, now + params.ampAttack / 1000)
    this.gainNode.gain.linearRampToValueAtTime(
      velocity * params.volume * params.ampSustain,
      now + params.ampAttack / 1000 + params.ampDecay / 1000
    )
    
    this.bufferSource.start(now)
  }
  
  stop(params: WavetableSynthParams) {
    if (!this.bufferSource) return
    
    const now = this.context.currentTime
    const releaseTime = params.ampRelease / 1000
    
    this.gainNode.gain.cancelScheduledValues(now)
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now)
    this.gainNode.gain.linearRampToValueAtTime(0, now + releaseTime)
    
    this.bufferSource.stop(now + releaseTime + 0.1)
    this.active = false
  }
  
  isActive(): boolean {
    return this.active
  }
  
  isPlaying(midiNote: number): boolean {
    return this.active && this.midiNote === midiNote
  }
  
  connect(destination: AudioNode) {
    this.gainNode.connect(destination)
  }
  
  disconnect() {
    this.gainNode.disconnect()
    if (this.bufferSource) {
      this.bufferSource.stop()
      this.bufferSource = null
    }
  }
}

// ── Wavetable Generators ────────────────────────────────────────────────────

function generateBasicShapes(): Float32Array[] {
  const frames: Float32Array[] = []
  const frameCount = 64
  const sampleCount = 2048
  
  for (let f = 0; f < frameCount; f++) {
    const frame = new Float32Array(sampleCount)
    const t = f / (frameCount - 1) // 0 to 1
    
    for (let i = 0; i < sampleCount; i++) {
      const phase = (i / sampleCount) * Math.PI * 2
      
      if (t < 0.33) {
        // Sine → Triangle
        const mix = t / 0.33
        frame[i] = Math.sin(phase) * (1 - mix) + (2 / Math.PI) * Math.asin(Math.sin(phase)) * mix
      } else if (t < 0.66) {
        // Triangle → Saw
        const mix = (t - 0.33) / 0.33
        const tri = (2 / Math.PI) * Math.asin(Math.sin(phase))
        const saw = 2 * (phase / (Math.PI * 2)) - 1
        frame[i] = tri * (1 - mix) + saw * mix
      } else {
        // Saw → Square
        const mix = (t - 0.66) / 0.34
        const saw = 2 * (phase / (Math.PI * 2)) - 1
        const square = phase < Math.PI ? 1 : -1
        frame[i] = saw * (1 - mix) + square * mix
      }
    }
    
    frames.push(frame)
  }
  
  return frames
}

function generateHarmonicSeries(): Float32Array[] {
  const frames: Float32Array[] = []
  const frameCount = 64
  const sampleCount = 2048
  
  for (let f = 0; f < frameCount; f++) {
    const frame = new Float32Array(sampleCount)
    const harmonics = Math.floor(1 + f / 4) // 1 to 16 harmonics
    
    for (let i = 0; i < sampleCount; i++) {
      const phase = (i / sampleCount) * Math.PI * 2
      let value = 0
      
      for (let h = 1; h <= harmonics; h++) {
        value += Math.sin(phase * h) / h
      }
      
      frame[i] = value / Math.sqrt(harmonics)
    }
    
    frames.push(frame)
  }
  
  return frames
}

function generatePWM(): Float32Array[] {
  const frames: Float32Array[] = []
  const frameCount = 64
  const sampleCount = 2048
  
  for (let f = 0; f < frameCount; f++) {
    const frame = new Float32Array(sampleCount)
    const width = 0.1 + 0.8 * (f / (frameCount - 1)) // 10% to 90% duty cycle
    
    for (let i = 0; i < sampleCount; i++) {
      const phase = i / sampleCount
      frame[i] = phase < width ? 1 : -1
    }
    
    frames.push(frame)
  }
  
  return frames
}

function generateDigital(): Float32Array[] {
  const frames: Float32Array[] = []
  const frameCount = 64
  const sampleCount = 2048
  
  for (let f = 0; f < frameCount; f++) {
    const frame = new Float32Array(sampleCount)
    const steps = 2 + Math.floor(f / 4) // 2 to 18 steps
    
    for (let i = 0; i < sampleCount; i++) {
      const phase = (i / sampleCount) * Math.PI * 2
      const quantized = Math.floor(Math.sin(phase) * steps) / steps
      frame[i] = quantized
    }
    
    frames.push(frame)
  }
  
  return frames
}

function generateVocal(): Float32Array[] {
  const frames: Float32Array[] = []
  const frameCount = 64
  const sampleCount = 2048
  
  // Formant frequencies for vowels (simplified)
  const formants = [
    [800, 1150, 2900],  // 'a' as in 'father'
    [350, 2000, 2800],  // 'e' as in 'bed'
    [270, 2140, 2950],  // 'i' as in 'see'
    [450, 800, 2830],   // 'o' as in 'go'
    [325, 700, 2700],   // 'u' as in 'too'
  ]
  
  for (let f = 0; f < frameCount; f++) {
    const frame = new Float32Array(sampleCount)
    const vowelIndex = Math.floor(f / (frameCount / formants.length))
    const vowel = formants[Math.min(vowelIndex, formants.length - 1)]
    
    for (let i = 0; i < sampleCount; i++) {
      const phase = (i / sampleCount) * Math.PI * 2
      let value = 0
      
      // Add formants
      vowel.forEach((formant, idx) => {
        const harmonic = Math.round(formant / 100)
        value += Math.sin(phase * harmonic) / (idx + 1)
      })
      
      frame[i] = value / 3
    }
    
    frames.push(frame)
  }
  
  return frames
}
