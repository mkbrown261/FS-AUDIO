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

import Essentia from 'essentia.js'

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
    this.essentia = new Essentia.Essentia()
  }
  
  /**
   * Initialize Essentia (must be called before analysis)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    
    try {
      // Essentia.js uses WASM, needs initialization
      await this.essentia.initialize()
      this.initialized = true
      console.log('[Essentia] Initialized successfully')
    } catch (error) {
      console.error('[Essentia] Initialization failed:', error)
      throw error
    }
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
    try {
      // Use RhythmExtractor2013 algorithm (reliable for most music)
      const rhythmResult = this.essentia.RhythmExtractor2013(
        audioData,
        sampleRate,
        'multifeature'  // Use all features for best accuracy
      )
      
      return {
        bpm: Math.round(rhythmResult.bpm || 120),
        confidence: rhythmResult.confidence || 0.5,
        beats: rhythmResult.ticks || []
      }
    } catch (error) {
      console.warn('[Essentia] Tempo analysis failed, using fallback:', error)
      return {
        bpm: 120,
        confidence: 0,
        beats: []
      }
    }
  }
  
  private analyzeKey(audioData: Float32Array, sampleRate: number) {
    try {
      // Use Key algorithm for key/scale detection
      const keyResult = this.essentia.KeyExtractor(audioData, sampleRate, true)
      
      // Map numeric key to note name
      const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      const keyIndex = Math.round(keyResult.key || 0) % 12
      
      return {
        key: keyNames[keyIndex],
        scale: keyResult.scale === 'minor' ? 'minor' : 'major',
        confidence: keyResult.strength || 0.5
      }
    } catch (error) {
      console.warn('[Essentia] Key analysis failed, using fallback:', error)
      return {
        key: 'C',
        scale: 'major',
        confidence: 0
      }
    }
  }
  
  private analyzeLoudness(audioData: Float32Array, sampleRate: number) {
    try {
      // Loudness analysis
      const loudness = this.essentia.Loudness(audioData)
      
      // Dynamic range analysis (simplified)
      let max = 0
      let min = Infinity
      for (let i = 0; i < audioData.length; i++) {
        const abs = Math.abs(audioData[i])
        if (abs > max) max = abs
        if (abs < min && abs > 0) min = abs
      }
      
      const dynamicRange = 20 * Math.log10(max / (min + 0.0001))
      
      // Convert to LUFS (simplified approximation)
      const lufs = -23 + (20 * Math.log10(loudness + 0.0001))
      
      return {
        loudness: Math.round(lufs * 10) / 10,
        dynamicRange: Math.round(dynamicRange * 10) / 10
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
    try {
      // Spectral centroid (brightness)
      const centroid = this.essentia.SpectralCentroidTime(audioData, sampleRate)
      
      // Brightness (0-1, normalized)
      const brightness = Math.min(1, Math.max(0, centroid / (sampleRate / 4)))
      
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
