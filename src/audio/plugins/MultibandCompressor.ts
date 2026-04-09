/**
 * FS-AUDIO 3-Band Multiband Compressor
 * Separate compression for low, mid, and high frequencies
 */

export interface CompressorBand {
  threshold: number   // dB (-60 to 0)
  ratio: number       // 1 to 20
  attack: number      // ms (0.1 to 100)
  release: number     // ms (10 to 1000)
  makeup: number      // dB (0 to 24)
}

export interface MultibandCompressorParams {
  lowBand: CompressorBand
  midBand: CompressorBand
  highBand: CompressorBand
  lowCrossover: number   // Hz (50 to 500)
  highCrossover: number  // Hz (2000 to 10000)
  mix: number            // 0 to 1
  enabled: boolean
}

export class MultibandCompressor {
  private context: AudioContext
  private input: GainNode
  private output: GainNode
  private wetGain: GainNode
  private dryGain: GainNode
  
  // Crossover filters
  private lowpassLow: BiquadFilterNode
  private highpassMid: BiquadFilterNode
  private lowpassMid: BiquadFilterNode
  private highpassHigh: BiquadFilterNode
  
  // Compressors for each band
  private lowCompressor: DynamicsCompressorNode
  private midCompressor: DynamicsCompressorNode
  private highCompressor: DynamicsCompressorNode
  
  // Makeup gains
  private lowMakeup: GainNode
  private midMakeup: GainNode
  private highMakeup: GainNode
  
  // Analysers for gain reduction metering
  private lowAnalyser: AnalyserNode
  private midAnalyser: AnalyserNode
  private highAnalyser: AnalyserNode
  
  constructor(context: AudioContext) {
    this.context = context
    
    // Create I/O nodes
    this.input = context.createGain()
    this.output = context.createGain()
    this.wetGain = context.createGain()
    this.dryGain = context.createGain()
    this.wetGain.gain.value = 1
    this.dryGain.gain.value = 0
    
    // Connect dry path
    this.input.connect(this.dryGain)
    this.dryGain.connect(this.output)
    
    // === LOW BAND (below lowCrossover) ===
    this.lowpassLow = context.createBiquadFilter()
    this.lowpassLow.type = 'lowpass'
    this.lowpassLow.frequency.value = 200
    this.lowpassLow.Q.value = 0.707
    
    this.lowCompressor = context.createDynamicsCompressor()
    this.lowCompressor.threshold.value = -24
    this.lowCompressor.ratio.value = 4
    this.lowCompressor.attack.value = 0.003
    this.lowCompressor.release.value = 0.25
    this.lowCompressor.knee.value = 30
    
    this.lowMakeup = context.createGain()
    this.lowMakeup.gain.value = 1
    
    this.lowAnalyser = context.createAnalyser()
    this.lowAnalyser.fftSize = 256
    
    this.input.connect(this.lowpassLow)
    this.lowpassLow.connect(this.lowCompressor)
    this.lowCompressor.connect(this.lowMakeup)
    this.lowMakeup.connect(this.lowAnalyser)
    this.lowAnalyser.connect(this.wetGain)
    
    // === MID BAND (lowCrossover to highCrossover) ===
    this.highpassMid = context.createBiquadFilter()
    this.highpassMid.type = 'highpass'
    this.highpassMid.frequency.value = 200
    this.highpassMid.Q.value = 0.707
    
    this.lowpassMid = context.createBiquadFilter()
    this.lowpassMid.type = 'lowpass'
    this.lowpassMid.frequency.value = 4000
    this.lowpassMid.Q.value = 0.707
    
    this.midCompressor = context.createDynamicsCompressor()
    this.midCompressor.threshold.value = -24
    this.midCompressor.ratio.value = 4
    this.midCompressor.attack.value = 0.003
    this.midCompressor.release.value = 0.25
    this.midCompressor.knee.value = 30
    
    this.midMakeup = context.createGain()
    this.midMakeup.gain.value = 1
    
    this.midAnalyser = context.createAnalyser()
    this.midAnalyser.fftSize = 256
    
    this.input.connect(this.highpassMid)
    this.highpassMid.connect(this.lowpassMid)
    this.lowpassMid.connect(this.midCompressor)
    this.midCompressor.connect(this.midMakeup)
    this.midMakeup.connect(this.midAnalyser)
    this.midAnalyser.connect(this.wetGain)
    
    // === HIGH BAND (above highCrossover) ===
    this.highpassHigh = context.createBiquadFilter()
    this.highpassHigh.type = 'highpass'
    this.highpassHigh.frequency.value = 4000
    this.highpassHigh.Q.value = 0.707
    
    this.highCompressor = context.createDynamicsCompressor()
    this.highCompressor.threshold.value = -24
    this.highCompressor.ratio.value = 4
    this.highCompressor.attack.value = 0.003
    this.highCompressor.release.value = 0.25
    this.highCompressor.knee.value = 30
    
    this.highMakeup = context.createGain()
    this.highMakeup.gain.value = 1
    
    this.highAnalyser = context.createAnalyser()
    this.highAnalyser.fftSize = 256
    
    this.input.connect(this.highpassHigh)
    this.highpassHigh.connect(this.highCompressor)
    this.highCompressor.connect(this.highMakeup)
    this.highMakeup.connect(this.highAnalyser)
    this.highAnalyser.connect(this.wetGain)
    
    // Connect wet to output
    this.wetGain.connect(this.output)
  }
  
  /**
   * Update low band compressor
   */
  updateLowBand(params: Partial<CompressorBand>) {
    if (params.threshold !== undefined) {
      this.lowCompressor.threshold.value = params.threshold
    }
    if (params.ratio !== undefined) {
      this.lowCompressor.ratio.value = params.ratio
    }
    if (params.attack !== undefined) {
      this.lowCompressor.attack.value = params.attack / 1000 // ms to seconds
    }
    if (params.release !== undefined) {
      this.lowCompressor.release.value = params.release / 1000
    }
    if (params.makeup !== undefined) {
      this.lowMakeup.gain.value = Math.pow(10, params.makeup / 20) // dB to linear
    }
  }
  
  /**
   * Update mid band compressor
   */
  updateMidBand(params: Partial<CompressorBand>) {
    if (params.threshold !== undefined) {
      this.midCompressor.threshold.value = params.threshold
    }
    if (params.ratio !== undefined) {
      this.midCompressor.ratio.value = params.ratio
    }
    if (params.attack !== undefined) {
      this.midCompressor.attack.value = params.attack / 1000
    }
    if (params.release !== undefined) {
      this.midCompressor.release.value = params.release / 1000
    }
    if (params.makeup !== undefined) {
      this.midMakeup.gain.value = Math.pow(10, params.makeup / 20)
    }
  }
  
  /**
   * Update high band compressor
   */
  updateHighBand(params: Partial<CompressorBand>) {
    if (params.threshold !== undefined) {
      this.highCompressor.threshold.value = params.threshold
    }
    if (params.ratio !== undefined) {
      this.highCompressor.ratio.value = params.ratio
    }
    if (params.attack !== undefined) {
      this.highCompressor.attack.value = params.attack / 1000
    }
    if (params.release !== undefined) {
      this.highCompressor.release.value = params.release / 1000
    }
    if (params.makeup !== undefined) {
      this.highMakeup.gain.value = Math.pow(10, params.makeup / 20)
    }
  }
  
  /**
   * Update crossover frequencies
   */
  updateCrossovers(lowFreq: number, highFreq: number) {
    // Low band cutoff
    this.lowpassLow.frequency.value = lowFreq
    
    // Mid band bandpass
    this.highpassMid.frequency.value = lowFreq
    this.lowpassMid.frequency.value = highFreq
    
    // High band cutoff
    this.highpassHigh.frequency.value = highFreq
  }
  
  /**
   * Update mix (wet/dry)
   */
  updateMix(mix: number) {
    const wetGain = Math.max(0, Math.min(1, mix))
    const dryGain = 1 - wetGain
    
    this.wetGain.gain.value = wetGain
    this.dryGain.gain.value = dryGain
  }
  
  /**
   * Get gain reduction for each band (for metering)
   * Returns approximate dB reduction
   */
  getGainReduction(): { low: number; mid: number; high: number } {
    // DynamicsCompressorNode doesn't expose reduction directly
    // This is an approximation based on the compressor's reduction parameter
    return {
      low: this.lowCompressor.reduction,
      mid: this.midCompressor.reduction,
      high: this.highCompressor.reduction
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
    this.wetGain.disconnect()
    this.dryGain.disconnect()
    
    this.lowpassLow.disconnect()
    this.lowCompressor.disconnect()
    this.lowMakeup.disconnect()
    this.lowAnalyser.disconnect()
    
    this.highpassMid.disconnect()
    this.lowpassMid.disconnect()
    this.midCompressor.disconnect()
    this.midMakeup.disconnect()
    this.midAnalyser.disconnect()
    
    this.highpassHigh.disconnect()
    this.highCompressor.disconnect()
    this.highMakeup.disconnect()
    this.highAnalyser.disconnect()
  }
}
