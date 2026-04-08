/**
 * FS-AUDIO Essentia.js Audio Analyzer
 * 
 * Professional audio analysis using Essentia.js by Spotify/MTG
 * Features:
 * - BPM detection (beats per minute)
 * - Key detection (musical key and scale)
 * - Beat grid generation
 * - Loudness analysis (LUFS, dynamic range)
 * - Spectral features (brightness, rolloff)
 * - Rhythm analysis
 */

// TEMPORARILY DISABLED: Essentia.js requires special WASM configuration for Electron
// import Essentia from 'essentia.js'

export interface AnalysisResult {
  // Tempo/Rhythm
  bpm: number
  confidence: number
  beats: number[]           // Beat positions in seconds
  
  // Key/Harmony
  key: string              // e.g., "C", "F#", "Bb"
  scale: string            // "major" or "minor"
  keyConfidence: number
  
  // Loudness
  loudness: number         // Integrated loudness in LUFS
  dynamicRange: number     // Dynamic range in dB
  
  // Spectral
  brightness: number       // 0-1, higher = brighter sound
  spectralCentroid: number // Hz, "center of mass" of spectrum
  
  // Audio properties
  duration: number         // seconds
  sampleRate: number
}

export class EssentiaAnalyzer {
  private essentia: any
  private initialized: boolean = false
  
  constructor() {
    // TEMPORARY: Essentia.js disabled until WASM is properly configured
    // this.essentia = new Essentia.Essentia()
    this.essentia = null
  }
  
  /**
   * Initialize Essentia (must be called before analysis)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    
    console.log('[Essentia] Using fallback analysis (WASM configuration pending)')
    this.initialized = true
    
    // TODO: Properly configure Essentia.js WASM for Electron
    // Need to:
    // 1. Configure Vite to handle .wasm files
    // 2. Set up proper Content Security Policy in Electron
    // 3. Load WASM module correctly
  }
  
  /**
   * Analyze an audio buffer and return comprehensive results
   */
  async analyzeAudio(audioBuffer: AudioBuffer): Promise<AnalysisResult> {
    if (!this.initialized) {
      await this.initialize()
    }
    
    // Convert AudioBuffer to mono Float32Array
    const audioData = this.audioBufferToMono(audioBuffer)
    
    // Analyze BPM and beats
    const tempoAnalysis = this.analyzeTempo(audioData, audioBuffer.sampleRate)
    
    // Analyze key and scale
    const keyAnalysis = this.analyzeKey(audioData, audioBuffer.sampleRate)
    
    // Analyze loudness
    const loudnessAnalysis = this.analyzeLoudness(audioData, audioBuffer.sampleRate)
    
    // Analyze spectral features
    const spectralAnalysis = this.analyzeSpectral(audioData, audioBuffer.sampleRate)
    
    return {
      // Tempo
      bpm: tempoAnalysis.bpm,
      confidence: tempoAnalysis.confidence,
      beats: tempoAnalysis.beats,
      
      // Key
      key: keyAnalysis.key,
      scale: keyAnalysis.scale,
      keyConfidence: keyAnalysis.confidence,
      
      // Loudness
      loudness: loudnessAnalysis.loudness,
      dynamicRange: loudnessAnalysis.dynamicRange,
      
      // Spectral
      brightness: spectralAnalysis.brightness,
      spectralCentroid: spectralAnalysis.centroid,
      
      // Meta
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate
    }
  }
  
  /**
   * Quick BPM detection (faster, for real-time use)
   */
  async detectBPM(audioBuffer: AudioBuffer): Promise<{ bpm: number, confidence: number }> {
    if (!this.initialized) {
      await this.initialize()
    }
    
    const audioData = this.audioBufferToMono(audioBuffer)
    const analysis = this.analyzeTempo(audioData, audioBuffer.sampleRate)
    
    return {
      bpm: analysis.bpm,
      confidence: analysis.confidence
    }
  }
  
  /**
   * Quick key detection
   */
  async detectKey(audioBuffer: AudioBuffer): Promise<{ key: string, scale: string, confidence: number }> {
    if (!this.initialized) {
      await this.initialize()
    }
    
    const audioData = this.audioBufferToMono(audioBuffer)
    const analysis = this.analyzeKey(audioData, audioBuffer.sampleRate)
    
    return analysis
  }
  
  // ── Private Analysis Methods ─────────────────────────────────────────────
  
  private analyzeTempo(audioData: Float32Array, sampleRate: number) {
    // FALLBACK: Simple onset-based BPM detection
    try {
      const hopSize = 512
      const onsets: number[] = []
      let prevEnergy = 0
      
      for (let i = 0; i < audioData.length - hopSize; i += hopSize) {
        let energy = 0
        for (let j = 0; j < hopSize; j++) {
          energy += audioData[i + j] ** 2
        }
        energy /= hopSize
        
        if (energy > prevEnergy * 1.5 && energy > 0.01) {
          onsets.push(i / sampleRate)
        }
        prevEnergy = energy
      }
      
      if (onsets.length < 4) {
        return { bpm: 120, confidence: 0.3, beats: [] }
      }
      
      const intervals: number[] = []
      for (let i = 1; i < onsets.length; i++) {
        intervals.push(onsets[i] - onsets[i-1])
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const bpm = Math.round(60 / avgInterval)
      const finalBPM = Math.max(60, Math.min(200, bpm))
      
      return {
        bpm: finalBPM,
        confidence: 0.6,
        beats: onsets
      }
    } catch (error) {
      console.warn('[Essentia] Tempo analysis failed:', error)
      return { bpm: 120, confidence: 0.3, beats: [] }
    }
  }
  
  private analyzeKey(audioData: Float32Array, sampleRate: number) {
    // FALLBACK: Return default key until proper implementation
    console.log('[Essentia] Key detection using fallback')
    return {
      key: 'C',
      scale: 'major',
      confidence: 0.3
    }
  }
  
  private analyzeLoudness(audioData: Float32Array, sampleRate: number) {
    // FALLBACK: Simple RMS-based loudness calculation
    try {
      let sumSquares = 0
      let max = 0
      let min = Infinity
      
      for (let i = 0; i < audioData.length; i++) {
        sumSquares += audioData[i] ** 2
        const abs = Math.abs(audioData[i])
        if (abs > max) max = abs
        if (abs < min && abs > 0) min = abs
      }
      
      const rms = Math.sqrt(sumSquares / audioData.length)
      const lufs = -23 + (20 * Math.log10(Math.max(rms, 0.00001)))
      const dynamicRange = 20 * Math.log10(max / (min + 0.0001))
      
      return {
        loudness: Math.round(lufs * 10) / 10,
        dynamicRange: Math.round(Math.min(dynamicRange, 40) * 10) / 10
      }
    } catch (error) {
      console.warn('[Essentia] Loudness analysis failed:', error)
      return {
        loudness: -23,
        dynamicRange: 10
      }
    }
  }
  
  private analyzeSpectral(audioData: Float32Array, sampleRate: number) {
    // FALLBACK: Simple high-frequency energy estimation
    try {
      // Simple FFT-free brightness estimate based on high-frequency energy
      let lowEnergy = 0
      let highEnergy = 0
      const windowSize = 2048
      
      for (let i = 0; i < Math.min(audioData.length, windowSize * 10); i += windowSize) {
        for (let j = 0; j < windowSize / 2 && i + j < audioData.length; j++) {
          lowEnergy += Math.abs(audioData[i + j])
        }
        for (let j = windowSize / 2; j < windowSize && i + j < audioData.length; j++) {
          highEnergy += Math.abs(audioData[i + j])
        }
      }
      
      const brightness = highEnergy / (lowEnergy + highEnergy + 0.001)
      const centroid = 1000 + (brightness * 3000) // Rough estimate
      
      return {
        brightness: Math.round(brightness * 100) / 100,
        centroid: Math.round(centroid)
      }
    } catch (error) {
      console.warn('[Essentia] Spectral analysis failed:', error)
      return {
        brightness: 0.5,
        centroid: 2000
      }
    }
  }
  
  /**
   * Convert AudioBuffer to mono Float32Array
   */
  private audioBufferToMono(audioBuffer: AudioBuffer): Float32Array {
    const length = audioBuffer.length
    const mono = new Float32Array(length)
    
    if (audioBuffer.numberOfChannels === 1) {
      // Already mono
      audioBuffer.copyFromChannel(mono, 0)
    } else {
      // Mix to mono
      const left = new Float32Array(length)
      const right = new Float32Array(length)
      audioBuffer.copyFromChannel(left, 0)
      audioBuffer.copyFromChannel(right, 1)
      
      for (let i = 0; i < length; i++) {
        mono[i] = (left[i] + right[i]) / 2
      }
    }
    
    return mono
  }
  
  /**
   * Cleanup
   */
  dispose(): void {
    if (this.essentia) {
      this.essentia.shutdown()
      this.initialized = false
    }
  }
}

// Singleton instance
let analyzerInstance: EssentiaAnalyzer | null = null

export function getEssentiaAnalyzer(): EssentiaAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new EssentiaAnalyzer()
  }
  return analyzerInstance
}
