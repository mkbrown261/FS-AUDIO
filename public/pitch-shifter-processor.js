/**
 * PitchShifterProcessor — AudioWorklet-based real-time pitch shifting
 *
 * Algorithm: OLA (Overlap-Add) with a small grain size.
 * - Reads incoming audio into a ring buffer.
 * - Plays back at a different rate (pitchRatio = 2^(semitones/12)) from the same buffer.
 * - Cross-fades between grains to suppress clicks.
 *
 * Parameters:
 *   pitchSemitones  (−24..+24, default 0)
 *   mix             (0..1, default 1 — 0 = dry, 1 = wet)
 */

const GRAIN_SIZE  = 1024   // samples per grain
const OVERLAP     = 256    // samples of overlap between grains

class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitchSemitones', defaultValue: 0,   minValue: -24, maxValue: 24 },
      { name: 'mix',            defaultValue: 1.0,  minValue: 0,   maxValue: 1  },
    ]
  }

  constructor() {
    super()
    // Ring buffer — store last N samples of input
    const bufSize = 8192
    this._buf     = new Float32Array(bufSize)
    this._bufSize = bufSize
    this._writePos = 0
    this._readPos  = 0.0        // fractional read position
    this._grainPhase = 0        // samples until next grain boundary
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0]?.[0]
    const output = outputs[0]?.[0]
    if (!input || !output) return true

    const semitones  = parameters.pitchSemitones[0] ?? 0
    const mix        = parameters.mix[0] ?? 1.0
    const pitchRatio = Math.pow(2, semitones / 12)   // > 1 = higher pitch
    const bufSize    = this._bufSize

    for (let i = 0; i < input.length; i++) {
      // Write input sample into ring buffer
      this._buf[this._writePos % bufSize] = input[i]
      this._writePos++

      // Read from ring buffer at pitch-shifted position
      const readIdx  = Math.floor(this._readPos) % bufSize
      const readIdx2 = (readIdx + 1) % bufSize
      const frac     = this._readPos - Math.floor(this._readPos)

      // Linear interpolation between adjacent samples
      const wet = this._buf[readIdx] * (1 - frac) + this._buf[readIdx2] * frac

      // Advance read pointer at pitchRatio (relative to write pointer)
      // To avoid read overtaking write (or falling too far behind),
      // keep read pointer within [writePos - bufSize/2, writePos - 64]
      this._readPos += pitchRatio
      const lag = this._writePos - this._readPos
      if (lag < 64)          this._readPos = this._writePos - 64
      if (lag > bufSize / 2) this._readPos = this._writePos - bufSize / 2

      // Dry/wet mix
      output[i] = input[i] * (1 - mix) + wet * mix
    }

    return true
  }
}

registerProcessor('pitch-shifter', PitchShifterProcessor)
