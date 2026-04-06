import React, { useCallback, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'

interface ToolbarProps {
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onToStart: () => void
  onRecord: () => void
}

const KEYS = [
  'C major','C minor','C# major','C# minor',
  'D major','D minor','Eb major','Eb minor',
  'E major','E minor','F major','F minor',
  'F# major','F# minor','G major','G minor',
  'Ab major','Ab minor','A major','A minor',
  'Bb major','Bb minor','B major','B minor',
]

const SNAP_VALUES = ['off','1','1/2','1/4','1/8','1/16','1/32']

function beatsToSMPTE(beat: number, bpm: number, ts: [number,number]): string {
  const beatsPerBar = ts[0]
  const bar = Math.floor(beat / beatsPerBar) + 1
  const beatInBar = Math.floor(beat % beatsPerBar) + 1
  const subBeat = Math.floor((beat % 1) * 240)
  return `${String(bar).padStart(3,' ')} : ${beatInBar} : ${String(subBeat).padStart(3,'0')}`
}

function secToTime(sec: number): string {
  const m  = Math.floor(sec / 60)
  const s  = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 1000)
  return `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`
}

export function Toolbar({ onPlay, onPause, onStop, onToStart, onRecord }: ToolbarProps) {
  const {
    bpm, setBpm, key, setKey,
    isPlaying, isRecording, isLooping, metronomeEnabled,
    currentTime, timeSignature, aiLevel, setAiLevel,
    toggleLoop, toggleMetronome, showClawbot, setShowClawbot,
    setZoom, zoom, countIn, snapEnabled, snapValue,
    setSnapEnabled, setSnapValue, inspectorOpen, setInspectorOpen,
  } = useProjectStore()

  const bpmRef = useRef<HTMLInputElement>(null)
  const currentBeat = currentTime * (bpm / 60)

  const handleBpmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    if (!isNaN(v)) setBpm(v)
  }, [setBpm])

  const handleBpmWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setBpm(Math.round((bpm + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10)
  }, [bpm, setBpm])

  const aiLabel = aiLevel === 0 ? 'Manual' : aiLevel === 100 ? 'Full AI' : `AI ${aiLevel}%`

  return (
    <div className="toolbar">
      {/* Brand */}
      <div className="toolbar-brand">
        <img src="/assets/fs-icon.png" alt="FS Audio" className="brand-icon" />
        <span className="brand-name">FLOWSTATE</span>
      </div>

      <div className="toolbar-sep" />

      {/* Transport */}
      <div className="transport">
        {/* Go to Start — stops playback and returns playhead to 0 */}
        <button className="tbt" onClick={onToStart} title="Return to Start">
          <svg width="11" height="11" viewBox="0 0 11 11"><rect x="0" y="0" width="2" height="11" fill="currentColor"/><polygon points="11,0 2,5.5 11,11" fill="currentColor"/></svg>
        </button>
        {/* Play / Pause toggle */}
        <button
          className={`tbt tbt-play ${isPlaying ? 'active' : ''}`}
          onClick={isPlaying ? onPause : onPlay}
          title="Play / Pause (Space)"
        >
          {isPlaying
            ? <svg width="11" height="11" viewBox="0 0 11 11"><rect x="0" y="0" width="4" height="11" fill="currentColor"/><rect x="7" y="0" width="4" height="11" fill="currentColor"/></svg>
            : <svg width="11" height="13" viewBox="0 0 11 13"><polygon points="0,0 11,6.5 0,13" fill="currentColor"/></svg>
          }
        </button>
        {/* Stop — ends playback (keeps playhead position) */}
        <button className="tbt" onClick={onStop} title="Stop">
          <svg width="11" height="11" viewBox="0 0 11 11"><rect x="0" y="0" width="11" height="11" fill="currentColor"/></svg>
        </button>
        <button
          className={`tbt tbt-rec ${isRecording ? 'rec-active' : ''}`}
          onClick={onRecord}
          title="Record (R)"
        >
          <svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="5" fill="currentColor"/></svg>
        </button>
        <button
          className={`tbt ${isLooping ? 'active' : ''}`}
          onClick={toggleLoop}
          title="Loop (L)"
        >
          <svg width="13" height="11" viewBox="0 0 13 11"><path d="M1 4 Q1 1 4 1 L9 1 L9 0 L12 2.5 L9 5 L9 4 L4 4 Q3 4 3 5 L3 7 Q3 9 4 9 L10 9 Q12 9 12 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
        </button>
        <button
          className={`tbt ${metronomeEnabled ? 'active' : ''}`}
          onClick={toggleMetronome}
          title="Metronome (K)"
        >
          <svg width="9" height="13" viewBox="0 0 9 13"><polygon points="4.5,0 9,13 0,13" stroke="currentColor" strokeWidth="1" fill="none"/><line x1="4.5" y1="13" x2="7" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* LCD — count-in overlay or normal time */}
      <div className="lcd-display">
        {countIn > 0 ? (
          <>
            <div className="lcd-time lcd-countdown">{countIn}</div>
            <div className="lcd-bars lcd-countdown-label">COUNT IN</div>
          </>
        ) : (
          <>
            <div className="lcd-time">{secToTime(currentTime)}</div>
            <div className="lcd-bars">{beatsToSMPTE(currentBeat, bpm, timeSignature)}</div>
          </>
        )}
      </div>

      <div className="toolbar-sep" />

      {/* BPM */}
      <div className="bpm-wrap">
        <label className="param-label">BPM</label>
        <input
          ref={bpmRef}
          className="bpm-input"
          type="number"
          min={20} max={300} step={0.1}
          value={bpm.toFixed(1)}
          onChange={handleBpmChange}
          onWheel={handleBpmWheel}
          title="BPM (scroll to fine-tune)"
        />
      </div>

      {/* Key */}
      <div className="key-wrap">
        <label className="param-label">Key</label>
        <select className="key-select" value={key} onChange={e => setKey(e.target.value)}>
          {KEYS.map(k => <option key={k}>{k}</option>)}
        </select>
      </div>

      {/* Time sig */}
      <div className="ts-wrap">
        <label className="param-label">Time</label>
        <span className="ts-val">{timeSignature[0]}/{timeSignature[1]}</span>
      </div>

      <div className="toolbar-sep" />

      {/* Snap */}
      <div className="snap-wrap">
        <button
          className={`tbt snap-btn ${snapEnabled ? 'active' : ''}`}
          onClick={() => setSnapEnabled(!snapEnabled)}
          title="Snap to grid"
        >
          <svg width="11" height="11" viewBox="0 0 11 11">
            <circle cx="5.5" cy="5.5" r="2" fill="currentColor"/>
            <line x1="5.5" y1="0" x2="5.5" y2="2.5" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="5.5" y1="8.5" x2="5.5" y2="11" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="0" y1="5.5" x2="2.5" y2="5.5" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="8.5" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>
        <select
          className="key-select snap-select"
          value={snapValue}
          onChange={e => setSnapValue(e.target.value)}
          disabled={!snapEnabled}
          title="Snap value"
          style={{ opacity: snapEnabled ? 1 : 0.4 }}
        >
          {SNAP_VALUES.map(v => <option key={v} value={v}>{v === 'off' ? 'No Snap' : v}</option>)}
        </select>
      </div>

      {/* Zoom */}
      <div className="zoom-wrap">
        <label className="param-label">Zoom</label>
        <button className="tbt" onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} title="Zoom Out (Cmd+-)">−</button>
        <span className="param-label" style={{ minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="tbt" onClick={() => setZoom(Math.min(6, zoom + 0.25))} title="Zoom In (Cmd++)">+</button>
      </div>

      <div className="toolbar-sep" />

      {/* AI Slider */}
      <div className="ai-slider-wrap">
        <span className="param-label">Manual</span>
        <input
          type="range" min={0} max={100} value={aiLevel}
          className="ai-slider"
          onChange={e => setAiLevel(parseInt(e.target.value))}
          title="AI Involvement"
        />
        <span className="param-label">AI</span>
        <span className="ai-badge">{aiLabel}</span>
      </div>

      <div className="toolbar-sep" />

      {/* Inspector toggle */}
      <button
        className={`tbt ${inspectorOpen ? 'active' : ''}`}
        onClick={() => setInspectorOpen(!inspectorOpen)}
        title="Inspector (I)"
      >
        <svg width="11" height="11" viewBox="0 0 11 11"><rect x="0" y="0" width="4" height="11" fill="currentColor" rx="1"/><rect x="6" y="0" width="5" height="2" fill="currentColor" rx="1"/><rect x="6" y="4" width="5" height="2" fill="currentColor" rx="1"/><rect x="6" y="8" width="3" height="2" fill="currentColor" rx="1"/></svg>
      </button>

      {/* Clawbot toggle */}
      <button
        className={`tbt tbt-clawbot clawbot-toggle ${showClawbot ? 'active' : ''}`}
        onClick={() => setShowClawbot(!showClawbot)}
        title="Clawbot AI Panel"
      >
        <img src="/assets/clawbot-mascot.png" alt="Clawbot" className="mascot-sm" />
      </button>
    </div>
  )
}
