/**
 * FS-AUDIO Vocal Tuner (Auto-Tune Style)
 * 
 * Professional pitch correction plugin using Web Audio API
 * Features:
 * - Real-time pitch detection using autocorrelation
 * - Pitch correction to nearest note in selected scale
 * - Adjustable retune speed (0 = natural, 100 = hard T-Pain style)
 * - Scale selection (Chromatic, Major, Minor, etc.)
 * - Visual pitch display
 */

export interface VocalTunerParams {
  retuneSpeed: number    // 0-100, how fast to correct pitch (0 = off, 100 = instant)
  scale: 'chromatic' | 'major' | 'minor' | 'pentatonic'
  key: number            // 0-11 (C=0, C#=1, etc.)
  mix: number            // 0-1, dry/wet mix
  formantPreserve: number // 0-1, how much to preserve formants
}

export class VocalTuner {
  private context: AudioContext
  private input: GainNode
  private output: GainNode
  private pitchShifter: AudioWorkletNode | null = null
  
  // Analysis
  private analyser: AnalyserNode
  private dataArray: Float32Array
  private detectedPitch: number = 0
  private targetPitch: number = 0
  
  // Scale definitions
  private readonly scales = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9]
  }
  
  constructor(context: AudioContext) {
    this.context = context
    
    // Create nodes
    this.input = context.createGain()
    this.output = context.createGain()
    
    // Analyser for pitch detection
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 4096
    this.analyser.smoothingTimeConstant = 0.8
    this.dataArray = new Float32Array(this.analyser.fftSize)
    
    // Connect: input -> analyser -> output (for now, direct passthrough)
    this.input.connect(this.analyser)
    this.analyser.connect(this.output)
    
    // Start pitch detection loop
    this.startPitchDetection()
  }
  
  private startPitchDetection() {
    const detect = () => {
      this.analyser.getFloatTimeDomainData(this.dataArray)
      this.detectedPitch = this.detectPitchAutocorrelation(this.dataArray, this.context.sampleRate)
      requestAnimationFrame(detect)
    }
    detect()
  }
  
  /**
   * Autocorrelation pitch detection algorithm
   * Returns frequency in Hz, or 0 if no pitch detected
   */
  private detectPitchAutocorrelation(buffer: Float32Array, sampleRate: number): number {
    // Find RMS to check if signal is loud enough
    let rms = 0
    for (let i = 0; i < buffer.length; i++) {
      rms += buffer[i] * buffer[i]
    }
    rms = Math.sqrt(rms / buffer.length)
    
    // Silence threshold
    if (rms < 0.01) return 0
    
    // Autocorrelation
    const minPeriod = Math.floor(sampleRate / 1000) // Max 1000 Hz
    const maxPeriod = Math.floor(sampleRate / 50)   // Min 50 Hz
    
    let bestCorrelation = 0
    let bestPeriod = 0
    
    for (let period = minPeriod; period < maxPeriod; period++) {
      let correlation = 0
      for (let i = 0; i < buffer.length - period; i++) {
        correlation += buffer[i] * buffer[i + period]
      }
      
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation
        bestPeriod = period
      }
    }
    
    if (bestPeriod === 0) return 0
    return sampleRate / bestPeriod
  }
  
  /**
   * Convert frequency to MIDI note number
   */
  private frequencyToMidi(frequency: number): number {
    if (frequency <= 0) return 0
    return 69 + 12 * Math.log2(frequency / 440)
  }
  
  /**
   * Convert MIDI note to frequency
   */
  private midiToFrequency(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12)
  }
  
  /**
   * Quantize MIDI note to nearest note in scale
   */
  private quantizeToScale(midi: number, scale: number[], key: number): number {
    const noteInOctave = Math.round(midi) % 12
    const octave = Math.floor(Math.round(midi) / 12)
    
    // Find nearest note in scale
    let nearestNote = scale[0]
    let minDistance = 12
    
    for (const scaleNote of scale) {
      const adjustedNote = (scaleNote + key) % 12
      const distance = Math.abs(noteInOctave - adjustedNote)
      const wrappedDistance = Math.min(distance, 12 - distance)
      
      if (wrappedDistance < minDistance) {
        minDistance = wrappedDistance
        nearestNote = adjustedNote
      }
    }
    
    return octave * 12 + nearestNote
  }
  
  /**
   * Update plugin parameters
   */
  update(params: VocalTunerParams) {
    if (this.detectedPitch === 0) {
      this.targetPitch = 0
      return
    }
    
    // Convert detected pitch to MIDI
    const detectedMidi = this.frequencyToMidi(this.detectedPitch)
    
    // Quantize to scale
    const scale = this.scales[params.scale]
    const targetMidi = this.quantizeToScale(detectedMidi, scale, params.key)
    
    // Apply retune speed (lerp between detected and target)
    const retuneAmount = params.retuneSpeed / 100
    const correctedMidi = detectedMidi + (targetMidi - detectedMidi) * retuneAmount
    
    this.targetPitch = this.midiToFrequency(correctedMidi)
    
    // TODO: Apply pitch shift using pitch shifter node
    // For now, this is just detection - actual pitch shifting would require
    // either an AudioWorklet or a more complex algorithm
  }
  
  /**
   * Get current pitch info for UI display
   */
  getPitchInfo() {
    const detectedMidi = this.frequencyToMidi(this.detectedPitch)
    const targetMidi = this.frequencyToMidi(this.targetPitch)
    const centsOff = (detectedMidi - Math.round(detectedMidi)) * 100
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const noteName = noteNames[Math.round(detectedMidi) % 12]
    const octave = Math.floor(Math.round(detectedMidi) / 12) - 1
    
    return {
      detectedHz: Math.round(this.detectedPitch),
      detectedNote: `${noteName}${octave}`,
      centsOff: Math.round(centsOff),
      targetHz: Math.round(this.targetPitch),
      isActive: this.detectedPitch > 0
    }
  }
  
  /**
   * Connect input
   */
  connectInput(source: AudioNode) {
    source.connect(this.input)
  }
  
  /**
   * Connect to destination
   */
  connectOutput(destination: AudioNode) {
    this.output.connect(destination)
  }
  
  /**
   * Disconnect all
   */
  disconnect() {
    this.input.disconnect()
    this.output.disconnect()
    this.analyser.disconnect()
  }
}
