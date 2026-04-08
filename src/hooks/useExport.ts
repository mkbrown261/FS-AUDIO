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

export interface ExportOptions {
  /** 'project' = 0 to end of last clip; 'loop' = loopStart to loopEnd */
  range: 'project' | 'loop'
  bitDepth: 16 | 24 | 32
  sampleRate: 44100 | 48000
  normalize: boolean
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
      const { tracks, bpm, loopStart, loopEnd, sampleRate: projectSR, bitDepth: projectBD } = st

      const sr   = opts.sampleRate ?? projectSR
      const bits = opts.bitDepth   ?? projectBD

      // Determine render range in seconds
      let startSec = 0
      let endSec   = 0

      if (opts.range === 'loop') {
        startSec = loopStart * (60 / bpm)
        endSec   = loopEnd   * (60 / bpm)
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
        endSec   = maxBeat * (60 / bpm)
      }

      const durationSec = endSec - startSec
      if (durationSec <= 0) {
        setProgress({ phase: 'error', progress: 0, error: 'Export range is empty.' })
        return
      }

      const startBeat = startSec * (bpm / 60)
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
        lowShelf.gain.value = eqPlugin?.params.low ?? 0

        const midPeak = offCtx.createBiquadFilter()
        midPeak.type = 'peaking'; midPeak.frequency.value = 1000; midPeak.Q.value = 0.5
        midPeak.gain.value = eqPlugin?.params.mid ?? 0

        const highShelf = offCtx.createBiquadFilter()
        highShelf.type = 'highshelf'; highShelf.frequency.value = 3200
        highShelf.gain.value = eqPlugin?.params.high ?? 0

        // Compressor
        const compPlugin = track.plugins.find(p => p.type === 'compressor' && p.enabled)
        const comp = offCtx.createDynamicsCompressor()
        comp.threshold.value = compPlugin?.params.threshold ?? -24
        comp.knee.value      = 30
        comp.ratio.value     = compPlugin?.params.ratio   ?? 4
        comp.attack.value    = compPlugin?.params.attack  ?? 0.003
        comp.release.value   = compPlugin?.params.release ?? 0.25

        // Chain: trackGain → lowShelf → midPeak → highShelf → comp → panner → masterGain
        trackGain.connect(lowShelf)
        lowShelf.connect(midPeak)
        midPeak.connect(highShelf)
        highShelf.connect(comp)
        comp.connect(panner)
        panner.connect(masterGain)

        // Schedule clips
        for (const clip of track.clips) {
          if (!clip.audioUrl || clip.muted) continue
          const clipEndBeat = clip.startBeat + clip.durationBeats
          if (clipEndBeat <= startBeat) continue
          if (clip.startBeat >= startBeat + durationSec * (bpm / 60)) continue

          const buf = audioBuffersRef.current.get(clip.audioUrl)
          if (!buf) continue

          const beatDur    = 60 / bpm
          const clipStartS = clip.startBeat * beatDur
          const clipDurS   = clip.durationBeats * beatDur
          const offset     = Math.max(0, startSec - clipStartS)
          const playDur    = clipDurS - offset
          if (playDur <= 0) continue

          const source = offCtx.createBufferSource()
          source.buffer = buf
          if (clip.looped) source.loop = true

          const clipGain = offCtx.createGain()
          clipGain.gain.value = clip.gain
          source.connect(clipGain)
          clipGain.connect(trackGain)

          const when = Math.max(0, clipStartS - startSec)

          // Fade ramps
          const fadeInSec  = (clip.fadeIn  ?? 0) * beatDur
          const fadeOutSec = (clip.fadeOut ?? 0) * beatDur
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

      // Normalize if requested
      if (opts.normalize) {
        let peak = 0
        for (let i = 0; i < leftData.length; i++) {
          if (Math.abs(leftData[i])  > peak) peak = Math.abs(leftData[i])
          if (Math.abs(rightData[i]) > peak) peak = Math.abs(rightData[i])
        }
        if (peak > 0 && peak < 0.999) {
          const scale = 0.98 / peak
          const normL = new Float32Array(leftData.length)
          const normR = new Float32Array(rightData.length)
          for (let i = 0; i < leftData.length; i++) {
            normL[i] = leftData[i]  * scale
            normR[i] = rightData[i] * scale
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
    const { tracks, bpm, loopStart, loopEnd } = st
    const sr   = opts.sampleRate ?? st.sampleRate
    const bits = opts.bitDepth   ?? st.bitDepth

    // Determine which tracks to export
    const exportTracks = tracks.filter(t =>
      t.type !== 'master' &&
      t.clips.some(c => c.audioUrl) &&
      (!opts.stemTrackIds || opts.stemTrackIds.includes(t.id))
    )

    if (exportTracks.length === 0) {
      setProgress({ phase: 'error', progress: 0, error: 'No audio tracks to export as stems.' })
      return
    }

    setProgress({ phase: 'rendering', progress: 0 })

    // Determine render range
    let startSec = 0, endSec = 0
    if (opts.range === 'loop') {
      startSec = loopStart * (60 / bpm)
      endSec   = loopEnd   * (60 / bpm)
    } else {
      let maxBeat = 0
      for (const t of tracks) for (const c of t.clips) { const e = c.startBeat + c.durationBeats; if (e > maxBeat) maxBeat = e }
      if (maxBeat <= 0) { setProgress({ phase: 'error', progress: 0, error: 'No clips to export.' }); return }
      endSec = maxBeat * (60 / bpm)
    }
    const durationSec = endSec - startSec
    const startBeat   = startSec * (bpm / 60)
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
      lowShelf.gain.value = eqPlugin?.params.low ?? 0
      const midPeak = offCtx.createBiquadFilter()
      midPeak.type = 'peaking'; midPeak.frequency.value = 1000; midPeak.Q.value = 0.5
      midPeak.gain.value = eqPlugin?.params.mid ?? 0
      const highShelf = offCtx.createBiquadFilter()
      highShelf.type = 'highshelf'; highShelf.frequency.value = 3200
      highShelf.gain.value = eqPlugin?.params.high ?? 0

      trackGain.connect(lowShelf)
      lowShelf.connect(midPeak)
      midPeak.connect(highShelf)
      highShelf.connect(panner)
      panner.connect(offCtx.destination)

      for (const clip of track.clips) {
        if (!clip.audioUrl || clip.muted) continue
        const clipEndBeat = clip.startBeat + clip.durationBeats
        if (clipEndBeat <= startBeat) continue

        const buf = audioBuffersRef.current.get(clip.audioUrl)
        if (!buf) continue

        const beatDur = 60 / bpm
        const clipStartS = clip.startBeat * beatDur
        const clipDurS   = clip.durationBeats * beatDur
        const offset     = Math.max(0, startSec - clipStartS)
        const playDur    = clipDurS - offset
        if (playDur <= 0) continue

        const source = offCtx.createBufferSource()
        source.buffer = buf
        source.playbackRate.value = clip.flexRate ?? 1
        if (clip.looped) source.loop = true

        const clipGain = offCtx.createGain()
        clipGain.gain.value = clip.gain
        source.connect(clipGain)
        clipGain.connect(trackGain)

        const when = Math.max(0, clipStartS - startSec)
        const fadeInSec  = (clip.fadeIn  ?? 0) * beatDur
        const fadeOutSec = (clip.fadeOut ?? 0) * beatDur
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

      if (opts.normalize) {
        let peak = 0
        for (let i = 0; i < leftData.length; i++) {
          if (Math.abs(leftData[i])  > peak) peak = Math.abs(leftData[i])
          if (Math.abs(rightData[i]) > peak) peak = Math.abs(rightData[i])
        }
        if (peak > 0 && peak < 0.999) {
          const scale = 0.98 / peak
          const normL = new Float32Array(leftData.length)
          const normR = new Float32Array(rightData.length)
          for (let i = 0; i < leftData.length; i++) {
            normL[i] = leftData[i] * scale
            normR[i] = rightData[i] * scale
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
