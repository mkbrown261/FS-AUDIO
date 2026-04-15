/**
 * FS-AUDIO Audio-to-MIDI Converter
 * Converts audio clips to MIDI notes using onset detection + autocorrelation pitch.
 * Pure Web Audio API — no external libraries needed.
 */

import React, { useState, useCallback } from 'react'
import { useProjectStore, MidiNote, Clip } from '../store/projectStore'

// ── Onset detection using spectral flux ──────────────────────────────────────
function detectOnsets(samples: Float32Array, sampleRate: number, sensitivity: number): number[] {
  const hopSize = 512
  const fftSize = 2048
  const onsets: number[] = []
  let prevMag = new Float32Array(fftSize / 2)

  for (let pos = 0; pos + fftSize < samples.length; pos += hopSize) {
    // Simple rectangular window
    const frame = samples.slice(pos, pos + fftSize)
    // Compute magnitude spectrum via DFT (simplified, fast)
    const mag = computeMagnitudeSpectrum(frame, fftSize)
    // Spectral flux: sum of positive differences
    let flux = 0
    for (let i = 0; i < mag.length; i++) {
      const diff = mag[i] - prevMag[i]
      if (diff > 0) flux += diff
    }
    // Threshold onset
    const threshold = sensitivity * 10
    if (flux > threshold && (onsets.length === 0 || (pos / sampleRate - onsets[onsets.length-1]) > 0.05)) {
      onsets.push(pos / sampleRate)
    }
    prevMag = mag
  }
  return onsets
}

// Simple DFT magnitude (fast enough for short frames)
function computeMagnitudeSpectrum(frame: Float32Array<ArrayBuffer>, fftSize: number): Float32Array<ArrayBuffer> {
  const half = fftSize / 2
  const mag = new Float32Array(half) as Float32Array<ArrayBuffer>
  // Use a simplified power-of-2 DFT approximation for speed
  for (let k = 0; k < half; k++) {
    let re = 0, im = 0
    // Sample every 4th input for speed (rough approximation)
    const step = Math.max(1, Math.floor(fftSize / 128))
    for (let n = 0; n < fftSize; n += step) {
      const angle = (2 * Math.PI * k * n) / fftSize
      re += frame[n] * Math.cos(angle)
      im -= frame[n] * Math.sin(angle)
    }
    mag[k] = Math.sqrt(re*re + im*im)
  }
  return mag
}

// ── Pitch detection via autocorrelation (YIN-like) ───────────────────────────
function detectPitch(samples: Float32Array, sampleRate: number, startSample: number, windowSamples: number): number {
  const frame = samples.slice(startSample, startSample + windowSamples)
  if (frame.length < 128) return -1

  // Autocorrelation
  const minPeriod = Math.floor(sampleRate / 2000)  // 2000 Hz max
  const maxPeriod = Math.floor(sampleRate / 60)     // 60 Hz min
  let bestPeriod = -1
  let bestCorr = -1

  for (let lag = minPeriod; lag < Math.min(maxPeriod, frame.length / 2); lag++) {
    let corr = 0
    for (let i = 0; i < frame.length - lag; i++) {
      corr += frame[i] * frame[i + lag]
    }
    corr /= (frame.length - lag)
    if (corr > bestCorr) {
      bestCorr = corr
      bestPeriod = lag
    }
  }

  if (bestPeriod <= 0 || bestCorr < 0.1) return -1
  return sampleRate / bestPeriod
}

// Convert Hz to nearest MIDI note
function freqToMidi(freq: number): number {
  if (freq <= 0) return -1
  return Math.round(12 * Math.log2(freq / 440) + 69)
}

// ── Main conversion function ──────────────────────────────────────────────────
async function convertAudioToMidi(
  audioBuffer: AudioBuffer,
  bpm: number,
  sensitivity: number,
  minDuration: number,
  quantize: number,
): Promise<MidiNote[]> {
  const sampleRate = audioBuffer.sampleRate
  const samples = audioBuffer.getChannelData(0)

  // Detect onsets
  const onsetTimes = detectOnsets(samples, sampleRate, sensitivity)
  if (onsetTimes.length === 0) return []

  // For each onset, detect pitch
  const pitchWindow = Math.floor(sampleRate * 0.1)  // 100ms analysis window
  const notes: MidiNote[] = []
  let noteId = 0

  for (let i = 0; i < onsetTimes.length; i++) {
    const startSec = onsetTimes[i]
    const endSec = i + 1 < onsetTimes.length ? onsetTimes[i+1] : startSec + 0.5
    const dur = endSec - startSec

    if (dur < minDuration) continue

    const startSample = Math.floor(startSec * sampleRate)
    const freq = detectPitch(samples, sampleRate, startSample, pitchWindow)
    const midiNote = freq > 0 ? freqToMidi(freq) : 60  // default to middle C if no pitch
    if (midiNote < 21 || midiNote > 108) continue  // out of piano range

    // Convert to beats
    const secondsPerBeat = 60 / bpm
    let startBeat = startSec / secondsPerBeat
    let durationBeats = dur / secondsPerBeat

    // Quantize
    if (quantize > 0) {
      startBeat = Math.round(startBeat / quantize) * quantize
      durationBeats = Math.round(durationBeats / quantize) * quantize || quantize
    }

    // Estimate velocity from peak amplitude
    const frameEnd = Math.min(startSample + pitchWindow, samples.length)
    let peak = 0
    for (let s = startSample; s < frameEnd; s++) {
      if (Math.abs(samples[s]) > peak) peak = Math.abs(samples[s])
    }
    const velocity = Math.max(40, Math.min(127, Math.round(peak * 127 * 2)))

    notes.push({
      id: `a2m-${noteId++}`,
      pitch: midiNote,
      velocity,
      startBeat,
      durationBeats: Math.max(quantize || 0.25, durationBeats),
    })
  }

  return notes.sort((a,b) => a.startBeat - b.startBeat)
}

interface Props {
  isOpen: boolean
  onClose: () => void
  getAudioBuffer: (url: string) => AudioBuffer | undefined
}

export default function AudioToMidi({ isOpen, onClose, getAudioBuffer }: Props) {
  const store = useProjectStore()
  const [sensitivity, setSensitivity] = useState(0.3)
  const [minDuration, setMinDuration] = useState(0.05)
  const [quantize, setQuantize] = useState(0.25)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<MidiNote[] | null>(null)
  const [error, setError] = useState('')
  const [selectedClipId, setSelectedClipId] = useState<string>('')

  // Get all audio clips
  const audioClips: Array<{ clip: Clip; trackName: string }> = []
  store.tracks.forEach(track => {
    track.clips.forEach(clip => {
      if (clip.audioUrl) audioClips.push({ clip, trackName: track.name })
    })
  })

  const handleConvert = useCallback(async () => {
    setError('')
    setResult(null)
    if (!selectedClipId) { setError('Select an audio clip first.'); return }

    const found = audioClips.find(({ clip }) => clip.id === selectedClipId)
    if (!found) { setError('Clip not found.'); return }

    const buf = found.clip.audioUrl ? getAudioBuffer(found.clip.audioUrl) : undefined
    if (!buf) { setError('Audio buffer not loaded. Play the clip first to load it.'); return }

    setProcessing(true)
    try {
      // Run in a setTimeout to allow UI update
      await new Promise(resolve => setTimeout(resolve, 10))
      const notes = await convertAudioToMidi(buf, store.bpm, sensitivity, minDuration, quantize)
      setResult(notes)
      if (notes.length === 0) setError('No notes detected. Try lowering Sensitivity threshold.')
    } catch (e) {
      setError('Conversion failed: ' + (e as Error).message)
    } finally {
      setProcessing(false)
    }
  }, [selectedClipId, audioClips, getAudioBuffer, store.bpm, sensitivity, minDuration, quantize])

  const handleAddToTimeline = useCallback(() => {
    if (!result || result.length === 0) return
    // Add MIDI track with the notes
    store.addTrack('midi')
    const tracks = useProjectStore.getState().tracks
    const newTrack = tracks[tracks.length - 1]
    const durationBeats = Math.max(...result.map(n => n.startBeat + n.durationBeats))
    store.addClip({
      id: `a2m-clip-${Date.now()}`,
      trackId: newTrack.id,
      name: 'Audio→MIDI',
      type: 'midi' as const,
      startBeat: 0,
      durationBeats,
      gain: 1,
      midiNotes: result,
      color: '#22d3ee',
      fadeIn: 0,
      fadeOut: 0,
      fadeInCurve: 'linear' as const,
      fadeOutCurve: 'linear' as const,
      looped: false,
      muted: false,
      aiGenerated: false,
    })
    onClose()
  }, [result, store, onClose])

  if (!isOpen) return null

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:2200,
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => { if (e.target===e.currentTarget) onClose() }}>
      <div style={{
        background:'#111', border:'1px solid #2a2a3e', borderRadius:14,
        width:480, fontFamily:'system-ui,sans-serif', color:'#fff',
        boxShadow:'0 24px 80px rgba(0,0,0,0.9)',
      }}>
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 20px', borderBottom:'1px solid #1e1e2e',
          background:'linear-gradient(135deg,#002233,#111)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>🎵→🎹</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>Audio to MIDI</div>
              <div style={{ color:'#888', fontSize:10 }}>Onset detection + pitch analysis</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          {/* Clip selector */}
          <div>
            <label style={{ color:'#888', fontSize:10, textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:6 }}>
              Source Audio Clip
            </label>
            {audioClips.length === 0 ? (
              <div style={{ color:'#555', fontSize:11, padding:'8px 12px', background:'#0d0d1a', borderRadius:6, border:'1px solid #222' }}>
                No audio clips found. Import an audio file first.
              </div>
            ) : (
              <select value={selectedClipId} onChange={e => setSelectedClipId(e.target.value)} style={{
                width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid #333',
                background:'#0d0d1a', color:'#fff', fontSize:12,
              }}>
                <option value="">— Select clip —</option>
                {audioClips.map(({ clip, trackName }) => (
                  <option key={clip.id} value={clip.id}>
                    [{trackName}] {clip.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Parameters */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { label:'Sensitivity', sub:'Lower = more notes', val:sensitivity, min:0.05, max:1, step:0.05, set:setSensitivity, color:'#22d3ee' },
              { label:'Min Duration', sub:'Shortest note (sec)', val:minDuration, min:0.02, max:0.5, step:0.01, set:setMinDuration, color:'#10b981' },
            ].map(({ label, sub, val, min, max, step, set, color }) => (
              <div key={label} style={{ background:'#0d0d1a', borderRadius:8, padding:10 }}>
                <div style={{ color:'#aaa', fontSize:10, fontWeight:600, marginBottom:2 }}>{label}</div>
                <div style={{ color:'#555', fontSize:9, marginBottom:6 }}>{sub}</div>
                <input type="range" min={min} max={max} step={step} value={val}
                  onChange={e => set(Number(e.target.value))}
                  style={{ width:'100%', accentColor:color }} />
                <div style={{ color:color, fontSize:11, fontWeight:700, textAlign:'center' }}>{val.toFixed(2)}</div>
              </div>
            ))}
          </div>

          {/* Quantize */}
          <div>
            <div style={{ color:'#888', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
              Quantize Output
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {[{ l:'None', v:0 }, { l:'1/32', v:0.125 }, { l:'1/16', v:0.25 }, { l:'1/8', v:0.5 }, { l:'1/4', v:1 }].map(q => (
                <button key={q.v} onClick={() => setQuantize(q.v)} style={{
                  flex:1, padding:'5px 0', borderRadius:6, border:`1px solid ${quantize===q.v?'#22d3ee':'#222'}`,
                  background: quantize===q.v ? '#002233' : '#111',
                  color: quantize===q.v ? '#22d3ee' : '#666',
                  cursor:'pointer', fontSize:10, fontWeight:600,
                }}>{q.l}</button>
              ))}
            </div>
          </div>

          {/* Result preview */}
          {result && (
            <div style={{ background:'#0d1a0d', borderRadius:8, padding:10, border:'1px solid #10b98133' }}>
              <div style={{ color:'#10b981', fontSize:12, fontWeight:700, marginBottom:4 }}>
                ✓ {result.length} notes detected
              </div>
              <div style={{ color:'#888', fontSize:10, marginBottom:6 }}>
                Range: {result.length > 0 ? Math.min(...result.map(n=>n.pitch)) : '-'}–
                {result.length > 0 ? Math.max(...result.map(n=>n.pitch)) : '-'} MIDI
                &nbsp;|&nbsp;
                Duration: {result.length > 0 ? (result[result.length-1].startBeat + result[result.length-1].durationBeats).toFixed(1) : 0} beats
              </div>
              {/* Mini piano roll preview */}
              <div style={{ position:'relative', height:40, background:'#0a0f0a', borderRadius:4, overflow:'hidden' }}>
                {result.slice(0, 200).map((note,i) => {
                  const totalBeats = Math.max(...result.map(n=>n.startBeat+n.durationBeats)) || 1
                  const x = (note.startBeat / totalBeats) * 100
                  const w = Math.max(0.5, (note.durationBeats / totalBeats) * 100)
                  const y = ((127 - note.pitch) / 88) * 100
                  return (
                    <div key={i} style={{
                      position:'absolute', left:`${x}%`, top:`${y}%`,
                      width:`${w}%`, height:'8%', minHeight:2,
                      background:'#10b981', borderRadius:1, opacity:0.8,
                    }} />
                  )
                })}
              </div>
            </div>
          )}

          {error && (
            <div style={{ color:'#ef4444', fontSize:11, padding:'8px 12px', background:'#1a0000', borderRadius:6, border:'1px solid #ef444433' }}>
              ⚠ {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleConvert} disabled={processing} style={{
              flex:1, padding:'10px 0', borderRadius:8, border:'none',
              background: processing ? '#222' : 'linear-gradient(135deg,#004444,#22d3ee)',
              color: processing ? '#666' : '#fff',
              fontWeight:700, fontSize:13, cursor: processing ? 'default' : 'pointer',
            }}>
              {processing ? '⏳ Analyzing…' : '🎵 Convert to MIDI'}
            </button>
            {result && result.length > 0 && (
              <button onClick={handleAddToTimeline} style={{
                flex:1, padding:'10px 0', borderRadius:8, border:'none',
                background:'linear-gradient(135deg,#065f46,#10b981)',
                color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer',
              }}>
                ✚ Add to Timeline
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
