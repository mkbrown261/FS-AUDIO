/**
 * useExport — offline bounce to WAV
 *
 * Uses OfflineAudioContext to render the entire project (or loop region) to a
 * Float32 buffer, then encodes it as a standard PCM WAV file and triggers a
 * browser download.  No external libraries required.
 *
 * Supports:
 *   - 16-bit, 24-bit, 32-bit float WAV output
 *   - Solo/mute logic (same rules as live playback)
 *   - Clip gain, fade-in/out ramps
 *   - Per-track EQ (three-band), compressor, pan
 *   - Master gain + brick-wall limiter
 *   - Bounce entire project OR loop region only
 */

import { useCallback, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { encodeAudioBufferToMp3 } from '../utils/mp3Encoder'
import { measureLufs, computeLufsNormGain, LUFS_TARGETS } from '../utils/lufs'

/** Safely coerce plugin param (string | number) → number */
const pn = (v: string | number | undefined, fallback = 0): number =>
  typeof v === 'number' ? v : parseFloat(v as string) || fallback

export interface ExportOptions {
  /** 'project' = 0 to end of last clip; 'loop' = loopStart to loopEnd */
  range: 'project' | 'loop'
  bitDepth: 16 | 24 | 32
  sampleRate: 44100 | 48000
  normalize: boolean
  /** LUFS target — if set overrides peak normalize */
  lufsTarget?: number | null
  filename?: string
  /** 'wav' (default) or 'mp3' */
  format?: 'wav' | 'mp3'
  /** MP3 bitrate — only used when format = 'mp3' */
  mp3BitRate?: 128 | 192 | 256 | 320
  /** 'mix' = full stereo mixdown (default); 'stems' = one WAV per track */
  mode?: 'mix' | 'stems'
  /** Which track IDs to export when mode = 'stems'; undefined = all */
  stemTrackIds?: string[]
}

// Re-export LUFS utilities for use by UI components
export { measureLufs, computeLufsNormGain, LUFS_TARGETS }

export interface ExportProgress {
  phase: 'idle' | 'rendering' | 'encoding' | 'done' | 'error'
  progress: number   // 0-1
  error?: string
}

// ── WAV encoder ───────────────────────────────────────────────────────────────
function encodeWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  bitDepth: 16 | 24 | 32,
): Blob {
  const numSamples = left.length
  const numChannels = 2
  const bytesPerSample = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * numChannels * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  // PCM = 1, IEEE float = 3
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  // Interleaved samples
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    for (const ch of [left[i], right[i]]) {
      if (bitDepth === 32) {
        view.setFloat32(offset, ch, true)
        offset += 4
      } else if (bitDepth === 24) {
        const s = Math.max(-1, Math.min(1, ch))
        const val = s < 0 ? (s * 0x800000) | 0 : (s * 0x7fffff) | 0
        view.setUint8(offset,     val & 0xff)
        view.setUint8(offset + 1, (val >> 8)  & 0xff)
        view.setUint8(offset + 2, (val >> 16) & 0xff)
        offset += 3
      } else {
        // 16-bit
        const s = Math.max(-1, Math.min(1, ch))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
        offset += 2
      }
    }
  }

  const mimeType = bitDepth === 32 ? 'audio/wav' : 'audio/wav'
  return new Blob([buffer], { type: mimeType })
}

// ── Tempo-map helpers (mirrors the ones in useAudioEngine/useTransport) ───────

/** Cumulative seconds at the start of each tempo segment */
function buildTempoTable(globalBpm: number, tempoMap: { beat: number; bpm: number }[]) {
  const sorted = [...tempoMap].sort((a, b) => a.beat - b.beat)
  // table[i] = { beat, bpm, startSec } — cumulative seconds reaching that beat
  const table: { beat: number; bpm: number; startSec: number }[] = [
    { beat: 0, bpm: globalBpm, startSec: 0 }
  ]
  for (const pt of sorted) {
    const prev = table[table.length - 1]
    const dt = (pt.beat - prev.beat) * (60 / prev.bpm)
    table.push({ beat: pt.beat, bpm: pt.bpm, startSec: prev.startSec + dt })
  }
  return table
}

/** Convert a beat position to absolute seconds using the tempo map */
function beatToSec(beat: number, globalBpm: number, tempoMap: { beat: number; bpm: number }[]) {
  if (!tempoMap.length) return beat * (60 / globalBpm)
  const table = buildTempoTable(globalBpm, tempoMap)
  let prev = table[0]
  for (let i = 1; i < table.length; i++) {
    if (beat < table[i].beat) {
      return prev.startSec + (beat - prev.beat) * (60 / prev.bpm)
    }
    prev = table[i]
  }
  return prev.startSec + (beat - prev.beat) * (60 / prev.bpm)
}

/** Schedule all MIDI notes from a clip into an OfflineAudioContext using piano oscillators */
function scheduleMidiClipOffline(
  offCtx: OfflineAudioContext,
  clip: { startBeat: number; durationBeats: number; midiNotes?: { pitch: number; velocity: number; startBeat: number; durationBeats: number }[] },
  trackDest: AudioNode,
  startSec: number,
  globalBpm: number,
  tempoMap: { beat: number; bpm: number }[]
) {
  const notes = clip.midiNotes ?? []
  for (const note of notes) {
    const noteAbsBeat  = clip.startBeat + note.startBeat
    const noteEndBeat  = noteAbsBeat + note.durationBeats
    const noteStartSec = beatToSec(noteAbsBeat, globalBpm, tempoMap)
    const noteEndSec   = beatToSec(noteEndBeat,  globalBpm, tempoMap)
    const when         = Math.max(0, noteStartSec - startSec)
    const dur          = Math.max(0.01, noteEndSec - noteStartSec)
    if (noteStartSec < startSec && noteEndSec <= startSec) continue // fully before range

    const freq    = 440 * Math.pow(2, (note.pitch - 69) / 12)
    const velNorm = note.velocity / 127

    const noteGain = offCtx.createGain()
    noteGain.connect(trackDest)

    const partials: [number, number][] = [
      [1.0, 0.60],
      [2.0, 0.20],
      [3.0, 0.10],
      [4.0, 0.06],
      [5.0, 0.04],
    ]

    for (const [mult, level] of partials) {
      const osc   = offCtx.createOscillator()
      const pGain = offCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq * mult
      if (mult > 1) osc.detune.value = (mult - 1) * 1.2
      pGain.gain.value = level * velNorm * 0.5
      osc.connect(pGain)
      pGain.connect(noteGain)
      osc.start(when)
      osc.stop(when + dur + 0.3)
    }

    const attackTime = 0.004
    const decayTime  = Math.min(dur * 0.7, 3.0)
    noteGain.gain.setValueAtTime(0, when)
    noteGain.gain.linearRampToValueAtTime(velNorm * 0.8, when + attackTime)
    noteGain.gain.exponentialRampToValueAtTime(velNorm * 0.3 + 0.001, when + attackTime + decayTime)
    noteGain.gain.setValueAtTime(velNorm * 0.3 + 0.001, when + dur - 0.015)
    noteGain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.2)
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useExport(audioBuffersRef: React.MutableRefObject<Map<string, AudioBuffer>>) {
  const [progress, setProgress] = useState<ExportProgress>({ phase: 'idle', progress: 0 })
  const abortRef = useRef(false)

  const bounce = useCallback(async (opts: ExportOptions) => {
    abortRef.current = false

    // Handle stem export separately
    if (opts.mode === 'stems') {
      await bounceStemsInternal(opts)
      return
    }

    setProgress({ phase: 'rendering', progress: 0 })

    try {
      const st = useProjectStore.getState()
      const { tracks, bpm, loopStart, loopEnd, sampleRate: projectSR, bitDepth: projectBD, tempoMap } = st

      const sr   = opts.sampleRate ?? projectSR
      const bits = opts.bitDepth   ?? projectBD
      const tmap = tempoMap ?? []

      // Determine render range in seconds (tempo-map-aware)
      let startSec = 0
      let endSec   = 0

      if (opts.range === 'loop') {
        startSec = beatToSec(loopStart, bpm, tmap)
        endSec   = beatToSec(loopEnd,   bpm, tmap)
      } else {
        // Find last clip end
        let maxBeat = 0
        for (const t of tracks) {
          for (const c of t.clips) {
            const e = c.startBeat + c.durationBeats
            if (e > maxBeat) maxBeat = e
          }
        }
        if (maxBeat <= 0) {
          setProgress({ phase: 'error', progress: 0, error: 'No clips to export.' })
          return
        }
        startSec = 0
        endSec   = beatToSec(maxBeat, bpm, tmap)
      }

      const durationSec = endSec - startSec
      if (durationSec <= 0) {
        setProgress({ phase: 'error', progress: 0, error: 'Export range is empty.' })
        return
      }

      const startBeat  = startSec > 0 ? /* approx */ startSec * (bpm / 60) : 0
      const numSamples = Math.ceil(durationSec * sr)

      // OfflineAudioContext renders at real-time speed without blocking
      const offCtx = new OfflineAudioContext(2, numSamples, sr)

      // Master gain + limiter
      const masterGain = offCtx.createGain()
      masterGain.gain.value = 0.9

      const masterLimiter = offCtx.createDynamicsCompressor()
      masterLimiter.threshold.value = -1
      masterLimiter.knee.value      = 0
      masterLimiter.ratio.value     = 20
      masterLimiter.attack.value    = 0.001
      masterLimiter.release.value   = 0.1

      masterGain.connect(masterLimiter)
      masterLimiter.connect(offCtx.destination)

      // Solo logic
      const anySolo = tracks.some(t => t.solo && t.type !== 'master')

      // Build per-track chains
      for (const track of tracks) {
        if (track.type === 'master') continue
        const effectiveVol = track.muted ? 0
          : (anySolo && !track.solo) ? 0
          : track.volume
        if (effectiveVol === 0) continue

        const trackGain = offCtx.createGain()
        trackGain.gain.value = effectiveVol

        const panner = offCtx.createStereoPanner()
        panner.pan.value = track.pan

        // 3-band EQ (use plugin params if present, else flat)
        const eqPlugin = track.plugins.find(p => p.type === 'eq' && p.enabled)
        const lowShelf = offCtx.createBiquadFilter()
        lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 320
        lowShelf.gain.value = pn(eqPlugin?.params.low, 0)

        const midPeak = offCtx.createBiquadFilter()
        midPeak.type = 'peaking'; midPeak.frequency.value = 1000; midPeak.Q.value = 0.5
        midPeak.gain.value = pn(eqPlugin?.params.mid, 0)

        const highShelf = offCtx.createBiquadFilter()
        highShelf.type = 'highshelf'; highShelf.frequency.value = 3200
        highShelf.gain.value = pn(eqPlugin?.params.high, 0)

        // Compressor
        const compPlugin = track.plugins.find(p => p.type === 'compressor' && p.enabled)
        const comp = offCtx.createDynamicsCompressor()
        comp.threshold.value = pn(compPlugin?.params.threshold, -24)
        comp.knee.value      = 30
        comp.ratio.value     = pn(compPlugin?.params.ratio, 4)
        comp.attack.value    = pn(compPlugin?.params.attack, 0.003)
        comp.release.value   = pn(compPlugin?.params.release, 0.25)

        // Chain: trackGain → lowShelf → midPeak → highShelf → comp → panner → masterGain
        trackGain.connect(lowShelf)
        lowShelf.connect(midPeak)
        midPeak.connect(highShelf)
        highShelf.connect(comp)
        comp.connect(panner)
        panner.connect(masterGain)

        // Schedule clips (audio + MIDI)
        for (const clip of track.clips) {
          if (clip.muted) continue
          const clipEndBeat  = clip.startBeat + clip.durationBeats
          const clipStartSec = beatToSec(clip.startBeat, bpm, tmap)
          const clipEndSec   = beatToSec(clipEndBeat,    bpm, tmap)
          if (clipEndSec <= startSec) continue
          if (clipStartSec >= endSec) continue

          // ── MIDI clip → piano oscillators ─────────────────────────────────
          if (clip.type === 'midi' && clip.midiNotes && clip.midiNotes.length > 0) {
            scheduleMidiClipOffline(offCtx, clip, trackGain, startSec, bpm, tmap)
            continue
          }

          // ── Audio clip ────────────────────────────────────────────────────
          if (!clip.audioUrl) continue
          const buf = audioBuffersRef.current.get(clip.audioUrl)
          if (!buf) continue

          const clipDurS = clipEndSec - clipStartSec
          const offset   = Math.max(0, startSec - clipStartSec)
          const playDur  = clipDurS - offset
          if (playDur <= 0) continue

          const source = offCtx.createBufferSource()
          source.buffer = buf
          if (clip.looped) source.loop = true

          const clipGain = offCtx.createGain()
          clipGain.gain.value = clip.gain
          source.connect(clipGain)
          clipGain.connect(trackGain)

          const when       = Math.max(0, clipStartSec - startSec)
          // Fade beat durations → seconds using local tempo
          const localSpb   = (beatToSec(clip.startBeat + 1, bpm, tmap) - clipStartSec)
          const fadeInSec  = (clip.fadeIn  ?? 0) * localSpb
          const fadeOutSec = (clip.fadeOut ?? 0) * localSpb
          if (fadeInSec > 0) {
            clipGain.gain.setValueAtTime(0.0001, when)
            clipGain.gain.exponentialRampToValueAtTime(clip.gain, when + fadeInSec)
          } else {
            clipGain.gain.setValueAtTime(clip.gain, when)
          }
          if (fadeOutSec > 0) {
            const fadeStart = when + playDur - fadeOutSec
            if (fadeStart > when) {
              clipGain.gain.setValueAtTime(clip.gain, fadeStart)
              clipGain.gain.exponentialRampToValueAtTime(0.0001, when + playDur)
            }
          }

          source.start(when, offset, clip.looped ? undefined : playDur)
        }
      }

      // Render
      setProgress({ phase: 'rendering', progress: 0.1 })
      const rendered = await offCtx.startRendering()
      if (abortRef.current) { setProgress({ phase: 'idle', progress: 0 }); return }

      setProgress({ phase: 'encoding', progress: 0.8 })

      let leftData  = rendered.getChannelData(0)
      let rightData = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : leftData

      // Normalize — LUFS target takes priority over peak normalize
      if (opts.normalize || (opts.lufsTarget != null)) {
        let scale = 1
        if (opts.lufsTarget != null) {
          // LUFS-based normalization using ITU-R BS.1770-4
          const tempCtxForLufs = new OfflineAudioContext(2, Math.max(rendered.length, 1), sr)
          const tempBuf = tempCtxForLufs.createBuffer(rendered.numberOfChannels, rendered.length, sr)
          for (let ch = 0; ch < rendered.numberOfChannels; ch++) tempBuf.copyToChannel(rendered.getChannelData(ch), ch)
          const gainDb = computeLufsNormGain(tempBuf, opts.lufsTarget)
          // Clamp: never gain by more than +20 dB (very quiet material) to avoid distortion
          const clampedDb = Math.min(20, gainDb)
          scale = Math.pow(10, clampedDb / 20)
        } else {
          // Peak normalize to -0.2 dBFS
          let peak = 0
          for (let i = 0; i < leftData.length; i++) {
            if (Math.abs(leftData[i])  > peak) peak = Math.abs(leftData[i])
            if (Math.abs(rightData[i]) > peak) peak = Math.abs(rightData[i])
          }
          if (peak > 0 && peak < 0.999) scale = 0.98 / peak
        }
        if (scale !== 1 && scale > 0) {
          const normL = new Float32Array(leftData.length)
          const normR = new Float32Array(rightData.length)
          for (let i = 0; i < leftData.length; i++) {
            normL[i] = Math.max(-1, Math.min(1, leftData[i]  * scale))
            normR[i] = Math.max(-1, Math.min(1, rightData[i] * scale))
          }
          leftData  = normL
          rightData = normR
        }
      }

      const fmt = opts.format ?? 'wav'
      const projectName = useProjectStore.getState().name.replace(/[^a-z0-9_\- ]/gi, '_')

      let exportBlob: Blob
      let filename: string

      if (fmt === 'mp3') {
        setProgress({ phase: 'encoding', progress: 0.9 })
        const tempCtx = new OfflineAudioContext(2, leftData.length, sr)
        const tempBuf = tempCtx.createBuffer(2, leftData.length, sr)
        tempBuf.copyToChannel(leftData, 0)
        tempBuf.copyToChannel(rightData, 1)
        exportBlob = encodeAudioBufferToMp3(tempBuf, { bitRate: opts.mp3BitRate ?? 192, sampleRate: sr })
        filename = opts.filename ?? `${projectName}_bounce_${opts.mp3BitRate ?? 192}kbps.mp3`
      } else {
        exportBlob = encodeWav(leftData, rightData, sr, bits as 16 | 24 | 32)
        filename = opts.filename ?? `${projectName}_bounce_${bits}bit.wav`
      }

      // Trigger download
      const url = URL.createObjectURL(exportBlob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)

      setProgress({ phase: 'done', progress: 1 })
      setTimeout(() => setProgress({ phase: 'idle', progress: 0 }), 3000)

    } catch (err: any) {
      console.error('Export failed:', err)
      setProgress({ phase: 'error', progress: 0, error: err?.message ?? 'Export failed.' })
    }
  }, [audioBuffersRef])

  // ── Stem export ─────────────────────────────────────────────────────────────
  const bounceStemsInternal = useCallback(async (opts: ExportOptions) => {
    abortRef.current = false
    const st = useProjectStore.getState()
    const { tracks, bpm, loopStart, loopEnd, tempoMap } = st
    const sr   = opts.sampleRate ?? st.sampleRate
    const bits = opts.bitDepth   ?? st.bitDepth
    const tmap = tempoMap ?? []

    // Determine which tracks to export (audio or MIDI)
    const exportTracks = tracks.filter(t =>
      t.type !== 'master' &&
      t.clips.some(c => c.audioUrl || (c.type === 'midi' && c.midiNotes && c.midiNotes.length > 0)) &&
      (!opts.stemTrackIds || opts.stemTrackIds.includes(t.id))
    )

    if (exportTracks.length === 0) {
      setProgress({ phase: 'error', progress: 0, error: 'No tracks with clips to export as stems.' })
      return
    }

    setProgress({ phase: 'rendering', progress: 0 })

    // Determine render range (tempo-map-aware)
    let startSec = 0, endSec = 0
    if (opts.range === 'loop') {
      startSec = beatToSec(loopStart, bpm, tmap)
      endSec   = beatToSec(loopEnd,   bpm, tmap)
    } else {
      let maxBeat = 0
      for (const t of tracks) for (const c of t.clips) { const e = c.startBeat + c.durationBeats; if (e > maxBeat) maxBeat = e }
      if (maxBeat <= 0) { setProgress({ phase: 'error', progress: 0, error: 'No clips to export.' }); return }
      endSec = beatToSec(maxBeat, bpm, tmap)
    }
    const durationSec = endSec - startSec
    const numSamples  = Math.ceil(durationSec * sr)

    for (let ti = 0; ti < exportTracks.length; ti++) {
      if (abortRef.current) break
      const track = exportTracks[ti]
      setProgress({ phase: 'rendering', progress: ti / exportTracks.length })

      const offCtx = new OfflineAudioContext(2, numSamples, sr)
      const trackGain = offCtx.createGain()
      trackGain.gain.value = track.volume
      const panner = offCtx.createStereoPanner()
      panner.pan.value = track.pan

      const eqPlugin = track.plugins.find(p => p.type === 'eq' && p.enabled)
      const lowShelf = offCtx.createBiquadFilter()
      lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 320
      lowShelf.gain.value = pn(eqPlugin?.params.low, 0)
      const midPeak = offCtx.createBiquadFilter()
      midPeak.type = 'peaking'; midPeak.frequency.value = 1000; midPeak.Q.value = 0.5
      midPeak.gain.value = pn(eqPlugin?.params.mid, 0)
      const highShelf = offCtx.createBiquadFilter()
      highShelf.type = 'highshelf'; highShelf.frequency.value = 3200
      highShelf.gain.value = pn(eqPlugin?.params.high, 0)

      trackGain.connect(lowShelf)
      lowShelf.connect(midPeak)
      midPeak.connect(highShelf)
      highShelf.connect(panner)
      panner.connect(offCtx.destination)

      for (const clip of track.clips) {
        if (clip.muted) continue
        const clipStartSec = beatToSec(clip.startBeat,                           bpm, tmap)
        const clipEndSec   = beatToSec(clip.startBeat + clip.durationBeats,       bpm, tmap)
        if (clipEndSec <= startSec || clipStartSec >= endSec) continue

        // ── MIDI clip → piano oscillators ────────────────────────────────
        if (clip.type === 'midi' && clip.midiNotes && clip.midiNotes.length > 0) {
          scheduleMidiClipOffline(offCtx, clip, trackGain, startSec, bpm, tmap)
          continue
        }

        // ── Audio clip ───────────────────────────────────────────────────
        if (!clip.audioUrl) continue
        const buf = audioBuffersRef.current.get(clip.audioUrl)
        if (!buf) continue

        const clipDurS = clipEndSec - clipStartSec
        const offset   = Math.max(0, startSec - clipStartSec)
        const playDur  = clipDurS - offset
        if (playDur <= 0) continue

        const source = offCtx.createBufferSource()
        source.buffer = buf
        source.playbackRate.value = clip.flexRate ?? 1
        if (clip.looped) source.loop = true

        const clipGain = offCtx.createGain()
        clipGain.gain.value = clip.gain
        source.connect(clipGain)
        clipGain.connect(trackGain)

        const when       = Math.max(0, clipStartSec - startSec)
        const localSpb   = beatToSec(clip.startBeat + 1, bpm, tmap) - clipStartSec
        const fadeInSec  = (clip.fadeIn  ?? 0) * localSpb
        const fadeOutSec = (clip.fadeOut ?? 0) * localSpb
        if (fadeInSec > 0) {
          clipGain.gain.setValueAtTime(0.0001, when)
          clipGain.gain.exponentialRampToValueAtTime(clip.gain, when + fadeInSec)
        } else {
          clipGain.gain.setValueAtTime(clip.gain, when)
        }
        if (fadeOutSec > 0) {
          const fs = when + playDur - fadeOutSec
          if (fs > when) {
            clipGain.gain.setValueAtTime(clip.gain, fs)
            clipGain.gain.exponentialRampToValueAtTime(0.0001, when + playDur)
          }
        }
        source.start(when, offset * (clip.flexRate ?? 1), clip.looped ? undefined : playDur * (clip.flexRate ?? 1))
      }

      const rendered = await offCtx.startRendering()
      if (abortRef.current) break

      setProgress({ phase: 'encoding', progress: (ti + 0.8) / exportTracks.length })

      let leftData  = rendered.getChannelData(0)
      let rightData = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : leftData

      if (opts.normalize || (opts.lufsTarget != null)) {
        let scale = 1
        if (opts.lufsTarget != null) {
          const tempCtxForLufs = new OfflineAudioContext(2, Math.max(rendered.length, 1), sr)
          const tempBuf = tempCtxForLufs.createBuffer(rendered.numberOfChannels, rendered.length, sr)
          for (let ch = 0; ch < rendered.numberOfChannels; ch++) tempBuf.copyToChannel(rendered.getChannelData(ch), ch)
          const gainDb = computeLufsNormGain(tempBuf, opts.lufsTarget)
          scale = Math.pow(10, Math.min(20, gainDb) / 20)
        } else {
          let peak = 0
          for (let i = 0; i < leftData.length; i++) {
            if (Math.abs(leftData[i])  > peak) peak = Math.abs(leftData[i])
            if (Math.abs(rightData[i]) > peak) peak = Math.abs(rightData[i])
          }
          if (peak > 0 && peak < 0.999) scale = 0.98 / peak
        }
        if (scale !== 1 && scale > 0) {
          const normL = new Float32Array(leftData.length)
          const normR = new Float32Array(rightData.length)
          for (let i = 0; i < leftData.length; i++) {
            normL[i] = Math.max(-1, Math.min(1, leftData[i] * scale))
            normR[i] = Math.max(-1, Math.min(1, rightData[i] * scale))
          }
          leftData = normL; rightData = normR
        }
      }

      const wavBlob = encodeWav(leftData, rightData, sr, bits as 16 | 24 | 32)
      const safeName = track.name.replace(/[^a-z0-9_\- ]/gi, '_')
      const projectName = useProjectStore.getState().name.replace(/[^a-z0-9_\- ]/gi, '_')
      const filename = `${projectName}_STEM_${String(ti + 1).padStart(2, '0')}_${safeName}_${bits}bit.wav`
      const url = URL.createObjectURL(wavBlob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      // Stagger downloads so browser doesn't block them
      await new Promise(r => setTimeout(r, 600))
      URL.revokeObjectURL(url)
    }

    if (!abortRef.current) {
      setProgress({ phase: 'done', progress: 1 })
      setTimeout(() => setProgress({ phase: 'idle', progress: 0 }), 4000)
    } else {
      setProgress({ phase: 'idle', progress: 0 })
    }
  }, [audioBuffersRef])

  const cancel = useCallback(() => {
    abortRef.current = true
    setProgress({ phase: 'idle', progress: 0 })
  }, [])

  return { bounce, cancel, progress }
}
