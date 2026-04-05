import { useRef, useCallback, useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'

export function useTransport(
  onStartPlayback: (fromBeat: number) => void,
  onStopAll: () => void,
  onStartMetronome: (bpm: number, vol: number) => void,
  onStopMetronome: () => void,
  onStartRecording: () => Promise<void>,
  onStopRecording: () => Promise<AudioBuffer | null>,
  onRegisterAudioBuffer?: (key: string, buffer: AudioBuffer) => void,
) {
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const anchorBeatRef = useRef<number>(0)
  const lastTimestampRef = useRef<number | null>(null)
  const countInRef = useRef<number>(0)
  const countInIntervalRef = useRef<number | null>(null)
  const recordStartBeatRef = useRef<number>(0)

  const store = useProjectStore

  // ── Internal RAF clock ─────────────────────────────────────────────────────
  const startRaf = useCallback((fromBeat: number) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    anchorBeatRef.current = fromBeat
    startedAtRef.current = performance.now()
    lastTimestampRef.current = null

    const step = (ts: number) => {
      const st = store.getState()
      if (!st.isPlaying) return

      // Stall detection
      const prev = lastTimestampRef.current
      if (prev !== null && ts - prev > 200 && startedAtRef.current !== null) {
        const stall = (ts - prev) - (1000 / 60)
        startedAtRef.current = startedAtRef.current + stall
      }
      lastTimestampRef.current = ts

      const elapsed = (ts - (startedAtRef.current ?? ts)) / 1000
      const beat = anchorBeatRef.current + elapsed * (st.bpm / 60)
      const timeSec = beat * (60 / st.bpm)

      // Loop mode
      if (st.isLooping && beat >= st.loopEnd) {
        anchorBeatRef.current = st.loopStart
        startedAtRef.current = ts
        lastTimestampRef.current = null
        onStopAll()
        onStartPlayback(st.loopStart)
        rafRef.current = requestAnimationFrame(step)
        return
      }

      store.getState().setCurrentTime(timeSec)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [onStopAll, onStartPlayback, store])

  const play = useCallback(async () => {
    const st = store.getState()
    if (st.isPlaying) return
    const fromBeat = st.currentTime * (st.bpm / 60)
    store.getState().setPlaying(true)
    await onStartPlayback(fromBeat)
    if (st.metronomeEnabled) onStartMetronome(st.bpm, st.metronomeVolume)
    startRaf(fromBeat)
  }, [onStartPlayback, onStartMetronome, startRaf, store])

  const pause = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    startedAtRef.current = null
    lastTimestampRef.current = null
    store.getState().setPlaying(false)
    onStopAll()
    onStopMetronome()
  }, [onStopAll, onStopMetronome, store])

  const stop = useCallback(async () => {
    // If recording, stop it and save the clip
    const st = store.getState()
    if (st.isRecording) {
      store.getState().setRecording(false)
      store.getState().setCountIn(0)
      if (countInIntervalRef.current) {
        clearInterval(countInIntervalRef.current)
        countInIntervalRef.current = null
      }
      const audioBuffer = await onStopRecording()
      if (audioBuffer) {
        // Find first armed track
        const armedTrack = st.tracks.find(t => t.armed)
        if (armedTrack) {
          const bpm = st.bpm
          const durationBeats = (audioBuffer.duration / 60) * bpm
          const startBeat = recordStartBeatRef.current
          const id = `clip-rec-${Date.now()}`

          // Convert AudioBuffer → Blob → Object URL so playback can fetch it
          let audioUrl: string | undefined
          try {
            const numChannels = audioBuffer.numberOfChannels
            const sampleRate = audioBuffer.sampleRate
            const length = audioBuffer.length
            const offlineCtx = new OfflineAudioContext(numChannels, length, sampleRate)
            const src = offlineCtx.createBufferSource()
            src.buffer = audioBuffer
            src.connect(offlineCtx.destination)
            src.start(0)
            const rendered = await offlineCtx.startRendering()
            // WAV encode
            const numSamples = rendered.length * numChannels
            const wavBuffer = new ArrayBuffer(44 + numSamples * 2)
            const view = new DataView(wavBuffer)
            const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
            writeStr(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true)
            writeStr(8, 'WAVE'); writeStr(12, 'fmt ')
            view.setUint32(16, 16, true); view.setUint16(20, 1, true)
            view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true)
            view.setUint32(28, sampleRate * numChannels * 2, true)
            view.setUint16(32, numChannels * 2, true); view.setUint16(34, 16, true)
            writeStr(36, 'data'); view.setUint32(40, numSamples * 2, true)
            let offset = 44
            for (let i = 0; i < rendered.length; i++) {
              for (let ch = 0; ch < numChannels; ch++) {
                const s = Math.max(-1, Math.min(1, rendered.getChannelData(ch)[i]))
                view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
                offset += 2
              }
            }
            const blob = new Blob([wavBuffer], { type: 'audio/wav' })
            audioUrl = URL.createObjectURL(blob)
            // Also pre-register in audio engine cache so first playback is instant
            onRegisterAudioBuffer?.(audioUrl, rendered)
          } catch (encErr) {
            console.error('WAV encode failed:', encErr)
          }

          // Waveform peaks
          const peaks: number[] = []
          const ch = audioBuffer.getChannelData(0)
          const blockSize = Math.floor(ch.length / 200)
          for (let i = 0; i < 200; i++) {
            let max = 0
            for (let j = 0; j < blockSize; j++) {
              const v = Math.abs(ch[i * blockSize + j] ?? 0)
              if (v > max) max = v
            }
            peaks.push(max)
          }

          const clip: import('../store/projectStore').Clip = {
            id,
            trackId: armedTrack.id,
            startBeat,
            durationBeats: Math.max(1, durationBeats),
            name: `Recording ${new Date().toLocaleTimeString()}`,
            type: 'audio',
            audioUrl,
            gain: 1, fadeIn: 0, fadeOut: 0,
            looped: false, muted: false, aiGenerated: false,
            waveformPeaks: peaks,
          }
          store.getState().addClip(clip)
        }
      }
    }

    pause()
    store.getState().setCurrentTime(0)
    anchorBeatRef.current = 0
  }, [pause, onStopRecording, store])

  const togglePlay = useCallback(() => {
    const st = store.getState()
    if (st.isPlaying) pause()
    else play()
  }, [play, pause, store])

  // ── Record — with count-in ────────────────────────────────────────────────
  const record = useCallback(async () => {
    const st = store.getState()

    // Check for armed track
    const armedTrack = st.tracks.find(t => t.armed && t.type !== 'master')
    if (!armedTrack) {
      alert('Arm at least one track to record.\n\nClick the ⏺ button on a track header.')
      return
    }

    if (st.isRecording) {
      // Stop recording
      await stop()
      return
    }

    // Count-in: 4 beats before recording starts
    const bpm = st.bpm
    const beatMs = (60 / bpm) * 1000
    let countdown = 4
    store.getState().setCountIn(countdown)

    // Start metronome for count-in
    onStartMetronome(bpm, st.metronomeVolume || 0.5)

    countInIntervalRef.current = window.setInterval(async () => {
      countdown--
      store.getState().setCountIn(countdown)

      if (countdown <= 0) {
        if (countInIntervalRef.current) {
          clearInterval(countInIntervalRef.current)
          countInIntervalRef.current = null
        }
        store.getState().setCountIn(0)

        // NOW start recording and playing
        store.getState().setRecording(true)
        store.getState().setPlaying(true)

        try {
          await onStartRecording()
        } catch (err: any) {
          alert(err.message)
          store.getState().setRecording(false)
          store.getState().setPlaying(false)
          onStopMetronome()
          return
        }

        const fromBeat = store.getState().currentTime * (store.getState().bpm / 60)
        // Capture where in the timeline recording actually starts
        recordStartBeatRef.current = fromBeat
        await onStartPlayback(fromBeat)
        startRaf(fromBeat)
      }
    }, beatMs)
  }, [stop, onStartRecording, onStartPlayback, onStartMetronome, onStopMetronome, startRaf, store])

  const seekToTime = useCallback((timeSec: number) => {
    const wasPlaying = store.getState().isPlaying
    if (wasPlaying) pause()
    store.getState().setCurrentTime(timeSec)
    anchorBeatRef.current = timeSec * (store.getState().bpm / 60)
    if (wasPlaying) play()
  }, [pause, play, store])

  const seekToBeat = useCallback((beat: number) => {
    const bpm = store.getState().bpm
    seekToTime(beat * (60 / bpm))
  }, [seekToTime, store])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (countInIntervalRef.current) clearInterval(countInIntervalRef.current)
    }
  }, [])

  return { play, pause, stop, togglePlay, record, seekToTime, seekToBeat }
}
