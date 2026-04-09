/**
 * FS-AUDIO 8-Band Parametric EQ
 * Professional equalizer with spectrum analyzer
 */

export interface EQBand {
  frequency: number  // Hz
  gain: number       // dB (-18 to +18)
  q: number          // Quality factor (0.1 to 10)
  type: BiquadFilterType
}

export interface ParametricEQ8Params {
  bands: EQBand[]
  output: number     // Output gain in dB
  enabled: boolean
}

export class ParametricEQ8 {
  private context: AudioContext
  private input: GainNode
  private output: GainNode
  private filters: BiquadFilterNode[] = []
  private analyser: AnalyserNode
  
  // Default bands (standard mixing frequencies)
  private static readonly DEFAULT_BANDS: EQBand[] = [
    { frequency: 30, gain: 0, q: 0.7, type: 'lowshelf' },
    { frequency: 100, gain: 0, q: 1.0, type: 'peaking' },
    { frequency: 250, gain: 0, q: 1.0, type: 'peaking' },
    { frequency: 750, gain: 0, q: 1.0, type: 'peaking' },
    { frequency: 2000, gain: 0, q: 1.0, type: 'peaking' },
    { frequency: 5000, gain: 0, q: 1.0, type: 'peaking' },
    { frequency: 10000, gain: 0, q: 1.0, type: 'peaking' },
    { frequency: 16000, gain: 0, q: 0.7, type: 'highshelf' }
  ]
  
  constructor(context: AudioContext) {
    this.context = context
    
    // Create I/O nodes
    this.input = context.createGain()
    this.output = context.createGain()
    
    // Create analyser for spectrum display
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    
    // Create 8 filter bands
    let prevNode: AudioNode = this.input
    
    for (let i = 0; i < 8; i++) {
      const filter = context.createBiquadFilter()
      const band = ParametricEQ8.DEFAULT_BANDS[i]
      
      filter.type = band.type
      filter.frequency.value = band.frequency
      filter.Q.value = band.q
      filter.gain.value = band.gain
      
      prevNode.connect(filter)
      this.filters.push(filter)
      prevNode = filter
    }
    
    // Connect last filter to analyser and output
    prevNode.connect(this.analyser)
    this.analyser.connect(this.output)
  }
  
  /**
   * Update a specific band
   */
  updateBand(bandIndex: number, band: Partial<EQBand>) {
    if (bandIndex < 0 || bandIndex >= this.filters.length) return
    
    const filter = this.filters[bandIndex]
    
    if (band.frequency !== undefined) {
      filter.frequency.value = Math.max(20, Math.min(20000, band.frequency))
    }
    if (band.gain !== undefined) {
      filter.gain.value = Math.max(-18, Math.min(18, band.gain))
    }
    if (band.q !== undefined) {
      filter.Q.value = Math.max(0.1, Math.min(10, band.q))
    }
    if (band.type !== undefined) {
      filter.type = band.type
    }
  }
  
  /**
   * Update all bands at once
   */
  updateAllBands(bands: EQBand[]) {
    bands.forEach((band, index) => {
      this.updateBand(index, band)
    })
  }
  
  /**
   * Get frequency response for visualization
   * Returns array of gains (dB) at specified frequencies
   */
  getFrequencyResponse(frequencies: Float32Array): Float32Array {
    const magResponse = new Float32Array(frequencies.length)
    const phaseResponse = new Float32Array(frequencies.length)
    
    // Calculate combined response of all filters
    const combinedMag = new Float32Array(frequencies.length).fill(1)
    
    for (const filter of this.filters) {
      const tempMag = new Float32Array(frequencies.length)
      const tempPhase = new Float32Array(frequencies.length)
      
      filter.getFrequencyResponse(frequencies, tempMag, tempPhase)
      
      // Multiply magnitudes
      for (let i = 0; i < frequencies.length; i++) {
        combinedMag[i] *= tempMag[i]
      }
    }
    
    // Convert to dB
    for (let i = 0; i < frequencies.length; i++) {
      magResponse[i] = 20 * Math.log10(Math.max(combinedMag[i], 0.00001))
    }
    
    return magResponse
  }
  
  /**
   * Get spectrum analyzer data
   */
  getSpectrum(): Float32Array {
    const data = new Float32Array(this.analyser.frequencyBinCount)
    this.analyser.getFloatFrequencyData(data)
    return data
  }
  
  /**
   * Reset all bands to flat
   */
  reset() {
    this.filters.forEach((filter, i) => {
      const band = ParametricEQ8.DEFAULT_BANDS[i]
      filter.frequency.value = band.frequency
      filter.Q.value = band.q
      filter.gain.value = 0
      filter.type = band.type
    })
  }
  
  /**
   * Get current band settings
   */
  getBands(): EQBand[] {
    return this.filters.map(filter => ({
      frequency: filter.frequency.value,
      gain: filter.gain.value,
      q: filter.Q.value,
      type: filter.type
    }))
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
    this.filters.forEach(f => f.disconnect())
  }
}
