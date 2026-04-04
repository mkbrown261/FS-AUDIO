import { useRef, useCallback, useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'

export function useTransport(
  onStartPlayback: (fromBeat: number) => void,
  onStopAll: () => void,
  onStartMetronome: (bpm: number, vol: number) => void,
  onStopMetronome: () => void,
) {
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)   // performance.now() timestamp
  const anchorBeatRef = useRef<number>(0)             // beat at which we started
  const lastTimestampRef = useRef<number | null>(null) // for stall detection

  const store = useProjectStore

  const play = useCallback(async () => {
    const st = store.getState()
    const fromBeat = (st.currentTime / 60) * st.bpm
    anchorBeatRef.current = fromBeat
    startedAtRef.current = performance.now()
    lastTimestampRef.current = null
    store.getState().setPlaying(true)

    await onStartPlayback(fromBeat)

    if (st.metronomeEnabled) {
      onStartMetronome(st.bpm, st.metronomeVolume)
    }

    const step = (ts: number) => {
      const st2 = store.getState()
      if (!st2.isPlaying) return

      // Stall detection — compensate for fullscreen/tab-switch gaps
      const prev = lastTimestampRef.current
      if (prev !== null && ts - prev > 200 && startedAtRef.current !== null) {
        const stall = (ts - prev) - (1000 / 60)
        startedAtRef.current = startedAtRef.current + stall
      }
      lastTimestampRef.current = ts

      const elapsed = (ts - (startedAtRef.current ?? ts)) / 1000
      const beat = anchorBeatRef.current + elapsed * (st2.bpm / 60)
      const timeSec = beat * (60 / st2.bpm)

      // Loop
      if (st2.isLooping && beat >= st2.loopEnd) {
        anchorBeatRef.current = st2.loopStart
        startedAtRef.current = ts
        lastTimestampRef.current = null
        onStopAll()
        onStartPlayback(st2.loopStart)
        rafRef.current = requestAnimationFrame(step)
        return
      }

      store.getState().setCurrentTime(timeSec)
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
  }, [onStartPlayback, onStopAll, onStartMetronome, onStopMetronome, store])

  const pause = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    startedAtRef.current = null
    lastTimestampRef.current = null
    store.getState().setPlaying(false)
    onStopAll()
    onStopMetronome()
  }, [onStopAll, onStopMetronome, store])

  const stop = useCallback(() => {
    pause()
    store.getState().setCurrentTime(0)
    store.getState().setRecording(false)
    anchorBeatRef.current = 0
  }, [pause, store])

  const togglePlay = useCallback(() => {
    const st = store.getState()
    if (st.isPlaying) pause()
    else play()
  }, [play, pause, store])

  const record = useCallback(() => {
    const st = store.getState()
    if (!st.isPlaying) play()
    store.getState().setRecording(!st.isRecording)
  }, [play, store])

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

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { play, pause, stop, togglePlay, record, seekToTime, seekToBeat }
}
