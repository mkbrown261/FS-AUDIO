/**
 * FS-AUDIO Professional Analog Synthesizer
 * 
 * Features:
 * - 2 Oscillators (Saw, Square, Sine, Triangle, Noise)
 * - Resonant Filter (Lowpass, Highpass, Bandpass)
 * - ADSR Envelope
 * - LFO Modulation
 * - Unison/Detune
 * - Polyphonic (8 voices)
 */

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'
export type FilterType = 'lowpass' | 'highpass' | 'bandpass'

export interface AnalogSynthParams {
  // Oscillator 1
  osc1_type: OscillatorType
  osc1_level: number      // 0-1
  osc1_octave: number     // -2 to +2
  osc1_detune: number     // -100 to +100 cents
  
  // Oscillator 2
  osc2_type: OscillatorType
  osc2_level: number
  osc2_octave: number
  osc2_detune: number
  
  // Filter
  filter_type: FilterType
  filter_cutoff: number   // 20-20000 Hz
  filter_resonance: number // 0-20
  filter_env_amount: number // -1 to +1
  
  // Envelope (ADSR)
  env_attack: number      // 0-2s
  env_decay: number       // 0-2s
  env_sustain: number     // 0-1
  env_release: number     // 0-3s
  
  // LFO
  lfo_rate: number        // 0.1-20 Hz
  lfo_amount: number      // 0-1
  lfo_destination: 'pitch' | 'filter' | 'amp'
  
  // Unison
  unison_voices: number   // 1-8
  unison_detune: number   // 0-100 cents
  
  // Master
  master_volume: number   // 0-1
}

interface Voice {
  note: number
  velocity: number
  osc1?: OscillatorNode
  osc2?: OscillatorNode
  noiseBuffer?: AudioBufferSourceNode
  filter: BiquadFilterNode
  envGain: GainNode
  startTime: number
  releaseTime?: number
}

export class AnalogSynth {
  private ctx: AudioContext
  private output: GainNode
  private voices: Map<number, Voice[]> = new Map()
  private lfo?: OscillatorNode
  private lfoGain?: GainNode
  private params: AnalogSynthParams
  private noiseBuffer?: AudioBuffer
  
  // Voice management
  private readonly maxVoices = 8
  
  constructor(ctx: AudioContext, params: Partial<AnalogSynthParams> = {}) {
    this.ctx = ctx
    this.output = ctx.createGain()
    
    // Default parameters
    this.params = {
      osc1_type: 'sawtooth',
      osc1_level: 0.7,
      osc1_octave: 0,
      osc1_detune: 0,
      
      osc2_type: 'square',
      osc2_level: 0.3,
      osc2_octave: -1,
      osc2_detune: 5,
      
      filter_type: 'lowpass',
      filter_cutoff: 2000,
      filter_resonance: 5,
      filter_env_amount: 0.5,
      
      env_attack: 0.01,
      env_decay: 0.2,
      env_sustain: 0.6,
      env_release: 0.3,
      
      lfo_rate: 5,
      lfo_amount: 0.2,
      lfo_destination: 'filter',
      
      unison_voices: 2,
      unison_detune: 10,
      
      master_volume: 0.7,
      ...params
    }
    
    this.output.gain.value = this.params.master_volume
    this.createNoiseBuffer()
    this.initLFO()
  }
  
  private createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }
  }
  
  private initLFO() {
    this.lfo = this.ctx.createOscillator()
    this.lfo.frequency.value = this.params.lfo_rate
    this.lfo.type = 'sine'
    
    this.lfoGain = this.ctx.createGain()
    this.lfoGain.gain.value = this.params.lfo_amount
    
    this.lfo.connect(this.lfoGain)
    this.lfo.start()
  }
  
  /**
   * Play a note (MIDI note number)
   */
  playNote(note: number, velocity: number = 100) {
    const now = this.ctx.currentTime
    const vel = velocity / 127
    
    // Voice stealing - remove oldest voice if at max
    if (this.voices.size >= this.maxVoices) {
      const oldestNote = Array.from(this.voices.keys())[0]
      this.stopNote(oldestNote)
    }
    
    const unisonVoices: Voice[] = []
    const numVoices = this.params.unison_voices
    
    for (let i = 0; i < numVoices; i++) {
      const voice = this.createVoice(note, vel, i, numVoices)
      unisonVoices.push(voice)
      
      // Start envelope
      this.triggerEnvelope(voice, now)
    }
    
    this.voices.set(note, unisonVoices)
  }
  
  private createVoice(note: number, velocity: number, unisonIndex: number, totalUnison: number): Voice {
    const now = this.ctx.currentTime
    const freq = this.midiToFreq(note)
    
    // Calculate unison detune
    const unisonDetune = totalUnison > 1 
      ? (unisonIndex / (totalUnison - 1) - 0.5) * this.params.unison_detune * 2
      : 0
    
    // Create filter
    const filter = this.ctx.createBiquadFilter()
    filter.type = this.params.filter_type
    filter.frequency.value = this.params.filter_cutoff
    filter.Q.value = this.params.filter_resonance
    
    // Connect LFO to filter if destination is filter
    if (this.params.lfo_destination === 'filter' && this.lfoGain) {
      this.lfoGain.connect(filter.frequency)
    }
    
    // Create envelope gain
    const envGain = this.ctx.createGain()
    envGain.gain.value = 0
    
    const voice: Voice = {
      note,
      velocity,
      filter,
      envGain,
      startTime: now
    }
    
    // Create Oscillator 1
    if (this.params.osc1_level > 0) {
      if (this.params.osc1_type === 'noise') {
        const noise = this.ctx.createBufferSource()
        noise.buffer = this.noiseBuffer!
        noise.loop = true
        
        const noiseGain = this.ctx.createGain()
        noiseGain.gain.value = this.params.osc1_level * velocity
        
        noise.connect(noiseGain)
        noiseGain.connect(filter)
        noise.start(now)
        voice.noiseBuffer = noise
      } else {
        const osc1 = this.ctx.createOscillator()
        osc1.type = this.params.osc1_type
        osc1.frequency.value = freq * Math.pow(2, this.params.osc1_octave)
        osc1.detune.value = this.params.osc1_detune + unisonDetune
        
        const osc1Gain = this.ctx.createGain()
        osc1Gain.gain.value = this.params.osc1_level * velocity
        
        osc1.connect(osc1Gain)
        osc1Gain.connect(filter)
        osc1.start(now)
        voice.osc1 = osc1
      }
    }
    
    // Create Oscillator 2
    if (this.params.osc2_level > 0 && this.params.osc2_type !== 'noise') {
      const osc2 = this.ctx.createOscillator()
      osc2.type = this.params.osc2_type
      osc2.frequency.value = freq * Math.pow(2, this.params.osc2_octave)
      osc2.detune.value = this.params.osc2_detune + unisonDetune
      
      const osc2Gain = this.ctx.createGain()
      osc2Gain.gain.value = this.params.osc2_level * velocity
      
      osc2.connect(osc2Gain)
      osc2Gain.connect(filter)
      osc2.start(now)
      voice.osc2 = osc2
    }
    
    // Connect filter -> envelope -> output
    filter.connect(envGain)
    envGain.connect(this.output)
    
    return voice
  }
  
  private triggerEnvelope(voice: Voice, startTime: number) {
    const { env_attack, env_decay, env_sustain } = this.params
    const gain = voice.envGain.gain
    
    // Calculate filter envelope
    const filterEnvAmount = this.params.filter_env_amount * (this.params.filter_cutoff - 20)
    const filterBase = voice.filter.frequency.value
    const filterPeak = filterBase + filterEnvAmount
    
    // Attack
    gain.setValueAtTime(0, startTime)
    gain.linearRampToValueAtTime(voice.velocity, startTime + env_attack)
    
    // Decay
    gain.linearRampToValueAtTime(env_sustain * voice.velocity, startTime + env_attack + env_decay)
    
    // Filter envelope (if amount > 0)
    if (Math.abs(this.params.filter_env_amount) > 0.01) {
      voice.filter.frequency.setValueAtTime(filterBase, startTime)
      voice.filter.frequency.linearRampToValueAtTime(filterPeak, startTime + env_attack)
      voice.filter.frequency.linearRampToValueAtTime(filterBase, startTime + env_attack + env_decay)
    }
  }
  
  /**
   * Stop a note
   */
  stopNote(note: number) {
    const voiceGroup = this.voices.get(note)
    if (!voiceGroup) return
    
    const now = this.ctx.currentTime
    const { env_release } = this.params
    
    voiceGroup.forEach(voice => {
      voice.releaseTime = now
      
      // Release envelope
      voice.envGain.gain.cancelScheduledValues(now)
      voice.envGain.gain.setValueAtTime(voice.envGain.gain.value, now)
      voice.envGain.gain.linearRampToValueAtTime(0, now + env_release)
      
      // Stop oscillators after release
      setTimeout(() => {
        voice.osc1?.stop()
        voice.osc2?.stop()
        voice.noiseBuffer?.stop()
        voice.osc1?.disconnect()
        voice.osc2?.disconnect()
        voice.noiseBuffer?.disconnect()
        voice.filter.disconnect()
        voice.envGain.disconnect()
      }, env_release * 1000 + 100)
    })
    
    // Remove voice after release
    setTimeout(() => {
      this.voices.delete(note)
    }, env_release * 1000 + 100)
  }
  
  /**
   * Update synth parameters
   */
  updateParams(newParams: Partial<AnalogSynthParams>) {
    Object.assign(this.params, newParams)
    
    // Update master volume
    if (newParams.master_volume !== undefined) {
      this.output.gain.value = newParams.master_volume
    }
    
    // Update LFO
    if (newParams.lfo_rate !== undefined && this.lfo) {
      this.lfo.frequency.value = newParams.lfo_rate
    }
    
    if (newParams.lfo_amount !== undefined && this.lfoGain) {
      this.lfoGain.gain.value = newParams.lfo_amount
    }
    
    // Note: Filter and oscillator changes will apply to new notes
  }
  
  /**
   * Get output node for connection to audio graph
   */
  getOutput(): GainNode {
    return this.output
  }
  
  /**
   * Stop all notes
   */
  panic() {
    const notes = Array.from(this.voices.keys())
    notes.forEach(note => this.stopNote(note))
  }
  
  /**
   * Cleanup
   */
  dispose() {
    this.panic()
    this.lfo?.stop()
    this.lfo?.disconnect()
    this.lfoGain?.disconnect()
    this.output.disconnect()
  }
  
  private midiToFreq(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12)
  }
}
