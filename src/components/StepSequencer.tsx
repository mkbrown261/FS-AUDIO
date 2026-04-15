/**
 * FS-AUDIO Step Sequencer
 * 16-64 step sequencer with per-step velocity, probability, swing, and pitch.
 * Outputs MIDI notes in real-time (via noteOn/noteOff) or as a MIDI clip.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useProjectStore, MidiNote } from '../store/projectStore'

export interface SeqStep {
  active: boolean
  velocity: number   // 0-127
  probability: number // 0-1
  pitch: number      // MIDI note
  accent: boolean
}

export interface SeqLane {
  id: string
  name: string
  color: string
  pitch: number
  steps: SeqStep[]
  muted: boolean
}

function makeStep(pitch: number): SeqStep {
  return { active: false, velocity: 100, probability: 1, pitch, accent: false }
}

function makeLane(name: string, color: string, pitch: number, numSteps: number): SeqLane {
  return {
    id: `lane-${Date.now()}-${Math.random()}`,
    name, color, pitch, muted: false,
    steps: Array.from({ length: numSteps }, () => makeStep(pitch)),
  }
}

const DEFAULT_LANES: Array<{ name: string; color: string; pitch: number }> = [
  { name: 'Kick',  color: '#ef4444', pitch: 36 },
  { name: 'Snare', color: '#3b82f6', pitch: 38 },
  { name: 'Clap',  color: '#8b5cf6', pitch: 39 },
  { name: 'HH-C',  color: '#10b981', pitch: 42 },
  { name: 'HH-O',  color: '#f59e0b', pitch: 46 },
  { name: 'Tom H', color: '#06b6d4', pitch: 50 },
  { name: 'Tom L', color: '#84cc16', pitch: 43 },
  { name: 'Ride',  color: '#ec4899', pitch: 51 },
]

interface Props {
  isOpen: boolean
  onClose: () => void
  onNoteOn?: (pitch: number, velocity: number) => void
  onNoteOff?: (pitch: number) => void
}

export default function StepSequencer({ isOpen, onClose, onNoteOn, onNoteOff }: Props) {
  const store = useProjectStore()
  const [numSteps, setNumSteps] = useState(16)
  const [lanes, setLanes] = useState<SeqLane[]>(() =>
    DEFAULT_LANES.map(d => makeLane(d.name, d.color, d.pitch, 16))
  )
  const [swing, setSwing] = useState(0)       // 0-1
  const [bpmMult, setBpmMult] = useState(1)   // step rate: 0.5=8th,1=16th,2=32nd
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [selectedLane, setSelectedLane] = useState(0)
  const intervalRef = useRef<number | null>(null)
  const stepRef = useRef(0)

  // Sync numSteps → lanes
  const handleSetNumSteps = useCallback((n: number) => {
    setNumSteps(n)
    setLanes(prev => prev.map(lane => {
      const steps = [...lane.steps]
      while (steps.length < n) steps.push(makeStep(lane.pitch))
      return { ...lane, steps: steps.slice(0, n) }
    }))
  }, [])

  // Toggle a step
  const toggleStep = useCallback((laneIdx: number, stepIdx: number) => {
    setLanes(prev => {
      const next = [...prev]
      const lane = { ...next[laneIdx], steps: [...next[laneIdx].steps] }
      const step = { ...lane.steps[stepIdx] }
      step.active = !step.active
      lane.steps[stepIdx] = step
      next[laneIdx] = lane
      return next
    })
  }, [])

  // Set step velocity
  const setStepVelocity = useCallback((laneIdx: number, stepIdx: number, vel: number) => {
    setLanes(prev => {
      const next = [...prev]
      const lane = { ...next[laneIdx], steps: [...next[laneIdx].steps] }
      lane.steps[stepIdx] = { ...lane.steps[stepIdx], velocity: vel }
      next[laneIdx] = lane
      return next
    })
  }, [])

  // Set step probability
  const setStepProb = useCallback((laneIdx: number, stepIdx: number, prob: number) => {
    setLanes(prev => {
      const next = [...prev]
      const lane = { ...next[laneIdx], steps: [...next[laneIdx].steps] }
      lane.steps[stepIdx] = { ...lane.steps[stepIdx], probability: prob }
      next[laneIdx] = lane
      return next
    })
  }, [])

  // Play engine
  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    const bpm = store.bpm * bpmMult
    // 16th note duration at given bpm
    const base = 60000 / bpm / 4

    const tick = () => {
      const step = stepRef.current
      setCurrentStep(step)

      lanes.forEach(lane => {
        if (lane.muted) return
        const s = lane.steps[step]
        if (!s || !s.active) return
        if (Math.random() > s.probability) return  // probability gate
        const vel = s.accent ? Math.min(127, s.velocity + 20) : s.velocity
        onNoteOn?.(lane.pitch, vel)
        setTimeout(() => onNoteOff?.(lane.pitch), base * 0.8)
      })

      stepRef.current = (step + 1) % numSteps
    }

    intervalRef.current = window.setInterval(tick, base)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, store.bpm, bpmMult, numSteps, lanes, onNoteOn, onNoteOff])

  const handleStop = () => {
    setPlaying(false)
    setCurrentStep(-1)
    stepRef.current = 0
  }

  // Export as MIDI clip
  const handleExportClip = useCallback(() => {
    const notes: MidiNote[] = []
    const stepBeats = 0.25 / bpmMult  // duration of one step in beats
    let noteId = 0
    lanes.forEach(lane => {
      if (lane.muted) return
      lane.steps.forEach((step, si) => {
        if (!step.active) return
        if (Math.random() > step.probability) return
        // Apply swing to odd steps
        const swingOffset = si % 2 === 1 ? swing * stepBeats * 0.33 : 0
        notes.push({
          id: `seq-${noteId++}`,
          pitch: lane.pitch,
          velocity: step.accent ? Math.min(127, step.velocity + 20) : step.velocity,
          startBeat: si * stepBeats + swingOffset,
          durationBeats: stepBeats * 0.85,
        })
      })
    })
    notes.sort((a,b) => a.startBeat - b.startBeat)

    // Find target track
    const target = store.tracks.find(t => t.type === 'midi') || store.tracks[0]
    if (!target) { alert('Add a MIDI track first.'); return }
    const startBeat = target.clips.length > 0
      ? Math.max(...target.clips.map(c => c.startBeat + c.durationBeats))
      : 0
    store.addClip({
      id: `seq-clip-${Date.now()}`,
      trackId: target.id,
      name: `Seq (${numSteps} steps)`,
      type: 'midi',
      startBeat,
      durationBeats: numSteps * stepBeats,
      gain: 1,
      midiNotes: notes,
      color: '#a855f7',
      fadeIn: 0,
      fadeOut: 0,
      looping: false,
    })
    onClose()
  }, [lanes, numSteps, bpmMult, swing, store, onClose])

  // Clear all active steps in current lane
  const clearLane = useCallback((laneIdx: number) => {
    setLanes(prev => {
      const next = [...prev]
      next[laneIdx] = { ...next[laneIdx], steps: next[laneIdx].steps.map(s => ({ ...s, active: false })) }
      return next
    })
  }, [])

  // Fill every Nth step
  const fillEvery = useCallback((laneIdx: number, n: number) => {
    setLanes(prev => {
      const next = [...prev]
      const lane = { ...next[laneIdx], steps: next[laneIdx].steps.map((s,i) => ({ ...s, active: i%n===0 })) }
      next[laneIdx] = lane
      return next
    })
  }, [])

  if (!isOpen) return null

  const lane = lanes[selectedLane]
  const colW = Math.max(20, Math.min(38, Math.floor(560 / numSteps)))

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:2100,
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => { if (e.target===e.currentTarget) onClose() }}>
      <div style={{
        background:'#111', border:'1px solid #2a2a3e', borderRadius:14,
        width:640, maxHeight:'88vh', overflowY:'auto',
        boxShadow:'0 24px 80px rgba(0,0,0,0.9)',
        fontFamily:'system-ui,sans-serif', color:'#fff',
      }}>
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 20px', borderBottom:'1px solid #1e1e2e',
          background:'linear-gradient(135deg,#0a002a,#111)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>🎛</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>Step Sequencer</div>
              <div style={{ color:'#888', fontSize:10 }}>FS-Step — Real-time + MIDI export</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={() => setPlaying(!playing)} style={{
              padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer',
              background: playing ? '#10b981' : '#222', color:'#fff', fontWeight:700, fontSize:12,
            }}>
              {playing ? '⏹ Stop' : '▶ Play'}
            </button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:18 }}>✕</button>
          </div>
        </div>

        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
          {/* Transport controls */}
          <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color:'#888', fontSize:10 }}>STEPS</span>
              {[8,16,32,64].map(n => (
                <button key={n} onClick={() => handleSetNumSteps(n)} style={{
                  padding:'3px 8px', borderRadius:6, border:`1px solid ${numSteps===n?'#a855f7':'#333'}`,
                  background: numSteps===n ? '#1a003a' : '#111', color: numSteps===n?'#a855f7':'#666',
                  cursor:'pointer', fontSize:11, fontWeight:600,
                }}>{n}</button>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color:'#888', fontSize:10 }}>RATE</span>
              {[{ l:'8th', v:0.5 }, { l:'16th', v:1 }, { l:'32nd', v:2 }].map(r => (
                <button key={r.v} onClick={() => setBpmMult(r.v)} style={{
                  padding:'3px 8px', borderRadius:6, border:`1px solid ${bpmMult===r.v?'#a855f7':'#333'}`,
                  background: bpmMult===r.v ? '#1a003a' : '#111', color: bpmMult===r.v?'#a855f7':'#666',
                  cursor:'pointer', fontSize:11, fontWeight:600,
                }}>{r.l}</button>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color:'#888', fontSize:10 }}>SWING</span>
              <input type="range" min={0} max={1} step={0.01} value={swing}
                onChange={e => setSwing(Number(e.target.value))}
                style={{ width:70, accentColor:'#a855f7' }} />
              <span style={{ color:'#a855f7', fontSize:10, width:28 }}>{Math.round(swing*100)}%</span>
            </div>
          </div>

          {/* Lane list + step grid */}
          <div style={{ overflowX:'auto' }}>
            <div style={{ minWidth: 80 + numSteps * colW }}>
              {lanes.map((ln, li) => (
                <div key={ln.id} style={{
                  display:'flex', alignItems:'center', gap:6,
                  marginBottom:4,
                  background: li===selectedLane ? '#1a1a2e' : 'transparent',
                  borderRadius:6, padding:'2px 4px',
                }}>
                  {/* Lane header */}
                  <div style={{ width:60, display:'flex', flexDirection:'column', gap:2, flexShrink:0 }}>
                    <button onClick={() => setSelectedLane(li)} style={{
                      fontSize:10, fontWeight:700, color: ln.muted ? '#444' : ln.color,
                      background:'none', border:'none', cursor:'pointer', textAlign:'left',
                      padding:0, textDecoration: ln.muted ? 'line-through' : 'none',
                    }}>{ln.name}</button>
                    <button onClick={() => setLanes(prev => {
                      const n=[...prev]; n[li]={...n[li],muted:!n[li].muted}; return n
                    })} style={{
                      fontSize:8, padding:'1px 4px', borderRadius:3, border:'none',
                      background: ln.muted ? '#333' : '#222', color: ln.muted ? '#666' : '#aaa',
                      cursor:'pointer',
                    }}>{ln.muted ? 'MUTED' : 'MUTE'}</button>
                  </div>

                  {/* Steps */}
                  <div style={{ display:'flex', gap:2 }}>
                    {ln.steps.map((step, si) => {
                      const isBar = si % 4 === 0
                      const isCurrent = si === currentStep && playing
                      return (
                        <button
                          key={si}
                          onClick={() => toggleStep(li, si)}
                          onContextMenu={e => {
                            e.preventDefault()
                            if (step.active) {
                              const vel = parseInt(prompt('Velocity (0-127):', String(step.velocity)) || String(step.velocity))
                              if (!isNaN(vel)) setStepVelocity(li, si, Math.max(0,Math.min(127,vel)))
                            }
                          }}
                          title={`Step ${si+1} | vel:${step.velocity} | prob:${Math.round(step.probability*100)}%`}
                          style={{
                            width: colW, height:24, borderRadius:3, border:'none', cursor:'pointer',
                            borderLeft: isBar ? `2px solid ${ln.color}44` : undefined,
                            background: step.active
                              ? isCurrent ? '#fff'
                                : step.accent ? ln.color
                                : ln.color + 'cc'
                              : isCurrent ? '#333'
                              : si % 4 === 0 ? '#1a1a1a'
                              : '#111',
                            opacity: step.active ? (step.probability < 1 ? 0.6 + step.probability * 0.4 : 1) : 0.7,
                            boxShadow: isCurrent && step.active ? `0 0 8px ${ln.color}` : undefined,
                            transition:'background 0.05s',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected lane controls */}
          {lane && (
            <div style={{
              background:'#0d0d1a', borderRadius:8, padding:12,
              border:`1px solid ${lane.color}33`,
            }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ color:lane.color, fontWeight:700, fontSize:12 }}>
                  ✎ {lane.name} — Step Editor
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => clearLane(selectedLane)} style={{
                    padding:'3px 8px', borderRadius:5, border:'1px solid #333',
                    background:'#111', color:'#888', cursor:'pointer', fontSize:10,
                  }}>Clear</button>
                  {[2,4,8].map(n => (
                    <button key={n} onClick={() => fillEvery(selectedLane, n)} style={{
                      padding:'3px 8px', borderRadius:5, border:'1px solid #333',
                      background:'#111', color:'#888', cursor:'pointer', fontSize:10,
                    }}>÷{n}</button>
                  ))}
                </div>
              </div>

              {/* Per-step velocity bars */}
              <div style={{ display:'flex', gap:2, alignItems:'flex-end', height:40, marginBottom:6 }}>
                {lane.steps.slice(0,Math.min(numSteps,32)).map((step, si) => (
                  <div key={si} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:1, cursor:'ns-resize' }}
                    onMouseDown={e => {
                      if (!step.active) return
                      const startY = e.clientY, startVel = step.velocity
                      const onMove = (me: MouseEvent) => {
                        const dy = startY - me.clientY
                        setStepVelocity(selectedLane, si, Math.max(1, Math.min(127, startVel + dy)))
                      }
                      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                      window.addEventListener('mousemove', onMove)
                      window.addEventListener('mouseup', onUp)
                    }}>
                    <div style={{
                      width:'100%', background: step.active ? lane.color : '#222', borderRadius:2,
                      height: step.active ? `${(step.velocity/127)*100}%` : 4,
                      minHeight:2, opacity: step.active ? 1 : 0.3,
                    }} />
                  </div>
                ))}
              </div>
              <div style={{ color:'#555', fontSize:9, textAlign:'center' }}>Drag velocity bars ↕ to adjust</div>

              {/* Pitch control */}
              <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ color:'#888', fontSize:10 }}>Note:</span>
                <input type="number" min={0} max={127} value={lane.pitch}
                  onChange={e => setLanes(prev => {
                    const n=[...prev]; n[selectedLane]={...n[selectedLane],pitch:Number(e.target.value)}; return n
                  })}
                  style={{ width:50, background:'#111', border:'1px solid #333', borderRadius:5, color:'#fff', padding:'2px 6px', fontSize:11 }} />
                <span style={{ color:'#555', fontSize:10 }}>
                  ({['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][lane.pitch%12]}{Math.floor(lane.pitch/12)-1})
                </span>
              </div>
            </div>
          )}

          {/* Export */}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleExportClip} style={{
              flex:1, padding:'10px 0', borderRadius:8, border:'none',
              background:'linear-gradient(135deg,#3b0082,#a855f7)',
              color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer',
            }}>✚ Export as MIDI Clip</button>
          </div>
        </div>
      </div>
    </div>
  )
}
