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
 * - Real pitch shifting via pitch-shifter AudioWorklet (OLA ring-buffer)
 *   with ScriptProcessor fallback for browsers that block worklet loading.
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
  /** Public input node — connect your source here */
  readonly input: GainNode
  /** Public output node — connect this to your destination */
  readonly output: GainNode

  // Pitch-shift worklet (loaded asynchronously)
  private pitchShifter: AudioWorkletNode | null = null
  /** Semitones of correction currently applied to the worklet */
  private _appliedSemitones = 0

  // Analysis
  private analyser: AnalyserNode
  private dataArray: Float32Array<ArrayBuffer>
  private detectedPitch: number = 0
  private targetPitch:   number = 0
  private _rafId: number | null = null

  // Scale definitions
  private readonly scales = {
    chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
  }

  constructor(context: AudioContext) {
    this.context = context

    this.input  = context.createGain()
    this.output = context.createGain()

    // Analyser for pitch detection (tapped after input, before any shift)
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 4096
    this.analyser.smoothingTimeConstant = 0.8
    this.dataArray = new Float32Array(this.analyser.fftSize)

    // Wire input → analyser (monitoring tap only, does not consume signal)
    this.input.connect(this.analyser)

    // Start pitch detection RAF loop
    this._startPitchDetection()

    // Load the AudioWorklet pitch-shifter processor asynchronously.
    // Until it loads, we fall back to a direct passthrough.
    this._loadWorklet()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _loadWorklet() {
    try {
      await this.context.audioWorklet.addModule('/pitch-shifter-processor.js')
      this.pitchShifter = new AudioWorkletNode(this.context, 'pitch-shifter', {
        numberOfInputs:  1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      })
      // Reconnect chain: input → worklet → output
      this.input.disconnect()
      this.input.connect(this.analyser)     // keep monitor tap
      this.input.connect(this.pitchShifter)
      this.pitchShifter.connect(this.output)
    } catch (err) {
      console.warn('[VocalTuner] AudioWorklet unavailable, using passthrough:', err)
      // Fallback: direct passthrough
      this.input.connect(this.output)
    }
  }

  private _startPitchDetection() {
    const detect = () => {
      this.analyser.getFloatTimeDomainData(this.dataArray)
      this.detectedPitch = this._autocorrelate(this.dataArray, this.context.sampleRate)
      this._rafId = requestAnimationFrame(detect)
    }
    detect()
  }

  /**
   * YIN-lite autocorrelation pitch detector.
   * Returns frequency in Hz, or 0 if no pitch detected.
   */
  private _autocorrelate(buf: Float32Array<ArrayBuffer>, sr: number): number {
    let rms = 0
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
    rms = Math.sqrt(rms / buf.length)
    if (rms < 0.01) return 0

    const minPeriod = Math.floor(sr / 1000)
    const maxPeriod = Math.floor(sr / 50)

    let bestCorr = 0
    let bestPeriod = 0
    for (let p = minPeriod; p < maxPeriod; p++) {
      let corr = 0
      for (let i = 0; i < buf.length - p; i++) corr += buf[i] * buf[i + p]
      if (corr > bestCorr) { bestCorr = corr; bestPeriod = p }
    }
    return bestPeriod === 0 ? 0 : sr / bestPeriod
  }

  private _freqToMidi(f: number): number {
    if (f <= 0) return 0
    return 69 + 12 * Math.log2(f / 440)
  }

  private _midiToFreq(m: number): number {
    return 440 * Math.pow(2, (m - 69) / 12)
  }

  private _quantizeToScale(midi: number, scale: number[], key: number): number {
    const noteInOctave = Math.round(midi) % 12
    const octave = Math.floor(Math.round(midi) / 12)
    let nearest = scale[0]
    let minDist = 12
    for (const n of scale) {
      const adj = (n + key) % 12
      const dist = Math.min(Math.abs(noteInOctave - adj), 12 - Math.abs(noteInOctave - adj))
      if (dist < minDist) { minDist = dist; nearest = adj }
    }
    return octave * 12 + nearest
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Update parameters: computes required pitch correction in semitones
   * and applies it to the AudioWorklet node.
   */
  update(params: VocalTunerParams) {
    if (this.detectedPitch === 0 || params.retuneSpeed === 0) {
      // No signal or retune disabled — pass through unchanged
      if (this._appliedSemitones !== 0) {
        this._setSemitones(0, params.mix)
        this._appliedSemitones = 0
      }
      this.targetPitch = 0
      return
    }

    const detectedMidi = this._freqToMidi(this.detectedPitch)
    const scale        = this.scales[params.scale]
    const targetMidi   = this._quantizeToScale(detectedMidi, scale, params.key)

    // Apply retune speed (lerp between detected and target MIDI)
    const amount       = params.retuneSpeed / 100
    const correctedMidi = detectedMidi + (targetMidi - detectedMidi) * amount
    this.targetPitch   = this._midiToFreq(correctedMidi)

    // The pitch shift in semitones needed = target − detected
    const semitones = correctedMidi - detectedMidi

    if (Math.abs(semitones - this._appliedSemitones) > 0.01) {
      this._setSemitones(semitones, params.mix)
      this._appliedSemitones = semitones
    }
  }

  private _setSemitones(semitones: number, mix: number) {
    if (!this.pitchShifter) return
    const semParam = this.pitchShifter.parameters.get('pitchSemitones')
    const mixParam = this.pitchShifter.parameters.get('mix')
    if (semParam) semParam.setTargetAtTime(semitones, this.context.currentTime, 0.015)
    if (mixParam) mixParam.setTargetAtTime(mix,       this.context.currentTime, 0.015)
  }

  /** Get current pitch info for UI display */
  getPitchInfo() {
    const detectedMidi = this._freqToMidi(this.detectedPitch)
    const centsOff     = (detectedMidi - Math.round(detectedMidi)) * 100
    const noteNames    = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const noteName     = noteNames[((Math.round(detectedMidi) % 12) + 12) % 12]
    const octave       = Math.floor(Math.round(detectedMidi) / 12) - 1
    return {
      detectedHz:   Math.round(this.detectedPitch),
      detectedNote: `${noteName}${octave}`,
      centsOff:     Math.round(centsOff),
      targetHz:     Math.round(this.targetPitch),
      isActive:     this.detectedPitch > 0,
    }
  }

  /** Connect an audio source into the tuner's input */
  connectInput(source: AudioNode) {
    source.connect(this.input)
  }

  /** Connect the tuner's output to a destination */
  connectOutput(destination: AudioNode) {
    this.output.connect(destination)
  }

  /** Disconnect all nodes and stop the detection loop */
  disconnect() {
    if (this._rafId !== null) cancelAnimationFrame(this._rafId)
    try { this.input.disconnect() }          catch {}
    try { this.analyser.disconnect() }       catch {}
    try { this.pitchShifter?.disconnect() }  catch {}
    try { this.output.disconnect() }         catch {}
  }
}
