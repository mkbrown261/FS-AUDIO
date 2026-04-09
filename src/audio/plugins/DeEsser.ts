/**
 * FS-AUDIO De-Esser
 * Frequency-specific compression for sibilance (4-10 kHz)
 */

export interface DeEsserParams {
  frequency: number    // Center frequency (4000-10000 Hz)
  threshold: number    // dB threshold (-60 to 0)
  ratio: number        // Compression ratio (1 to 10)
  range: number        // Max reduction in dB (0 to 20)
  listen: boolean      // Solo the detection band
  enabled: boolean
}

export class DeEsser {
  private context: AudioContext
  private input: GainNode
  private output: GainNode
  
  // Signal path
  private mainPath: GainNode
  private detectionPath: GainNode
  
  // Detection filter (bandpass around sibilance freq)
  private detectionFilter: BiquadFilterNode
  
  // Dynamic processing
  private compressor: DynamicsCompressorNode
  
  // High-frequency attenuation
  private sibilanceFilter: BiquadFilterNode
  private attenuationGain: GainNode
  
  // Analyser for metering
  private analyser: AnalyserNode
  private detectionAnalyser: AnalyserNode
  
  private listenMode: boolean = false
  
  constructor(context: AudioContext) {
    this.context = context
    
    // Create I/O nodes
    this.input = context.createGain()
    this.output = context.createGain()
    this.mainPath = context.createGain()
    this.detectionPath = context.createGain()
    
    // Split signal for detection
    this.input.connect(this.mainPath)
    this.input.connect(this.detectionPath)
    
    // === DETECTION PATH ===
    // Bandpass filter to isolate sibilance frequencies
    this.detectionFilter = context.createBiquadFilter()
    this.detectionFilter.type = 'bandpass'
    this.detectionFilter.frequency.value = 7000 // Default 7kHz
    this.detectionFilter.Q.value = 2.0 // Narrow band
    
    this.detectionAnalyser = context.createAnalyser()
    this.detectionAnalyser.fftSize = 256
    this.detectionAnalyser.smoothingTimeConstant = 0.8
    
    this.detectionPath.connect(this.detectionFilter)
    this.detectionFilter.connect(this.detectionAnalyser)
    
    // === MAIN PATH ===
    // High-frequency filter for attenuation
    this.sibilanceFilter = context.createBiquadFilter()
    this.sibilanceFilter.type = 'peaking'
    this.sibilanceFilter.frequency.value = 7000
    this.sibilanceFilter.Q.value = 1.5
    this.sibilanceFilter.gain.value = 0 // Controlled dynamically
    
    this.attenuationGain = context.createGain()
    this.attenuationGain.gain.value = 1
    
    // Compressor for dynamic control
    this.compressor = context.createDynamicsCompressor()
    this.compressor.threshold.value = -24
    this.compressor.ratio.value = 6
    this.compressor.attack.value = 0.001 // 1ms - fast attack for sibilance
    this.compressor.release.value = 0.1 // 100ms
    this.compressor.knee.value = 6
    
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    
    this.mainPath.connect(this.sibilanceFilter)
    this.sibilanceFilter.connect(this.compressor)
    this.compressor.connect(this.attenuationGain)
    this.attenuationGain.connect(this.analyser)
    this.analyser.connect(this.output)
  }
  
  /**
   * Update de-esser parameters
   */
  updateParams(params: Partial<DeEsserParams>) {
    if (params.frequency !== undefined) {
      const freq = Math.max(4000, Math.min(10000, params.frequency))
      this.detectionFilter.frequency.value = freq
      this.sibilanceFilter.frequency.value = freq
    }
    
    if (params.threshold !== undefined) {
      this.compressor.threshold.value = params.threshold
    }
    
    if (params.ratio !== undefined) {
      this.compressor.ratio.value = Math.max(1, Math.min(10, params.ratio))
    }
    
    if (params.range !== undefined) {
      // Max reduction controls the makeup gain
      const maxReduction = Math.max(0, Math.min(20, params.range))
      // Negative gain for attenuation
      this.sibilanceFilter.gain.value = -maxReduction / 2
    }
    
    if (params.listen !== undefined) {
      this.setListenMode(params.listen)
    }
  }
  
  /**
   * Enable/disable listen mode (solo detection band)
   */
  setListenMode(listen: boolean) {
    this.listenMode = listen
    
    if (listen) {
      // Disconnect main path and connect detection path to output
      this.mainPath.disconnect()
      this.detectionAnalyser.connect(this.output)
    } else {
      // Reconnect main path
      this.detectionAnalyser.disconnect(this.output)
      if (this.mainPath.numberOfOutputs === 0) {
        this.mainPath.connect(this.sibilanceFilter)
      }
    }
  }
  
  /**
   * Get current gain reduction (dB)
   */
  getReduction(): number {
    return this.compressor.reduction
  }
  
  /**
   * Get detection band level (for metering)
   */
  getDetectionLevel(): number {
    const data = new Float32Array(this.detectionAnalyser.frequencyBinCount)
    this.detectionAnalyser.getFloatFrequencyData(data)
    
    // Get average level
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      sum += data[i]
    }
    return sum / data.length
  }
  
  /**
   * Get spectrum data for visualization
   */
  getSpectrum(): Float32Array {
    const data = new Float32Array(this.analyser.frequencyBinCount)
    this.analyser.getFloatFrequencyData(data)
    return data
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
    this.mainPath.disconnect()
    this.detectionPath.disconnect()
    this.detectionFilter.disconnect()
    this.detectionAnalyser.disconnect()
    this.sibilanceFilter.disconnect()
    this.compressor.disconnect()
    this.attenuationGain.disconnect()
    this.analyser.disconnect()
  }
}
