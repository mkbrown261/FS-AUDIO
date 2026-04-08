/**
 * LUFS / Loudness measurement — ITU-R BS.1770-4 compliant
 *
 * Implements:
 *  - K-weighting filter (pre-filter + RLB filter)
 *  - Mean-square measurement over 400ms blocks (75% overlap)
 *  - Absolute gating at -70 LUFS
 *  - Relative gating at -10 LU below ungated mean
 *  - Returns Integrated LUFS (IL), Short-Term LUFS (last 3s window), True Peak
 *
 * Reference: ITU-R BS.1770-4 (2015), EBU R128
 */

export interface LufsResult {
  integrated: number    // Integrated LUFS (full program loudness)
  shortTerm: number     // Short-term LUFS (last 3s)
  momentary: number     // Momentary LUFS (last 400ms)
  truePeak: number      // True peak dBTP (over-sampled peak)
  luRange: number       // Loudness range LRA (approximate)
}

// ── K-weighting filter coefficients (48 kHz) ─────────────────────────────────
// These are the exact BS.1770 coefficients for 48 kHz.
// For other sample rates we compute them on-the-fly.

function preFilterCoeffs(sr: number) {
  // Pre-filter: high-shelf boost ~+4 dB at 2 kHz (head acoustics)
  const f0 = 1681.974450955533
  const G  = 3.999843853973347
  const Q  = 0.7071752369554196
  const K  = Math.tan(Math.PI * f0 / sr)
  const Vh = Math.pow(10, G / 20)
  const Vb = Math.pow(Vh, 0.4996667741545416)
  const a0 = 1 + K / Q + K * K
  return {
    b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
    a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0],
  }
}

function rlbFilterCoeffs(sr: number) {
  // RLB: high-pass filter ~70 Hz
  const f0 = 38.13547087602444
  const Q  = 0.5003270373238773
  const K  = Math.tan(Math.PI * f0 / sr)
  const a0 = 1 + K / Q + K * K
  return {
    b: [1, -2, 1].map(v => v / a0),
    a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0],
  }
}

function applyBiquad(
  x: Float32Array,
  b: number[], a: number[],
): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]
    const yi = b[0] * xi + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    y[i] = yi
    x2 = x1; x1 = xi
    y2 = y1; y1 = yi
  }
  return y
}

function kWeight(ch: Float32Array, sr: number): Float32Array {
  const pf = preFilterCoeffs(sr)
  const rlb = rlbFilterCoeffs(sr)
  const staged = applyBiquad(ch, pf.b, pf.a)
  return applyBiquad(staged, rlb.b, rlb.a)
}

// ── Core loudness measurement ─────────────────────────────────────────────────

export function measureLufs(audioBuffer: AudioBuffer): LufsResult {
  const { sampleRate, numberOfChannels, length } = audioBuffer
  const blockSamples = Math.round(0.4 * sampleRate)   // 400ms
  const hopSamples   = Math.round(0.1 * sampleRate)   // 100ms (75% overlap)
  const shortSamples = Math.round(3.0 * sampleRate)   // 3s for short-term
  const momSamples   = blockSamples                    // 400ms for momentary

  // Channel weights: L=1, R=1, C=1, LFE=0, Ls=1.41, Rs=1.41 (BS.1770)
  // For stereo: both channels weight 1.0
  const chanWeights = Array.from({ length: numberOfChannels }, (_, i) =>
    i <= 1 ? 1.0 : i === 2 ? 1.0 : i === 3 ? 0.0 : 1.41
  )

  // Apply K-weighting to all channels
  const kWeighted: Float32Array[] = []
  for (let ch = 0; ch < numberOfChannels; ch++) {
    kWeighted.push(kWeight(audioBuffer.getChannelData(ch), sampleRate))
  }

  // Compute mean-square per block
  const numBlocks = Math.max(1, Math.floor((length - blockSamples) / hopSamples) + 1)
  const blockLoudness = new Float32Array(numBlocks)

  for (let b = 0; b < numBlocks; b++) {
    const start = b * hopSamples
    const end   = Math.min(start + blockSamples, length)
    let sum = 0
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const w = chanWeights[ch]
      const d = kWeighted[ch]
      let ms = 0
      for (let i = start; i < end; i++) ms += d[i] * d[i]
      sum += w * ms / (end - start)
    }
    blockLoudness[b] = sum
  }

  // ── Absolute gate: discard blocks below -70 LUFS ─────────────────────────
  const absThreshLinear = Math.pow(10, -70 / 10) // -70 LUFS in linear

  const gated1 = Array.from(blockLoudness).filter(v => v >= absThreshLinear)
  if (gated1.length === 0) {
    return { integrated: -Infinity, shortTerm: -Infinity, momentary: -Infinity, truePeak: -100, luRange: 0 }
  }

  // ── Relative gate: discard blocks more than -10 LU below ungated mean ────
  const ungatedMean = gated1.reduce((a, b) => a + b, 0) / gated1.length
  const relThresh   = ungatedMean * Math.pow(10, -10 / 10) // -10 LU below
  const gated2 = gated1.filter(v => v >= relThresh)

  const integratedLinear = gated2.length > 0
    ? gated2.reduce((a, b) => a + b, 0) / gated2.length
    : ungatedMean

  const integrated = -0.691 + 10 * Math.log10(integratedLinear)

  // ── Short-term LUFS (last 3s) ─────────────────────────────────────────────
  const shortStart = Math.max(0, length - shortSamples)
  let shortSum = 0
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const w = chanWeights[ch]
    const d = kWeighted[ch]
    let ms = 0
    const end = length
    for (let i = shortStart; i < end; i++) ms += d[i] * d[i]
    shortSum += w * ms / (end - shortStart)
  }
  const shortTerm = -0.691 + 10 * Math.log10(Math.max(1e-10, shortSum))

  // ── Momentary LUFS (last 400ms) ───────────────────────────────────────────
  const momStart = Math.max(0, length - momSamples)
  let momSum = 0
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const w = chanWeights[ch]
    const d = kWeighted[ch]
    let ms = 0
    const end = length
    for (let i = momStart; i < end; i++) ms += d[i] * d[i]
    momSum += w * ms / (end - momStart)
  }
  const momentary = -0.691 + 10 * Math.log10(Math.max(1e-10, momSum))

  // ── True Peak (4x oversample approximation) ──────────────────────────────
  // Simple 4x linear interpolation between adjacent samples
  let truePeakLin = 0
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const d = audioBuffer.getChannelData(ch)
    for (let i = 0; i < d.length - 1; i++) {
      const a = d[i], b2 = d[i + 1]
      // Check 4 interpolated points between samples
      for (let k = 0; k < 4; k++) {
        const t = k / 4
        const interp = Math.abs(a + (b2 - a) * t)
        if (interp > truePeakLin) truePeakLin = interp
      }
      if (Math.abs(a) > truePeakLin) truePeakLin = Math.abs(a)
    }
  }
  const truePeak = truePeakLin > 0 ? 20 * Math.log10(truePeakLin) : -Infinity

  // ── Loudness Range (LRA, approximate) ────────────────────────────────────
  // LRA = difference between 95th and 10th percentile of gated block loudness
  const sortedGated = [...gated2].sort((a, b) => a - b)
  let luRange = 0
  if (sortedGated.length >= 4) {
    const lo = sortedGated[Math.floor(sortedGated.length * 0.1)]
    const hi = sortedGated[Math.floor(sortedGated.length * 0.95)]
    luRange = Math.max(0, 10 * Math.log10(hi / lo))
  }

  return { integrated, shortTerm, momentary, truePeak, luRange }
}

/**
 * Compute gain in dB to normalize an AudioBuffer to a target LUFS.
 * @param buffer  - source AudioBuffer
 * @param targetLufs - e.g. -14 (Spotify), -16 (Apple Music), -13 (YouTube)
 * @returns gainDb to apply (positive = louder, negative = attenuate)
 */
export function computeLufsNormGain(buffer: AudioBuffer, targetLufs: number): number {
  const result = measureLufs(buffer)
  if (!isFinite(result.integrated)) return 0
  return targetLufs - result.integrated
}

/**
 * Apply gain to an AudioBuffer (returns a new AudioBuffer).
 */
export function applyGainToBuffer(
  buffer: AudioBuffer,
  gainDb: number,
  ctx: AudioContext | OfflineAudioContext,
): AudioBuffer {
  const gainLinear = Math.pow(10, gainDb / 20)
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const inData  = buffer.getChannelData(ch)
    const outData = out.getChannelData(ch)
    for (let i = 0; i < inData.length; i++) {
      outData[i] = inData[i] * gainLinear
    }
  }
  return out
}

/** LUFS target presets matching major streaming platforms */
export const LUFS_TARGETS = {
  spotify:       -14,
  appleMusic:    -16,
  youtube:       -14,
  tidal:         -14,
  soundcloud:    -14,
  amazon:        -14,
  deezer:        -15,
  netflix:       -27,
  ebu_r128:      -23,
  custom:         -14,
} as const
