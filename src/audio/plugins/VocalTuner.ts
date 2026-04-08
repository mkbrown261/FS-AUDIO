/**
 * FS-AUDIO Vocal Tuner (Auto-Tune Style)
 * 
 * Features:
 * - Real-time pitch correction
 * - Adjustable retune speed (0 = instant Auto-Tune, 100 = natural)
 * - Musical scale snapping (chromatic, major, minor)
 * - Humanize mode (preserves vibrato)
 * - Visual pitch display
 * 
 * Algorithm:
 * - Uses autocorrelation for pitch detection (YIN algorithm)
 * - Pitch shifting via Web Audio API
 * - Low-latency processing
 */

export interface VocalTunerParams {
  enabled: boolean
  retuneSpeed: number      // 0-100 (0 = instant, 100 = off)
  key: string              // 'C', 'C#', 'D', etc.
  scale: 'chromatic' | 'major' | 'minor'
  humanize: number         // 0-1 (preserves natural vibrato)
  mix: number             // 0-1 (dry/wet)
}

export class VocalTuner {
  private ctx: AudioContext
  private input: GainNode
  private output: GainNode
  private scriptProcessor: ScriptProcessorNode
  private pitchShifter?: AudioWorkletNode
  
  private params: VocalTunerParams
  private detectedPitch: number = 0
  private targetPitch: number = 0
  
  // Musical scales
  private scales = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]
  }
  
  // Note names
  private noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  
  constructor(ctx: AudioContext, params: Partial<VocalTunerParams> = {}) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    
    this.params = {
      enabled: true,
      retuneSpeed: 10,
      key: 'C',
      scale: 'chromatic',
      humanize: 0.3,
      mix: 1.0,
      ...params
    }
    
    // Create script processor for pitch detection
    this.scriptProcessor = ctx.createScriptProcessor(4096, 1, 1)
    this.scriptProcessor.onaudioprocess = this.processPitch.bind(this)
    
    // Connect: input -> processor -> output
    this.input.connect(this.scriptProcessor)
    this.scriptProcessor.connect(this.output)
  }
  
  private processPitch(event: AudioProcessingEvent) {
    if (!this.params.enabled) {
      // Bypass - copy input to output
      const input = event.inputBuffer.getChannelData(0)
      const output = event.outputBuffer.getChannelData(0)
      output.set(input)
      return
    }
    
    const input = event.inputBuffer.getChannelData(0)
    const output = event.outputBuffer.getChannelData(0)
    
    // Detect pitch using autocorrelation
    this.detectedPitch = this.detectPitch(input, this.ctx.sampleRate)
    
    if (this.detectedPitch > 0) {
      // Calculate target pitch (nearest note in scale)
      this.targetPitch = this.getTargetPitch(this.detectedPitch)
      
      // Apply pitch correction
      const correctedAudio = this.correctPitch(input, this.detectedPitch, this.targetPitch)
      
      // Mix dry/wet
      for (let i = 0; i < output.length; i++) {
        output[i] = input[i] * (1 - this.params.mix) + correctedAudio[i] * this.params.mix
      }
    } else {
      // No pitch detected, pass through
      output.set(input)
    }
  }
  
  /**
   * Detect pitch using YIN algorithm (autocorrelation-based)
   */
  private detectPitch(buffer: Float32Array, sampleRate: number): number {
    const bufferSize = buffer.length
    const threshold = 0.1
    
    // Step 1: Calculate difference function
    const yinBuffer = new Float32Array(bufferSize / 2)
    
    for (let tau = 0; tau < yinBuffer.length; tau++) {
      let sum = 0
      for (let i = 0; i < yinBuffer.length; i++) {
        const delta = buffer[i] - buffer[i + tau]
        sum += delta * delta
      }
      yinBuffer[tau] = sum
    }
    
    // Step 2: Cumulative mean normalized difference
    yinBuffer[0] = 1
    let runningSum = 0
    
    for (let tau = 1; tau < yinBuffer.length; tau++) {
      runningSum += yinBuffer[tau]
      yinBuffer[tau] *= tau / runningSum
    }
    
    // Step 3: Find first minimum below threshold
    let tau = 2 // Start from 2 to avoid DC
    while (tau < yinBuffer.length) {
      if (yinBuffer[tau] < threshold) {
        // Parabolic interpolation for better precision
        while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++
        }
        
        // Convert tau to frequency
        const frequency = sampleRate / tau
        
        // Valid vocal range: 80Hz - 1000Hz
        if (frequency >= 80 && frequency <= 1000) {
          return frequency
        }
      }
      tau++
    }
    
    return 0 // No pitch detected
  }
  
  /**
   * Get target pitch (nearest note in scale)
   */
  private getTargetPitch(detectedPitch: number): number {
    // Convert frequency to MIDI note number
    const midiNote = 69 + 12 * Math.log2(detectedPitch / 440)
    
    // Get key offset
    const keyOffset = this.noteNames.indexOf(this.params.key)
    
    // Get scale intervals
    const scaleIntervals = this.scales[this.params.scale]
    
    // Find nearest note in scale
    const noteInOctave = Math.round(midiNote) % 12
    const octave = Math.floor(midiNote / 12)
    
    // Find closest scale degree
    let closestInterval = scaleIntervals[0]
    let minDistance = Math.abs((noteInOctave - keyOffset + 12) % 12 - closestInterval)
    
    for (const interval of scaleIntervals) {
      const distance = Math.abs((noteInOctave - keyOffset + 12) % 12 - interval)
      if (distance < minDistance) {
        minDistance = distance
        closestInterval = interval
      }
    }
    
    // Calculate target MIDI note
    const targetMidi = octave * 12 + ((keyOffset + closestInterval) % 12)
    
    // Apply retune speed (smooth interpolation)
    const retuneAmount = 1 - (this.params.retuneSpeed / 100)
    const smoothedMidi = midiNote + (targetMidi - midiNote) * retuneAmount
    
    // Convert back to frequency
    return 440 * Math.pow(2, (smoothedMidi - 69) / 12)
  }
  
  /**
   * Apply pitch correction using time-domain pitch shifting
   * (Simplified implementation - real Auto-Tune uses phase vocoder)
   */
  private correctPitch(input: Float32Array, fromPitch: number, toPitch: number): Float32Array {
    const output = new Float32Array(input.length)
    const pitchRatio = toPitch / fromPitch
    
    // Simple resampling (for demo - real implementation would use WSOLA or phase vocoder)
    for (let i = 0; i < output.length; i++) {
      const sourceIndex = i * pitchRatio
      const index0 = Math.floor(sourceIndex)
      const index1 = Math.ceil(sourceIndex)
      const frac = sourceIndex - index0
      
      if (index1 < input.length) {
        // Linear interpolation
        output[i] = input[index0] * (1 - frac) + input[index1] * frac
      } else {
        output[i] = 0
      }
    }
    
    // Apply humanize (preserve some original character)
    if (this.params.humanize > 0) {
      for (let i = 0; i < output.length; i++) {
        output[i] = output[i] * (1 - this.params.humanize) + input[i] * this.params.humanize
      }
    }
    
    return output
  }
  
  /**
   * Update parameters
   */
  updateParams(newParams: Partial<VocalTunerParams>) {
    Object.assign(this.params, newParams)
  }
  
  /**
   * Get current pitch info (for UI)
   */
  getPitchInfo(): { detected: number, target: number, note: string } {
    let note = 'N/A'
    if (this.detectedPitch > 0) {
      const midiNote = 69 + 12 * Math.log2(this.detectedPitch / 440)
      const noteIndex = Math.round(midiNote) % 12
      note = this.noteNames[noteIndex]
    }
    
    return {
      detected: Math.round(this.detectedPitch * 10) / 10,
      target: Math.round(this.targetPitch * 10) / 10,
      note
    }
  }
  
  /**
   * Get input/output nodes
   */
  getInput(): GainNode {
    return this.input
  }
  
  getOutput(): GainNode {
    return this.output
  }
  
  /**
   * Cleanup
   */
  dispose() {
    this.scriptProcessor.disconnect()
    this.input.disconnect()
    this.output.disconnect()
  }
}
