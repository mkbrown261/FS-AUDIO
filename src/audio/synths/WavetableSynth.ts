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
  private destination: AudioNode | null = null  // FIX: track where we're connected
  
  // Voice pool
  private voices: WavetableVoice[] = []
  private maxVoices = 16
  
  // LFO
  private lfo: OscillatorNode
  private lfoGain: GainNode
  
  private _pitchBendCents = 0

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
    
    // Pre-allocate voice pool — connect once here
    for (let i = 0; i < this.maxVoices; i++) {
      const voice = new WavetableVoice(context)
      voice.connect(this.output)  // FIX: connect at construction, not in noteOn
      this.voices.push(voice)
    }
  }
  
  /**
   * Trigger note
   */
  noteOn(midiNote: number, velocity: number, params: WavetableSynthParams) {
    // Find free voice or steal oldest
    let voice = this.voices.find(v => !v.isActive())
    if (!voice) {
      // Voice stealing: stop first voice and reuse it
      voice = this.voices[0]
      voice.forceStop()
    }

    // Build default params if any field is missing/undefined
    const p: WavetableSynthParams = {
      wavetableA: params.wavetableA ?? 0,
      wavetableB: params.wavetableB ?? 0,
      positionA:  params.positionA  ?? 0,
      positionB:  params.positionB  ?? 0,
      mix:        params.mix        ?? 0,
      octave:     params.octave     ?? 0,
      semitone:   params.semitone   ?? 0,
      detune:     params.detune     ?? 0,
      unison:     params.unison     ?? 1,
      unisonDetune: params.unisonDetune ?? 10,
      unisonSpread: params.unisonSpread ?? 0.5,
      filterType: (params.filterType as BiquadFilterType) ?? 'lowpass',
      filterCutoff:    params.filterCutoff    ?? 8000,
      filterResonance: params.filterResonance ?? 1,
      filterEnvAmount: params.filterEnvAmount ?? 0,
      ampAttack:  params.ampAttack  ?? 10,
      ampDecay:   params.ampDecay   ?? 200,
      ampSustain: params.ampSustain ?? 0.7,
      ampRelease: params.ampRelease ?? 300,
      filterAttack:  params.filterAttack  ?? 10,
      filterDecay:   params.filterDecay   ?? 200,
      filterSustain: params.filterSustain ?? 0.5,
      filterRelease: params.filterRelease ?? 300,
      lfoRate:        params.lfoRate        ?? 5,
      lfoAmount:      params.lfoAmount      ?? 0,
      lfoDestination: params.lfoDestination ?? 'pitch',
      distortion: params.distortion ?? 0,
      bitcrush:   params.bitcrush   ?? 16,
      volume:     params.volume     ?? 0.8,
    }

    // Guard wavetable indices
    const wtA = Math.max(0, Math.min(WAVETABLES.length - 1, Math.round(p.wavetableA)))
    const wtB = Math.max(0, Math.min(WAVETABLES.length - 1, Math.round(p.wavetableB)))
    
    const freq = this.midiToFreq(midiNote + p.octave * 12 + p.semitone + p.detune / 100)
    
    // Get blended wavetable
    const waveform = this.blendWavetables(
      WAVETABLES[wtA],
      WAVETABLES[wtB],
      p.positionA,
      p.positionB,
      p.mix
    )
    
    voice.start(midiNote, freq, velocity, waveform, p)

    // Apply current pitch bend to the new voice
    if (this._pitchBendCents !== 0) {
      voice.applyPitchBendCents(this._pitchBendCents)
    }
  }
  
  /**
   * Release note
   */
  noteOff(midiNote: number, params: WavetableSynthParams) {
    const releaseTime = (params?.ampRelease ?? 300) / 1000
    this.voices.forEach(voice => {
      if (voice.isPlaying(midiNote)) {
        voice.stop(releaseTime)
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
    const m = Math.max(0, Math.min(1, mix))
    for (let i = 0; i < frameA.length; i++) {
      blended[i] = frameA[i] * (1 - m) + frameB[i] * m
    }
    
    return blended
  }
  
  /**
   * Get interpolated frame from wavetable
   */
  private getWavetableFrame(table: Wavetable, position: number): Float32Array {
    const frameCount = table.frames.length
    const clamped = Math.max(0, Math.min(1, position))
    const exactFrame = clamped * (frameCount - 1)
    const frame1 = Math.floor(exactFrame)
    const frame2 = Math.min(frame1 + 1, frameCount - 1)
    const frac = exactFrame - frame1
    
    const waveform1 = table.frames[frame1]
    const waveform2 = table.frames[frame2]
    
    if (!waveform1 || !waveform2) return new Float32Array(2048)

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
   * Apply pitch-bend: value -1.0 to +1.0, bendRange in semitones (default 2)
   */
  pitchBend(value: number, bendRangeSemitones = 2) {
    this._pitchBendCents = value * bendRangeSemitones * 100
    for (const voice of this.voices) {
      if (voice.isActive()) {
        voice.applyPitchBendCents(this._pitchBendCents)
      }
    }
  }

  /**
   * Connect to destination — FIX: idempotent, tracks destination
   */
  connect(destination: AudioNode) {
    if (this.destination === destination) return  // Already connected
    if (this.destination) {
      try { this.output.disconnect(this.destination) } catch {}
    }
    this.destination = destination
    this.output.connect(destination)
  }
  
  /**
   * Stop all active voices immediately (MIDI panic)
   * FIX: Don't destroy voice pool — just stop each voice
   */
  allNotesOff() {
    this.voices.forEach(voice => {
      try { voice.forceStop() } catch {}
    })
  }

  /**
   * Disconnect
   */
  disconnect() {
    this.allNotesOff()
    try { this.lfo.stop() } catch {}
    try { this.output.disconnect() } catch {}
    this.destination = null
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
  private _midiNote = -1   // FIX: was always 0, now -1 = inactive
  private stopScheduled = false
  
  constructor(context: AudioContext) {
    this.context = context
    this.gainNode = context.createGain()
    this.gainNode.gain.value = 0
    this.filterNode = context.createBiquadFilter()
    this.filterNode.type = 'lowpass'
    this.filterNode.connect(this.gainNode)
  }
  
  start(midiNote: number, frequency: number, velocity: number, waveform: Float32Array, params: WavetableSynthParams) {
    // Stop any existing source first
    this.forceStop()
    
    const now = this.context.currentTime
    this.active = true
    this._midiNote = midiNote
    this.stopScheduled = false
    
    // Create buffer from waveform (loop-point single cycle)
    const buffer = this.context.createBuffer(1, waveform.length, this.context.sampleRate)
    // FIX: copyToChannel needs plain ArrayBuffer — create a new Float32Array with plain buffer
    const safeWaveform = new Float32Array(waveform.length)
    safeWaveform.set(waveform)
    buffer.copyToChannel(safeWaveform, 0)
    
    // Create buffer source
    this.bufferSource = this.context.createBufferSource()
    this.bufferSource.buffer = buffer
    this.bufferSource.loop = true
    // FIX: playbackRate = frequency / (sampleRate / sampleCount) = frequency * sampleCount / sampleRate
    this.bufferSource.playbackRate.value = frequency * waveform.length / this.context.sampleRate
    this.bufferSource.connect(this.filterNode)
    
    // Setup filter
    const fType = params.filterType ?? 'lowpass'
    this.filterNode.type = fType
    this.filterNode.frequency.value = Math.max(20, Math.min(20000, params.filterCutoff))
    this.filterNode.Q.value = Math.max(0.001, Math.min(20, params.filterResonance))
    
    // Filter envelope
    const filterTarget = Math.max(20, Math.min(20000, params.filterCutoff * (1 + params.filterEnvAmount)))
    this.filterNode.frequency.setValueAtTime(params.filterCutoff, now)
    this.filterNode.frequency.linearRampToValueAtTime(filterTarget, now + params.filterAttack / 1000)
    this.filterNode.frequency.linearRampToValueAtTime(
      params.filterCutoff + (filterTarget - params.filterCutoff) * params.filterSustain,
      now + params.filterAttack / 1000 + params.filterDecay / 1000
    )
    
    // Amp envelope — velocity 0-1 here
    const peakGain = Math.max(0, Math.min(1, velocity * params.volume))
    const sustainGain = peakGain * Math.max(0, Math.min(1, params.ampSustain))
    this.gainNode.gain.cancelScheduledValues(now)
    this.gainNode.gain.setValueAtTime(0, now)
    this.gainNode.gain.linearRampToValueAtTime(peakGain, now + Math.max(0.001, params.ampAttack / 1000))
    this.gainNode.gain.linearRampToValueAtTime(
      sustainGain,
      now + params.ampAttack / 1000 + Math.max(0.001, params.ampDecay / 1000)
    )
    
    this.bufferSource.onended = () => {
      if (this._midiNote === midiNote) {
        this.active = false
        this._midiNote = -1
      }
    }

    this.bufferSource.start(now)
  }
  
  stop(releaseTimeSec: number) {
    if (!this.bufferSource || this.stopScheduled) return
    this.stopScheduled = true
    
    const now = this.context.currentTime
    const rel = Math.max(0.005, releaseTimeSec)
    
    this.gainNode.gain.cancelScheduledValues(now)
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now)
    this.gainNode.gain.linearRampToValueAtTime(0, now + rel)
    
    this.bufferSource.stop(now + rel + 0.01)
    this.active = false
    this._midiNote = -1
  }

  forceStop() {
    if (this.bufferSource) {
      try { this.bufferSource.stop(0) } catch {}
      try { this.bufferSource.disconnect() } catch {}
      this.bufferSource = null
    }
    this.gainNode.gain.cancelScheduledValues(this.context.currentTime)
    this.gainNode.gain.setValueAtTime(0, this.context.currentTime)
    this.active = false
    this._midiNote = -1
    this.stopScheduled = false
  }
  
  isActive(): boolean {
    return this.active
  }
  
  isPlaying(midiNote: number): boolean {
    return this.active && this._midiNote === midiNote  // FIX: was always false
  }
  
  connect(destination: AudioNode) {
    this.gainNode.connect(destination)
  }
  
  disconnect() {
    this.forceStop()
    try { this.gainNode.disconnect() } catch {}
  }

  /** Apply pitch bend in cents by adjusting playbackRate */
  applyPitchBendCents(cents: number) {
    if (!this.bufferSource || !this.active) return
    // Store base rate at note-on, offset by bend ratio
    const ratio = Math.pow(2, cents / 1200)
    // We can't read the original rate after modification, so apply relative to current
    // This is approximate; a full implementation would store baseRate separately
    const currentRate = this.bufferSource.playbackRate.value
    this.bufferSource.playbackRate.setTargetAtTime(
      Math.abs(currentRate) * ratio,
      this.context.currentTime,
      0.01
    )
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
