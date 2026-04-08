import { useRef, useCallback, useEffect } from 'react'
import { useProjectStore, Clip } from '../store/projectStore'

interface TrackNodes {
  gain: GainNode
  panner: StereoPannerNode
  analyser: AnalyserNode
  eq: BiquadFilterNode[]
  compressor: DynamicsCompressorNode
  reverb?: ConvolverNode
  reverbGain?: GainNode
  delay?: DelayNode
  delayFeedback?: GainNode
  delayWet?: GainNode
}

interface ScheduledSource {
  source: AudioBufferSourceNode
  clipId: string
}

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const masterAnalyserRef = useRef<AnalyserNode | null>(null)
  const masterLimiterRef = useRef<DynamicsCompressorNode | null>(null)
  const trackNodesRef = useRef<Map<string, TrackNodes>>(new Map())
  const scheduledSourcesRef = useRef<ScheduledSource[]>([])
  const metronomeIntervalRef = useRef<number | null>(null)
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map())

  // Recording state
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<BlobPart[]>([])
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' })
      masterGainRef.current = ctxRef.current.createGain()
      masterGainRef.current.gain.value = 0.9
      masterAnalyserRef.current = ctxRef.current.createAnalyser()
      masterAnalyserRef.current.fftSize = 2048

      // Master limiter (brick wall at 0 dBFS)
      masterLimiterRef.current = ctxRef.current.createDynamicsCompressor()
      masterLimiterRef.current.threshold.value = -1
      masterLimiterRef.current.knee.value = 0
      masterLimiterRef.current.ratio.value = 20
      masterLimiterRef.current.attack.value = 0.001
      masterLimiterRef.current.release.value = 0.1

      masterGainRef.current.connect(masterLimiterRef.current)
      masterLimiterRef.current.connect(masterAnalyserRef.current)
      masterAnalyserRef.current.connect(ctxRef.current.destination)
    }
    return ctxRef.current
  }, [])

  const getTrackNodes = useCallback((trackId: string, volume: number, pan: number): TrackNodes => {
    const existing = trackNodesRef.current.get(trackId)
    if (existing) return existing

    const ctx = getCtx()
    const gain = ctx.createGain()
    gain.gain.value = volume

    const panner = ctx.createStereoPanner()
    panner.pan.value = pan

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -24
    compressor.knee.value = 30
    compressor.ratio.value = 4
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    const lowShelf = ctx.createBiquadFilter()
    lowShelf.type = 'lowshelf'
    lowShelf.frequency.value = 320
    lowShelf.gain.value = 0

    const midPeak = ctx.createBiquadFilter()
    midPeak.type = 'peaking'
    midPeak.frequency.value = 1000
    midPeak.Q.value = 0.5
    midPeak.gain.value = 0

    const highShelf = ctx.createBiquadFilter()
    highShelf.type = 'highshelf'
    highShelf.frequency.value = 3200
    highShelf.gain.value = 0

    // ── Reverb (convolver + impulse) ──────────────────────────────────────
    const reverb = ctx.createConvolver()
    const reverbGain = ctx.createGain()
    reverbGain.gain.value = 0 // dry by default
    // Generate a simple synthetic reverb impulse
    const irLength = ctx.sampleRate * 2.5
    const irBuffer = ctx.createBuffer(2, irLength, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = irBuffer.getChannelData(ch)
      for (let i = 0; i < irLength; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 2.5)
      }
    }
    reverb.buffer = irBuffer

    // ── Delay ────────────────────────────────────────────────────────────
    const delay = ctx.createDelay(5.0)
    delay.delayTime.value = 0.25
    const delayFeedback = ctx.createGain()
    delayFeedback.gain.value = 0.3
    const delayWet = ctx.createGain()
    delayWet.gain.value = 0 // dry by default

    // Chain: gain → lowShelf → midPeak → highShelf → compressor → panner → analyser
    gain.connect(lowShelf)
    lowShelf.connect(midPeak)
    midPeak.connect(highShelf)
    highShelf.connect(compressor)
    compressor.connect(panner)

    // Reverb branch
    compressor.connect(reverb)
    reverb.connect(reverbGain)
    reverbGain.connect(analyser)

    // Delay branch
    compressor.connect(delay)
    delay.connect(delayFeedback)
    delayFeedback.connect(delay)
    delay.connect(delayWet)
    delayWet.connect(analyser)

    panner.connect(analyser)
    analyser.connect(masterGainRef.current!)

    const nodes: TrackNodes = {
      gain, panner, analyser, eq: [lowShelf, midPeak, highShelf], compressor,
      reverb, reverbGain, delay, delayFeedback, delayWet,
    }
    trackNodesRef.current.set(trackId, nodes)
    return nodes
  }, [getCtx])

  // Register a pre-decoded AudioBuffer under a synthetic key (e.g. blob: URL or recording id)
  const registerAudioBuffer = useCallback((key: string, buffer: AudioBuffer) => {
    audioBuffersRef.current.set(key, buffer)
  }, [])

  const loadAudioBuffer = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    const cached = audioBuffersRef.current.get(url)
    if (cached) return cached
    if (!url.startsWith('http')) {
      console.warn('loadAudioBuffer: no cached buffer for key:', url)
      return null
    }
    try {
      const ctx = getCtx()
      const res = await fetch(url)
      const arrayBuffer = await res.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arrayBuffer)
      audioBuffersRef.current.set(url, buffer)
      return buffer
    } catch (e) {
      console.warn('Failed to load audio buffer:', url, e)
      return null
    }
  }, [getCtx])

  // ── Apply fade ramps to a clip gain node ──────────────────────────────────
  const applyFadeRamps = useCallback((
    clipGain: GainNode,
    clip: Clip,
    bpm: number,
    clipOffsetSec: number,
    scheduledAtCtxTime: number,
    playDuration: number,
  ) => {
    const ctx = getCtx()
    const beatDur = 60 / bpm
    const fadeInSec = (clip.fadeIn ?? 0) * beatDur
    const fadeOutSec = (clip.fadeOut ?? 0) * beatDur
    const curve = clip.fadeInCurve ?? 'exp'

    const now = ctx.currentTime
    const startTime = scheduledAtCtxTime
    const endTime = startTime + playDuration

    // Initial gain = 0 if fade-in, else gain value
    if (fadeInSec > 0) {
      const fadeInStartSec = Math.max(0, fadeInSec - clipOffsetSec)
      clipGain.gain.setValueAtTime(0.0001, startTime)
      if (curve === 'linear') {
        clipGain.gain.linearRampToValueAtTime(clip.gain, startTime + fadeInStartSec)
      } else if (curve === 's-curve') {
        // S-curve: set halfway through at sqrt(gain)
        clipGain.gain.setValueAtTime(0.0001, startTime)
        clipGain.gain.linearRampToValueAtTime(clip.gain * 0.5, startTime + fadeInStartSec / 2)
        clipGain.gain.linearRampToValueAtTime(clip.gain, startTime + fadeInStartSec)
      } else {
        // Exponential (Logic Pro default)
        clipGain.gain.exponentialRampToValueAtTime(clip.gain, startTime + fadeInStartSec)
      }
    } else {
      clipGain.gain.setValueAtTime(clip.gain, startTime)
    }

    // Fade out
    if (fadeOutSec > 0) {
      const fadeOutStart = endTime - fadeOutSec
      if (fadeOutStart > startTime) {
        clipGain.gain.setValueAtTime(clip.gain, Math.max(now, fadeOutStart))
        if (curve === 'linear') {
          clipGain.gain.linearRampToValueAtTime(0.0001, endTime)
        } else {
          clipGain.gain.exponentialRampToValueAtTime(0.0001, endTime)
        }
      }
    }
  }, [getCtx])

  const playClip = useCallback(async (
    audioUrl: string,
    trackId: string,
    clip: Clip,
    bpm: number,
    playheadBeat: number,
    volume: number,
    pan: number,
  ) => {
    const ctx = getCtx()
    const nodes = getTrackNodes(trackId, volume, pan)
    const buffer = await loadAudioBuffer(audioUrl)
    if (!buffer) return null

    const beatDuration = 60 / bpm
    const clipStartSec = clip.startBeat * beatDuration
    const clipDurSec = clip.durationBeats * beatDuration
    const playheadSec = playheadBeat * beatDuration
    const clipOffset = Math.max(0, playheadSec - clipStartSec)
    if (clipOffset >= clipDurSec) return null

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = 1
    if (clip.looped) source.loop = true

    const clipGain = ctx.createGain()
    clipGain.gain.value = clip.gain
    source.connect(clipGain)
    clipGain.connect(nodes.gain)

    const when = Math.max(0, clipStartSec - playheadSec)
    const scheduledAt = ctx.currentTime + when
    const playDuration = clipDurSec - clipOffset

    source.start(scheduledAt, clipOffset, clip.looped ? undefined : playDuration)

    // Apply fade ramps
    applyFadeRamps(clipGain, clip, bpm, clipOffset, scheduledAt, playDuration)

    scheduledSourcesRef.current.push({ source, clipId: clip.id })
    source.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter(s => s.source !== source)
    }
    return source
  }, [getCtx, getTrackNodes, loadAudioBuffer, applyFadeRamps])



  const startPlayback = useCallback(async (fromBeat: number) => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    const { tracks, bpm } = useProjectStore.getState()
    const anySolo = tracks.some(t => t.solo && t.type !== 'master')

    for (const track of tracks) {
      if (track.type === 'master') continue
      // Solo logic: if any track is soloed, mute all non-soloed tracks
      const effectiveVol = track.muted ? 0 : (anySolo && !track.solo) ? 0 : track.volume
      const nodes = getTrackNodes(track.id, track.volume, track.pan)
      nodes.gain.gain.value = effectiveVol
      if (effectiveVol === 0) continue

      for (const clip of track.clips) {
        if (!clip.audioUrl || clip.muted) continue
        const clipEndBeat = clip.startBeat + clip.durationBeats
        if (clipEndBeat <= fromBeat) continue
        await playClip(clip.audioUrl, track.id, clip, bpm, fromBeat, effectiveVol, track.pan)
      }
    }
  }, [getCtx, getTrackNodes, playClip])

  // ── Apply solo/mute state live (called when user toggles solo/mute) ──────
  const applySoloMute = useCallback(() => {
    const { tracks } = useProjectStore.getState()
    const anySolo = tracks.some(t => t.solo && t.type !== 'master')
    for (const track of tracks) {
      const nodes = trackNodesRef.current.get(track.id)
      if (!nodes) continue
      const effectiveVol = track.muted ? 0 : (anySolo && !track.solo && track.type !== 'master') ? 0 : track.volume
      nodes.gain.gain.value = effectiveVol
    }
  }, [])

  const stopAll = useCallback(() => {
    for (const { source } of scheduledSourcesRef.current) {
      try { source.stop() } catch {}
    }
    scheduledSourcesRef.current = []
  }, [])

  // ── Metronome ────────────────────────────────────────────────────────────
  const startMetronome = useCallback((bpm: number, volume: number) => {
    if (metronomeIntervalRef.current !== null) {
      clearInterval(metronomeIntervalRef.current)
      metronomeIntervalRef.current = null
    }
    const ctx = getCtx()
    const beatMs = (60 / bpm) * 1000
    let beat = 0

    const tick = () => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.connect(g)
      g.connect(ctx.destination)
      osc.frequency.value = beat % 4 === 0 ? 1200 : 800
      g.gain.setValueAtTime(volume, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.06)
      beat++
    }

    tick()
    metronomeIntervalRef.current = window.setInterval(tick, beatMs)
  }, [getCtx])

  const stopMetronome = useCallback(() => {
    if (metronomeIntervalRef.current !== null) {
      clearInterval(metronomeIntervalRef.current)
      metronomeIntervalRef.current = null
    }
  }, [])

  // ── Microphone Recording ─────────────────────────────────────────────────
  const startRecording = useCallback(async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      mediaStreamRef.current = stream
      recordedChunksRef.current = []

      const ctx = getCtx()
      if (ctx.state === 'suspended') await ctx.resume()

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg'

      const micSource = ctx.createMediaStreamSource(stream)
      const micAnalyser = ctx.createAnalyser()
      micAnalyser.fftSize = 512
      micSource.connect(micAnalyser)
      micSourceRef.current = micSource
      micAnalyserRef.current = micAnalyser

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data)
        }
      }

      recorder.start(100)
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone access denied. Please allow microphone access in your browser settings.'
        : `Could not access microphone: ${err?.message ?? err}`
      throw new Error(msg)
    }
  }, [getCtx])

  const stopRecording = useCallback(async (): Promise<AudioBuffer | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        resolve(null)
        return
      }

      recorder.onstop = async () => {
        try { micSourceRef.current?.disconnect() } catch {}
        try { micAnalyserRef.current?.disconnect() } catch {}
        micSourceRef.current = null
        micAnalyserRef.current = null

        mediaStreamRef.current?.getTracks().forEach(t => t.stop())
        mediaStreamRef.current = null

        if (!recordedChunksRef.current.length) {
          resolve(null)
          return
        }

        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType })
        try {
          const arrayBuffer = await blob.arrayBuffer()
          const ctx = getCtx()
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
          resolve(audioBuffer)
        } catch (e) {
          console.error('Failed to decode recorded audio:', e)
          resolve(null)
        }
        recordedChunksRef.current = []
        mediaRecorderRef.current = null
      }

      recorder.stop()
    })
  }, [getCtx])

  const isRecordingActive = useCallback((): boolean => {
    return mediaRecorderRef.current?.state === 'recording'
  }, [])

  // ── Mic level meter ──────────────────────────────────────────────────────
  const getMicLevel = useCallback((): number => {
    const analyser = micAnalyserRef.current
    if (!analyser) return 0
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    let max = 0
    for (const v of data) if (Math.abs(v) > max) max = Math.abs(v)
    return Math.min(1, max)
  }, [])

  // ── Level meters ─────────────────────────────────────────────────────────
  const getTrackLevel = useCallback((trackId: string): number => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes) return 0
    const data = new Float32Array(nodes.analyser.fftSize)
    nodes.analyser.getFloatTimeDomainData(data)
    let max = 0
    for (const v of data) if (Math.abs(v) > max) max = Math.abs(v)
    return Math.min(1, max)
  }, [])

  const getMasterLevel = useCallback((): [number, number] => {
    if (!masterAnalyserRef.current) return [0, 0]
    const data = new Float32Array(masterAnalyserRef.current.fftSize)
    masterAnalyserRef.current.getFloatTimeDomainData(data)
    const half = data.length / 2
    let lMax = 0, rMax = 0
    for (let i = 0; i < half; i++) { const v = Math.abs(data[i]); if (v > lMax) lMax = v }
    for (let i = half; i < data.length; i++) { const v = Math.abs(data[i]); if (v > rMax) rMax = v }
    return [Math.min(1, lMax), Math.min(1, rMax)]
  }, [])

  // ── Track parameter control ───────────────────────────────────────────────
  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (nodes) nodes.gain.gain.value = Math.max(0, volume)
  }, [])

  const setTrackPan = useCallback((trackId: string, pan: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (nodes) nodes.panner.pan.value = Math.max(-1, Math.min(1, pan))
  }, [])

  const setMasterVolume = useCallback((volume: number) => {
    if (masterGainRef.current) masterGainRef.current.gain.value = Math.max(0, volume)
  }, [])

  const setTrackEQ = useCallback((trackId: string, low: number, mid: number, high: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes || nodes.eq.length < 3) return
    nodes.eq[0].gain.value = low
    nodes.eq[1].gain.value = mid
    nodes.eq[2].gain.value = high
  }, [])

  const setTrackCompressor = useCallback((trackId: string, threshold: number, ratio: number, attack: number, release: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes) return
    nodes.compressor.threshold.value = threshold
    nodes.compressor.ratio.value = ratio
    nodes.compressor.attack.value = attack
    nodes.compressor.release.value = release
  }, [])

  // ── Reverb / Delay control ────────────────────────────────────────────────
  const setTrackReverb = useCallback((trackId: string, wet: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes?.reverbGain) return
    nodes.reverbGain.gain.value = Math.max(0, Math.min(1, wet))
  }, [])

  const setTrackDelay = useCallback((trackId: string, wet: number, time: number, feedback: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes?.delayWet || !nodes.delay || !nodes.delayFeedback) return
    nodes.delayWet.gain.value = Math.max(0, Math.min(1, wet))
    nodes.delay.delayTime.value = Math.max(0, Math.min(4, time))
    nodes.delayFeedback.gain.value = Math.max(0, Math.min(0.98, feedback))
  }, [])

  const generateWaveformPeaks = useCallback((buffer: AudioBuffer, numPeaks = 200): number[] => {
    const channel = buffer.getChannelData(0)
    const blockSize = Math.floor(channel.length / numPeaks)
    const peaks: number[] = []
    for (let i = 0; i < numPeaks; i++) {
      let max = 0
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(channel[i * blockSize + j] ?? 0)
        if (v > max) max = v
      }
      peaks.push(max)
    }
    return peaks
  }, [])

  // Normalize a clip's gain based on peak amplitude
  const normalizeClipGain = useCallback((audioUrl: string): number => {
    const buffer = audioBuffersRef.current.get(audioUrl)
    if (!buffer) return 1
    const channel = buffer.getChannelData(0)
    let peak = 0
    for (const v of channel) if (Math.abs(v) > peak) peak = Math.abs(v)
    return peak > 0 ? Math.min(2, 0.9 / peak) : 1
  }, [])

  // ── Play a preview note (piano roll key click) ────────────────────────────
  const heldNotesRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode }>>(new Map())

  const noteOn = useCallback((pitch: number, velocity = 100) => {
    if (heldNotesRef.current.has(pitch)) return
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const freq = 440 * Math.pow(2, (pitch - 69) / 12)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(masterGainRef.current ?? ctx.destination)
    const vol = (velocity / 127) * 0.4
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.005)
    osc.start(ctx.currentTime)
    heldNotesRef.current.set(pitch, { osc, gain })
  }, [getCtx])

  const noteOff = useCallback((pitch: number) => {
    const held = heldNotesRef.current.get(pitch)
    if (!held) return
    const ctx = getCtx()
    const { osc, gain } = held
    gain.gain.cancelScheduledValues(ctx.currentTime)
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    try { osc.stop(ctx.currentTime + 0.09) } catch {}
    heldNotesRef.current.delete(pitch)
  }, [getCtx])

  const allNotesOff = useCallback(() => {
    for (const pitch of heldNotesRef.current.keys()) noteOff(pitch)
  }, [noteOff])

  const playPreviewNote = useCallback((pitch: number, durationSec = 0.4) => {
    noteOn(pitch, 100)
    setTimeout(() => noteOff(pitch), durationSec * 1000)
  }, [noteOn, noteOff])

  useEffect(() => {
    return () => {
      stopAll()
      stopMetronome()
      mediaRecorderRef.current?.stop()
      mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      ctxRef.current?.close()
    }
  }, [stopAll, stopMetronome])

  return {
    getCtx,
    startPlayback,
    stopAll,
    playClip,
    applySoloMute,
    startMetronome,
    stopMetronome,
    startRecording,
    stopRecording,
    isRecordingActive,
    getMicLevel,
    getTrackLevel,
    getMasterLevel,
    setTrackEQ,
    setTrackCompressor,
    setTrackReverb,
    setTrackDelay,
    setTrackVolume,
    setTrackPan,
    setMasterVolume,
    loadAudioBuffer,
    registerAudioBuffer,
    generateWaveformPeaks,
    normalizeClipGain,
    applyFadeRamps,
    noteOn,
    noteOff,
    allNotesOff,
    playPreviewNote,
    audioBuffersRef,
  }
}
