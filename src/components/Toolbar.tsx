import React, { useCallback, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'

interface ToolbarProps {
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onRecord: () => void
}

const KEYS = ['C major','C minor','D major','D minor','E major','E minor','F major','F minor','G major','G minor','A major','A minor','B major','B minor']

function timeToSMPTE(sec: number, bpm: number): string {
  const bars = Math.floor((sec * bpm / 60) / 4) + 1
  const beat = Math.floor((sec * bpm / 60) % 4) + 1
  const sub  = Math.floor(((sec * bpm / 60) % 1) * 240)
  return `${String(bars).padStart(3,' ')} : ${beat} : ${String(sub).padStart(3,'0')}`
}

function secToTime(sec: number): string {
  const m  = Math.floor(sec / 60)
  const s  = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 1000)
  return `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`
}

export function Toolbar({ onPlay, onPause, onStop, onRecord }: ToolbarProps) {
  const {
    bpm, setBpm, key, setKey,
    isPlaying, isRecording, isLooping, metronomeEnabled,
    currentTime, timeSignature, aiLevel, setAiLevel,
    toggleLoop, toggleMetronome, showClawbot, setShowClawbot,
    setZoom, zoom,
  } = useProjectStore()

  const bpmRef = useRef<HTMLInputElement>(null)

  const handleBpmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value)
    if (!isNaN(v)) setBpm(v)
  }, [setBpm])

  const handleBpmWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setBpm(bpm + (e.deltaY < 0 ? 1 : -1))
  }, [bpm, setBpm])

  const aiLabel = aiLevel === 0 ? 'Manual' : aiLevel === 100 ? 'Full AI' : `AI ${aiLevel}%`

  return (
    <div className="toolbar">
      {/* Brand */}
      <div className="toolbar-brand">
        <span className="brand-icon">🎵</span>
        <span className="brand-name">Flowstate Audio</span>
      </div>

      {/* Transport */}
      <div className="transport">
        <button className="tbt" onClick={() => { onStop(); }} title="Go to Start (Return)">⏮</button>
        <button
          className={`tbt tbt-play ${isPlaying ? 'active' : ''}`}
          onClick={isPlaying ? onPause : onPlay}
          title="Play / Pause (Space)"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="tbt" onClick={onStop} title="Stop">⏹</button>
        <button
          className={`tbt tbt-rec ${isRecording ? 'rec-active' : ''}`}
          onClick={onRecord}
          title="Record (⌘R)"
        >
          ⏺
        </button>
        <button
          className={`tbt ${isLooping ? 'active' : ''}`}
          onClick={toggleLoop}
          title="Loop (L)"
        >
          🔁
        </button>
        <button
          className={`tbt ${metronomeEnabled ? 'active' : ''}`}
          onClick={toggleMetronome}
          title="Metronome (K)"
        >
          🥁
        </button>
      </div>

      {/* LCD Time Display */}
      <div className="lcd-display">
        <div className="lcd-time">{secToTime(currentTime)}</div>
        <div className="lcd-bars">{timeToSMPTE(currentTime, bpm)}</div>
      </div>

      {/* BPM */}
      <div className="bpm-wrap">
        <label className="param-label">BPM</label>
        <input
          ref={bpmRef}
          className="bpm-input"
          type="number"
          min={20} max={300}
          value={bpm}
          onChange={handleBpmChange}
          onWheel={handleBpmWheel}
          title="BPM (scroll to adjust)"
        />
      </div>

      {/* Key */}
      <div className="key-wrap">
        <label className="param-label">Key</label>
        <select className="key-select" value={key} onChange={e => setKey(e.target.value)}>
          {KEYS.map(k => <option key={k}>{k}</option>)}
        </select>
      </div>

      {/* Time signature */}
      <div className="ts-wrap">
        <label className="param-label">Time</label>
        <span className="ts-val">{timeSignature[0]}/{timeSignature[1]}</span>
      </div>

      {/* Zoom */}
      <div className="zoom-wrap">
        <button className="tbt" onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} title="Zoom Out">－</button>
        <span className="param-label" style={{ minWidth: 32, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="tbt" onClick={() => setZoom(Math.min(4, zoom + 0.25))} title="Zoom In">＋</button>
      </div>

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

      {/* Clawbot toggle */}
      <button
        className={`tbt clawbot-toggle ${showClawbot ? 'active' : ''}`}
        onClick={() => setShowClawbot(!showClawbot)}
        title="Toggle Clawbot Panel"
      >
        🦾
      </button>
    </div>
  )
}
