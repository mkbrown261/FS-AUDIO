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
  onApplyAutomation?: (beat: number) => void,
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
      onApplyAutomation?.(beat)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [onStopAll, onStartPlayback, store])

  const play = useCallback(async () => {
    const st = store.getState()
    if (st.isPlaying) return
    // When loop is active, clamp start beat to within the loop region
    let fromBeat = st.currentTime * (st.bpm / 60)
    if (st.isLooping) {
      if (fromBeat < st.loopStart || fromBeat >= st.loopEnd) {
        fromBeat = st.loopStart
        store.getState().setCurrentTime(st.loopStart * (60 / st.bpm))
      }
    }
    store.getState().setPlaying(true)
    await onStartPlayback(fromBeat)
    if (st.metronomeEnabled) onStartMetronome(st.bpm, st.metronomeVolume)
    startRaf(fromBeat)
  }, [onStartPlayback, onStartMetronome, startRaf, store])

  // ── Stop recording and save clip (does NOT reset playhead) ─────────────────
  const stopRecord = useCallback(async () => {
    // Cancel any pending count-in
    if (countInIntervalRef.current) {
      clearInterval(countInIntervalRef.current)
      countInIntervalRef.current = null
    }
    store.getState().setCountIn(0)
    store.getState().setRecording(false)

    const st = store.getState()
    const audioBuffer = await onStopRecording()
    if (audioBuffer) {
      const armedTrack = st.tracks.find(t => t.armed)
      if (armedTrack) {
        const bpm = st.bpm
        const durationBeats = Math.max(0.25, (audioBuffer.duration / 60) * bpm)
        const startBeat = recordStartBeatRef.current
        const id = `clip-rec-${Date.now()}`
        const audioUrl = `rec:${id}`
        onRegisterAudioBuffer?.(audioUrl, audioBuffer)

        const peaks: number[] = []
        const ch = audioBuffer.getChannelData(0)
        const blockSize = Math.max(1, Math.floor(ch.length / 200))
        for (let i = 0; i < 200; i++) {
          let max = 0
          for (let j = 0; j < blockSize; j++) {
            const v = Math.abs(ch[i * blockSize + j] ?? 0)
            if (v > max) max = v
          }
          peaks.push(max)
        }

        // Check if there's an overlapping clip on this track → take folder mode
        const overlappingClip = armedTrack.clips.find(c => {
          const cEnd = c.startBeat + c.durationBeats
          const newEnd = startBeat + durationBeats
          return c.startBeat < newEnd && cEnd > startBeat
        })

        const takeName = `Take ${new Date().toLocaleTimeString()}`

        if (overlappingClip) {
          // Add as a new take to the existing overlapping clip
          const take: import('../store/projectStore').Take = {
            id,
            name: takeName,
            audioUrl,
            waveformPeaks: peaks,
            gain: 1,
          }
          store.getState().addTakeToClip(overlappingClip.id, take)
          // Also update the clip to point to the new take's audio
          store.getState().updateClip(overlappingClip.id, { audioUrl, waveformPeaks: peaks })
        } else {
          const clip: import('../store/projectStore').Clip = {
            id,
            trackId: armedTrack.id,
            startBeat,
            durationBeats,
            name: takeName,
            type: 'audio',
            audioUrl,
            gain: 1, fadeIn: 0, fadeOut: 0,
            fadeInCurve: 'exp', fadeOutCurve: 'exp',
            looped: false, muted: false, aiGenerated: false,
            waveformPeaks: peaks,
            takes: [{ id, name: takeName, audioUrl, waveformPeaks: peaks, gain: 1 }],
            activeTakeIndex: 0,
          }
          store.getState().addClip(clip)
        }
      }
    }
    // Don't stop playback - just stop metronome
    onStopMetronome()
  }, [onStopRecording, onRegisterAudioBuffer, onStopMetronome, store])

  const pause = useCallback(async () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    startedAtRef.current = null
    lastTimestampRef.current = null
    
    // If recording is active, stop and render the clip immediately
    const st = store.getState()
    if (st.isRecording) {
      await stopRecord()
    }
    
    store.getState().setPlaying(false)
    onStopAll()
    onStopMetronome()
  }, [onStopAll, onStopMetronome, store, stopRecord])

  const stop = useCallback(async () => {
    // If recording, stop it and save the clip
    const st = store.getState()
    if (st.isRecording || countInIntervalRef.current) {
      await stopRecord()
      return
    }

    pause()
    store.getState().setCurrentTime(0)
    anchorBeatRef.current = 0
  }, [pause, stopRecord, store])

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
      alert('Arm at least one track to record.\n\nClick the ARM button on a track header.')
      return
    }

    // If already recording or in count-in, stop immediately
    if (st.isRecording || countInIntervalRef.current) {
      await stopRecord()
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
  }, [stopRecord, onStartRecording, onStartPlayback, onStartMetronome, onStopMetronome, startRaf, store])

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

  // ── toStart — stop playback and return playhead to loop start (or beat 0) ──
  const toStart = useCallback(() => {
    pause()
    const st = store.getState()
    // When looping, "to start" means go to loopStart, not absolute 0
    const targetBeat = st.isLooping ? st.loopStart : 0
    const targetTime = targetBeat * (60 / st.bpm)
    store.getState().setCurrentTime(targetTime)
    anchorBeatRef.current = targetBeat
  }, [pause, store])

  return { play, pause, stop, toStart, togglePlay, record, seekToTime, seekToBeat }
}
