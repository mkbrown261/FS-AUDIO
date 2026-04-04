import { useRef, useCallback, useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'

// ─── Audio Engine Hook ─────────────────────────────────────────────────────────
// Wraps the Web Audio API for multi-track playback, recording, metering

interface TrackNodes {
  gain: GainNode
  panner: StereoPannerNode
  analyser: AnalyserNode
  eq: BiquadFilterNode[]
  compressor: DynamicsCompressorNode
}

interface ScheduledSource {
  source: AudioBufferSourceNode
  clipId: string
}

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const masterAnalyserRef = useRef<AnalyserNode | null>(null)
  const trackNodesRef = useRef<Map<string, TrackNodes>>(new Map())
  const scheduledSourcesRef = useRef<ScheduledSource[]>([])
  const metronomeRef = useRef<OscillatorNode | null>(null)
  const metronomeIntervalRef = useRef<number | null>(null)
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map())

  const store = useProjectStore.getState

  // ── Initialize AudioContext lazily ─────────────────────────────────────────
  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' })
      masterGainRef.current = ctxRef.current.createGain()
      masterGainRef.current.gain.value = 0.9
      masterAnalyserRef.current = ctxRef.current.createAnalyser()
      masterAnalyserRef.current.fftSize = 2048
      masterGainRef.current.connect(masterAnalyserRef.current)
      masterAnalyserRef.current.connect(ctxRef.current.destination)
    }
    return ctxRef.current
  }, [])

  // ── Build track node chain ─────────────────────────────────────────────────
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

    // 3-band EQ
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

    // Chain: gain → eq → compressor → panner → analyser → master
    gain.connect(lowShelf)
    lowShelf.connect(midPeak)
    midPeak.connect(highShelf)
    highShelf.connect(compressor)
    compressor.connect(panner)
    panner.connect(analyser)
    analyser.connect(masterGainRef.current!)

    const nodes: TrackNodes = { gain, panner, analyser, eq: [lowShelf, midPeak, highShelf], compressor }
    trackNodesRef.current.set(trackId, nodes)
    return nodes
  }, [getCtx])

  // ── Load audio buffer from URL or file path ────────────────────────────────
  const loadAudioBuffer = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    const cached = audioBuffersRef.current.get(url)
    if (cached) return cached
    try {
      const ctx = getCtx()
      let arrayBuffer: ArrayBuffer
      if (url.startsWith('file://') || url.startsWith('/') || /^[A-Z]:\\/i.test(url)) {
        // Local file — use fetch with file:// scheme
        const res = await fetch('file://' + (url.startsWith('/') ? url : '/' + url))
        arrayBuffer = await res.arrayBuffer()
      } else {
        const res = await fetch(url)
        arrayBuffer = await res.arrayBuffer()
      }
      const buffer = await ctx.decodeAudioData(arrayBuffer)
      audioBuffersRef.current.set(url, buffer)
      return buffer
    } catch (e) {
      console.warn('Failed to load audio buffer:', url, e)
      return null
    }
  }, [getCtx])

  // ── Play a single clip ─────────────────────────────────────────────────────
  const playClip = useCallback(async (
    audioUrl: string,
    trackId: string,
    clipStartBeat: number,
    clipDurationBeats: number,
    bpm: number,
    playheadBeat: number,
    volume: number,
    pan: number,
    gain: number = 1,
  ) => {
    const ctx = getCtx()
    const nodes = getTrackNodes(trackId, volume, pan)

    const buffer = await loadAudioBuffer(audioUrl)
    if (!buffer) return null

    const beatDuration = 60 / bpm
    const clipStartSec = clipStartBeat * beatDuration
    const clipDurSec = clipDurationBeats * beatDuration
    const playheadSec = playheadBeat * beatDuration

    // How far into the clip are we?
    const clipOffset = Math.max(0, playheadSec - clipStartSec)
    if (clipOffset >= clipDurSec) return null  // Already past this clip

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = 1

    // Clip gain
    const clipGain = ctx.createGain()
    clipGain.gain.value = gain
    source.connect(clipGain)
    clipGain.connect(nodes.gain)

    const startAt = ctx.currentTime
    const when = Math.max(0, clipStartSec - playheadSec)
    source.start(ctx.currentTime + when, clipOffset, clipDurSec - clipOffset)

    scheduledSourcesRef.current.push({ source, clipId: '' })
    source.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter(s => s.source !== source)
    }

    return source
  }, [getCtx, getTrackNodes, loadAudioBuffer])

  // ── Start full playback from a given beat ──────────────────────────────────
  const startPlayback = useCallback(async (fromBeat: number) => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const { tracks, bpm } = useProjectStore.getState()

    for (const track of tracks) {
      if (track.muted || track.type === 'master') continue
      const nodes = getTrackNodes(track.id, track.volume, track.pan)
      nodes.gain.gain.value = track.volume

      for (const clip of track.clips) {
        if (!clip.audioUrl || clip.muted) continue
        const clipEndBeat = clip.startBeat + clip.durationBeats
        if (clipEndBeat <= fromBeat) continue  // Clip is in the past
        await playClip(
          clip.audioUrl, track.id,
          clip.startBeat, clip.durationBeats,
          bpm, fromBeat,
          track.volume, track.pan, clip.gain
        )
      }
    }
  }, [getCtx, getTrackNodes, playClip])

  // ── Stop all playback ──────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    for (const { source } of scheduledSourcesRef.current) {
      try { source.stop() } catch {}
    }
    scheduledSourcesRef.current = []
    stopMetronome()
  }, [])

  // ── Metronome ──────────────────────────────────────────────────────────────
  const startMetronome = useCallback((bpm: number, volume: number) => {
    stopMetronome()
    const ctx = getCtx()
    const beatMs = (60 / bpm) * 1000
    let beat = 0

    const tick = () => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = beat % 4 === 0 ? 1200 : 800
      gain.gain.setValueAtTime(volume, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.06)
      beat++
    }

    tick()
    metronomeIntervalRef.current = window.setInterval(tick, beatMs)
  }, [getCtx])

  function stopMetronome() {
    if (metronomeIntervalRef.current !== null) {
      clearInterval(metronomeIntervalRef.current)
      metronomeIntervalRef.current = null
    }
  }

  // ── Get track peak level for VU meter (0-1) ────────────────────────────────
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
    let leftMax = 0, rightMax = 0
    for (let i = 0; i < half; i++) {
      const v = Math.abs(data[i]); if (v > leftMax) leftMax = v
    }
    for (let i = half; i < data.length; i++) {
      const v = Math.abs(data[i]); if (v > rightMax) rightMax = v
    }
    return [Math.min(1, leftMax), Math.min(1, rightMax)]
  }, [])

  // ── Apply EQ params to a track ─────────────────────────────────────────────
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

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes) return
    nodes.gain.gain.value = volume
  }, [])

  const setTrackPan = useCallback((trackId: string, pan: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes) return
    nodes.panner.pan.value = pan
  }, [])

  const setMasterVolume = useCallback((volume: number) => {
    if (masterGainRef.current) masterGainRef.current.gain.value = volume
  }, [])

  // ── Generate waveform peaks from AudioBuffer ───────────────────────────────
  const generateWaveformPeaks = useCallback((buffer: AudioBuffer, numPeaks = 200): number[] => {
    const channel = buffer.getChannelData(0)
    const blockSize = Math.floor(channel.length / numPeaks)
    const peaks: number[] = []
    for (let i = 0; i < numPeaks; i++) {
      let max = 0
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(channel[i * blockSize + j])
        if (v > max) max = v
      }
      peaks.push(max)
    }
    return peaks
  }, [])

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAll()
      ctxRef.current?.close()
    }
  }, [stopAll])

  return {
    getCtx,
    startPlayback,
    stopAll,
    playClip,
    startMetronome,
    stopMetronome,
    getTrackLevel,
    getMasterLevel,
    setTrackEQ,
    setTrackCompressor,
    setTrackVolume,
    setTrackPan,
    setMasterVolume,
    loadAudioBuffer,
    generateWaveformPeaks,
  }
}
