import { useRef, useCallback, useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'

// ── Tempo-map helpers (mirrors getBpmAtBeat in useAudioEngine) ───────────────
function getBpmAtBeat(beat: number, tempoMap: { beat: number; bpm: number }[]): number {
  if (!tempoMap || tempoMap.length === 0) return 120
  const sorted = [...tempoMap].sort((a, b) => a.beat - b.beat)
  let bpm = sorted[0].bpm
  for (const pt of sorted) {
    if (beat >= pt.beat) bpm = pt.bpm
    else break
  }
  return bpm
}

/** Integrate seconds → beats using the tempo map (handles mid-song BPM changes). */
function integrateBeats(
  anchorBeat: number,
  elapsedSec: number,
  tempoMap: { beat: number; bpm: number }[],
): number {
  if (!tempoMap || tempoMap.length === 0) {
    return anchorBeat + elapsedSec * (120 / 60)
  }
  const sorted = [...tempoMap].sort((a, b) => a.beat - b.beat)
  let beat = anchorBeat
  let remaining = elapsedSec
  while (remaining > 0) {
    const currentBpm = getBpmAtBeat(beat, sorted)
    const beatsPerSec = currentBpm / 60
    // Find the next tempo-change point
    const nextPt = sorted.find(pt => pt.beat > beat)
    if (!nextPt) {
      beat += remaining * beatsPerSec
      break
    }
    const beatsToNext = nextPt.beat - beat
    const secsToNext = beatsToNext / beatsPerSec
    if (secsToNext >= remaining) {
      beat += remaining * beatsPerSec
      break
    }
    beat = nextPt.beat
    remaining -= secsToNext
  }
  return beat
}

/** Convert a beat position back to wall-clock seconds using the tempo map. */
function beatToSec(beat: number, tempoMap: { beat: number; bpm: number }[]): number {
  if (!tempoMap || tempoMap.length === 0) return beat / (120 / 60)
  const sorted = [...tempoMap].sort((a, b) => a.beat - b.beat)
  let sec = 0
  let prevBeat = 0
  for (const pt of sorted) {
    if (pt.beat >= beat) break
    const segBpm = pt.bpm
    const segEnd = Math.min(pt.beat, beat)
    sec += (segEnd - prevBeat) / (segBpm / 60)
    prevBeat = pt.beat
  }
  sec += (beat - prevBeat) / (getBpmAtBeat(beat, sorted) / 60)
  return sec
}

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
  // Punch In/Out tracking
  const punchArmedRef = useRef<boolean>(false)   // waiting for punchIn beat
  const punchRecordingRef = useRef<boolean>(false) // currently capturing in punch window
  // Cycle recording pass counter
  const cyclePassRef = useRef<number>(0)
  // Stable ref to _saveRecordedBuffer so RAF can call it without stale closure
  const saveBufferRef = useRef<((buf: AudioBuffer) => void) | null>(null)

  const store = useProjectStore

  // ── Internal RAF clock (tempo-map aware) ───────────────────────────────────
  const startRaf = useCallback((fromBeat: number) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    anchorBeatRef.current = fromBeat
    startedAtRef.current = performance.now()
    lastTimestampRef.current = null

    const step = (ts: number) => {
      const st = store.getState()
      if (!st.isPlaying) return

      // Stall detection — skip large gaps (e.g. tab switched away)
      const prev = lastTimestampRef.current
      if (prev !== null && ts - prev > 200 && startedAtRef.current !== null) {
        const stall = (ts - prev) - (1000 / 60)
        startedAtRef.current = startedAtRef.current + stall
      }
      lastTimestampRef.current = ts

      const elapsedSec = (ts - (startedAtRef.current ?? ts)) / 1000

      // Use tempo-map integrator so mid-song BPM changes are respected
      const tempoMap = st.tempoMap ?? []
      const beat = integrateBeats(anchorBeatRef.current, elapsedSec, tempoMap)
      const timeSec = beatToSec(beat, tempoMap)

      // ── Punch In/Out logic ────────────────────────────────────────────────
      if (st.punchEnabled && st.isRecording === false && punchArmedRef.current) {
        // Playhead has entered the punch window → start recording
        if (beat >= st.punchIn && beat < st.punchOut) {
          punchArmedRef.current = false
          punchRecordingRef.current = true
          recordStartBeatRef.current = beat
          store.getState().setRecording(true)
          // mic stream already open; just flag it
        }
      }
      if (st.punchEnabled && punchRecordingRef.current && beat >= st.punchOut) {
        // Punch Out point reached → stop recording, keep playing
        punchRecordingRef.current = false
        onStopRecording().then(buf => {
          if (buf) saveBufferRef.current?.(buf)
        }).catch(console.error)
        store.getState().setRecording(false)
      }

      // ── Loop / Cycle recording mode ───────────────────────────────────────
      if (st.isLooping && beat >= st.loopEnd) {
        // If cycle record is on and we are actively recording, cap the take and start a new one
        if (st.cycleRecordEnabled && st.isRecording) {
          cyclePassRef.current++
          onStopRecording().then(buf => {
            if (buf) saveBufferRef.current?.(buf)
            // Immediately start new recording pass
            store.getState().setRecording(true)
            onStartRecording().catch(console.error)
            recordStartBeatRef.current = st.loopStart
          }).catch(console.error)
        }

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
  // onApplyAutomation is intentionally excluded to avoid stale re-creation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStopAll, onStartPlayback, onStartRecording, onStopRecording, store])

  const play = useCallback(async () => {
    const st = store.getState()
    if (st.isPlaying) return
    const tempoMap = st.tempoMap ?? []
    
    let fromBeat: number
    
    // LOGIC PRO BEHAVIOR: Loop ON = ALWAYS start from loop start
    if (st.isLooping) {
      fromBeat = st.loopStart
      store.getState().setCurrentTime(beatToSec(st.loopStart, tempoMap))
      console.log('[play] Loop is ON - jumping to loop start:', st.loopStart)
    } else {
      // Derive beat from current wall-clock position using tempo map
      fromBeat = integrateBeats(0, st.currentTime, tempoMap)
    }
    
    store.getState().setPlaying(true)
    await onStartPlayback(fromBeat)
    const currentBpm = getBpmAtBeat(fromBeat, tempoMap)
    if (st.metronomeEnabled) onStartMetronome(currentBpm, st.metronomeVolume)
    startRaf(fromBeat)
  }, [onStartPlayback, onStartMetronome, startRaf, store])

  // ── Shared helper: commit an AudioBuffer as a clip / take ─────────────────
  // (called from stopRecord AND from cycle/punch handlers in the RAF loop)
  // We keep saveBufferRef updated so the RAF step can call it without stale closure.
  const _saveRecordedBuffer = useCallback((audioBuffer: AudioBuffer) => {
    const st = store.getState()
    const armedTrack = st.tracks.find(t => t.armed)
    if (!armedTrack) return

    const bpm = st.bpm
    const durationBeats = (audioBuffer.duration * bpm) / 60
    const startBeat = recordStartBeatRef.current
    const passLabel = cyclePassRef.current > 0 ? ` (Pass ${cyclePassRef.current})` : ''
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

    const overlappingClip = armedTrack.clips.find(c => {
      const cEnd = c.startBeat + c.durationBeats
      const newEnd = startBeat + durationBeats
      return c.startBeat < newEnd && cEnd > startBeat
    })

    const takeName = `Take ${new Date().toLocaleTimeString()}${passLabel}`

    if (overlappingClip) {
      const take: import('../store/projectStore').Take = {
        id, name: takeName, audioUrl, waveformPeaks: peaks, gain: 1,
      }
      store.getState().addTakeToClip(overlappingClip.id, take)
      store.getState().updateClip(overlappingClip.id, { audioUrl, waveformPeaks: peaks })
    } else {
      const clip: import('../store/projectStore').Clip = {
        id, trackId: armedTrack.id, startBeat, durationBeats,
        name: takeName, type: 'audio', audioUrl,
        gain: 1, fadeIn: 0, fadeOut: 0,
        fadeInCurve: 'exp', fadeOutCurve: 'exp',
        looped: false, muted: false, aiGenerated: false,
        waveformPeaks: peaks,
        takes: [{ id, name: takeName, audioUrl, waveformPeaks: peaks, gain: 1 }],
        activeTakeIndex: 0,
      }
      store.getState().addClip(clip)
    }
  }, [onRegisterAudioBuffer, store])

  // Keep saveBufferRef current
  saveBufferRef.current = _saveRecordedBuffer

  // ── Stop recording and save clip (does NOT reset playhead) ─────────────────
  const stopRecord = useCallback(async () => {
    // Cancel any pending count-in
    if (countInIntervalRef.current) {
      clearInterval(countInIntervalRef.current)
      countInIntervalRef.current = null
    }
    store.getState().setCountIn(0)
    store.getState().setRecording(false)
    punchArmedRef.current = false
    punchRecordingRef.current = false
    cyclePassRef.current = 0

    const audioBuffer = await onStopRecording()
    if (audioBuffer) {
      _saveRecordedBuffer(audioBuffer)
    }
    // Don't stop playback - just stop metronome
    onStopMetronome()
  }, [onStopRecording, _saveRecordedBuffer, onStopMetronome, store])

  const pause = useCallback(async () => {
    console.log('[pause] PAUSING PLAYBACK - about to call onStopAll()')
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    startedAtRef.current = null
    lastTimestampRef.current = null
    
    // If recording is active, stop and render the clip immediately
    const st = store.getState()
    if (st.isRecording) {
      await stopRecord()
    }
    
    store.getState().setPlaying(false)
    console.log('[pause] Calling onStopAll() NOW')
    onStopAll()
    console.log('[pause] onStopAll() completed')
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
    console.log('[togglePlay] SPACEBAR PRESSED! isPlaying:', st.isPlaying)
    if (st.isPlaying) {
      console.log('[togglePlay] Calling pause()...')
      pause()
    } else {
      console.log('[togglePlay] Calling play()...')
      play()
    }
  }, [play, pause, store])

  // ── Record — with count-in, punch-in, and cycle support ───────────────────
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

    // Reset cycle pass counter
    cyclePassRef.current = 0

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

        const _recState = store.getState()
        const fromBeat = integrateBeats(0, _recState.currentTime, _recState.tempoMap ?? [])

        store.getState().setPlaying(true)

        if (_recState.punchEnabled) {
          // Punch mode: arm for punch-in, open mic stream early to avoid latency
          punchArmedRef.current = true
          punchRecordingRef.current = false
          try {
            await onStartRecording() // open mic stream now
          } catch (err: any) {
            alert(err.message)
            store.getState().setPlaying(false)
            onStopMetronome()
            return
          }
          // isRecording stays false until punchIn beat in RAF
          await onStartPlayback(fromBeat)
          startRaf(fromBeat)
        } else {
          // Normal / cycle mode: start recording immediately
          store.getState().setRecording(true)
          try {
            await onStartRecording()
          } catch (err: any) {
            alert(err.message)
            store.getState().setRecording(false)
            store.getState().setPlaying(false)
            onStopMetronome()
            return
          }
          recordStartBeatRef.current = fromBeat
          await onStartPlayback(fromBeat)
          startRaf(fromBeat)
        }
      }
    }, beatMs)
  }, [stopRecord, onStartRecording, onStartPlayback, onStartMetronome, onStopMetronome, startRaf, store])

  const seekToTime = useCallback((timeSec: number) => {
    const wasPlaying = store.getState().isPlaying
    if (wasPlaying) pause()
    store.getState().setCurrentTime(timeSec)
    // Re-derive beat position using tempo map so seeks are accurate
    const tempoMap = store.getState().tempoMap ?? []
    anchorBeatRef.current = integrateBeats(0, timeSec, tempoMap)
    if (wasPlaying) play()
  }, [pause, play, store])

  const seekToBeat = useCallback((beat: number) => {
    const tempoMap = store.getState().tempoMap ?? []
    seekToTime(beatToSec(beat, tempoMap))
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
    const tempoMap = st.tempoMap ?? []
    // When looping, "to start" means go to loopStart, not absolute 0
    const targetBeat = st.isLooping ? st.loopStart : 0
    const targetTime = beatToSec(targetBeat, tempoMap)
    store.getState().setCurrentTime(targetTime)
    anchorBeatRef.current = targetBeat
  }, [pause, store])

  return { play, pause, stop, toStart, togglePlay, record, seekToTime, seekToBeat }
}
