import React, { useCallback, useRef, useState } from 'react'
import { useProjectStore, EditTool } from '../store/projectStore'
import { CustomSelect } from './CustomSelect'

interface ToolbarProps {
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onToStart: () => void
  onRecord: () => void
  onExport?: () => void
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
const KEY_OPTIONS = KEYS.map(k => ({ value: k, label: k }))
const SNAP_OPTIONS = SNAP_VALUES.map(v => ({ value: v, label: v === 'off' ? 'Free' : v }))

// Tool definitions
interface ToolDef {
  id: EditTool
  icon: React.ReactNode
  label: string
  shortcut: string
}

const TOOLS: ToolDef[] = [
  {
    id: 'pointer',
    label: 'Pointer (V)',
    shortcut: 'V',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12">
        <polygon points="1,1 1,10 4,7.5 5.5,11 7,10.5 5.5,6.5 9,6.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'marquee',
    label: 'Marquee / Selection (Q)',
    shortcut: 'Q',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12">
        <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2,1.5" />
      </svg>
    ),
  },
  {
    id: 'scissors',
    label: 'Scissors / Cut (C)',
    shortcut: 'C',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13">
        <circle cx="3" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <circle cx="3" cy="9" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <line x1="4.7" y1="5.3" x2="12" y2="1" stroke="currentColor" strokeWidth="1.2" />
        <line x1="4.7" y1="7.7" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    id: 'fade',
    label: 'Fade Tool (F)',
    shortcut: 'F',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13">
        <polygon points="1,13 1,1 13,13" fill="currentColor" opacity="0.6" />
        <line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'glue',
    label: 'Glue / Join (G)',
    shortcut: 'G',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13">
        <rect x="1" y="4" width="4" height="5" rx="1" fill="currentColor" opacity="0.7" />
        <rect x="8" y="4" width="4" height="5" rx="1" fill="currentColor" opacity="0.7" />
        <line x1="5" y1="6.5" x2="8" y2="6.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'mute',
    label: 'Mute Tool (U)',
    shortcut: 'U',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13">
        <polygon points="1,4 4,4 7,1 7,12 4,9 1,9" fill="currentColor" opacity="0.7" />
        <line x1="9" y1="4" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" />
        <line x1="13" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'zoom',
    label: 'Zoom Tool (Z)',
    shortcut: 'Z',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13">
        <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <line x1="8.5" y1="8.5" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
        <line x1="3.5" y1="5.5" x2="7.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="5.5" y1="3.5" x2="5.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
]

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

export function Toolbar({ onPlay, onPause, onStop, onToStart, onRecord, onExport }: ToolbarProps) {
  const {
    bpm, setBpm, key, setKey,
    isPlaying, isRecording, isLooping, metronomeEnabled,
    currentTime, timeSignature, setTimeSignature, aiLevel, setAiLevel,
    toggleLoop, toggleMetronome, showClawbot, setShowClawbot,
    setZoom, zoom, countIn, snapEnabled, snapValue,
    setSnapEnabled, setSnapValue, inspectorOpen, setInspectorOpen,
    tracks, activeTool, setActiveTool,
  } = useProjectStore()

  const bpmRef = useRef<HTMLInputElement>(null)
  const currentBeat = currentTime * (bpm / 60)

  // ── Tap tempo ─────────────────────────────────────────────────────────────
  const tapTimestampsRef = useRef<number[]>([])
  const tapResetTimerRef = useRef<number | null>(null)
  const [tapActive, setTapActive] = useState(false)

  const handleTapTempo = useCallback(() => {
    const now = performance.now()
    const taps = tapTimestampsRef.current
    if (taps.length > 0 && now - taps[taps.length - 1] > 3000) tapTimestampsRef.current = []
    tapTimestampsRef.current = [...tapTimestampsRef.current, now].slice(-8)
    setTapActive(true)
    if (tapResetTimerRef.current !== null) window.clearTimeout(tapResetTimerRef.current)
    tapResetTimerRef.current = window.setTimeout(() => setTapActive(false), 3100)
    const ts = tapTimestampsRef.current
    if (ts.length >= 2) {
      let total = 0
      for (let i = 1; i < ts.length; i++) total += ts[i] - ts[i - 1]
      const tapBpm = Math.round((60000 / (total / (ts.length - 1))) * 10) / 10
      if (tapBpm >= 20 && tapBpm <= 300) setBpm(tapBpm)
    }
  }, [setBpm])

  const handleBpmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    if (!isNaN(v)) setBpm(v)
  }, [setBpm])

  const handleBpmWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setBpm(Math.round((bpm + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10)
  }, [bpm, setBpm])

  const aiLabel = aiLevel === 0 ? 'Manual' : aiLevel === 100 ? 'Full AI' : `AI ${aiLevel}%`
  const anyArmed = tracks.some(t => t.armed)

  return (
    <div className="toolbar">
      {/* Brand */}
      <div className="toolbar-brand">
        <img
          src="/assets/fs-icon.png" alt="FS Audio" className="brand-icon"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <span className="brand-name">FLOWSTATE</span>
      </div>

      <div className="toolbar-sep" />

      {/* ── Tool Palette ─────────────────────────────────────────────────── */}
      <div className="tool-palette" role="toolbar" aria-label="Edit Tools">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            className={`tbt tool-btn ${activeTool === tool.id ? 'active tool-active' : ''}`}
            title={tool.label}
            onClick={() => setActiveTool(tool.id)}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      {/* Transport */}
      <div className="transport">
        <button className="tbt" onClick={onToStart} title="Return to Start (Enter)">
          <svg width="11" height="11" viewBox="0 0 11 11"><rect x="0" y="0" width="2" height="11" fill="currentColor"/><polygon points="11,0 2,5.5 11,11" fill="currentColor"/></svg>
        </button>
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
        <button className="tbt" onClick={onStop} title="Stop (Space / Enter)">
          <svg width="11" height="11" viewBox="0 0 11 11"><rect x="0" y="0" width="11" height="11" fill="currentColor"/></svg>
        </button>
        <button
          className={`tbt tbt-rec ${isRecording ? 'rec-active' : ''} ${anyArmed && !isRecording ? 'armed-ready' : ''}`}
          onClick={onRecord}
          title="Record (R)"
        >
          <svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="5" fill="currentColor"/></svg>
        </button>
        <button className={`tbt ${isLooping ? 'active' : ''}`} onClick={toggleLoop} title="Loop (L)">
          <svg width="13" height="11" viewBox="0 0 13 11"><path d="M1 4 Q1 1 4 1 L9 1 L9 0 L12 2.5 L9 5 L9 4 L4 4 Q3 4 3 5 L3 7 Q3 9 4 9 L10 9 Q12 9 12 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
        </button>
        <button className={`tbt ${metronomeEnabled ? 'active' : ''}`} onClick={toggleMetronome} title="Metronome (K)">
          <svg width="9" height="13" viewBox="0 0 9 13"><polygon points="4.5,0 9,13 0,13" stroke="currentColor" strokeWidth="1" fill="none"/><line x1="4.5" y1="13" x2="7" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <button
          className={`tbt tbt-tap ${tapActive ? 'tapped' : ''}`}
          onClick={handleTapTempo}
          title="Tap Tempo"
        >TAP</button>
      </div>

      {/* LCD */}
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
        <div className="bpm-lcd">
          <input
            ref={bpmRef} className="bpm-input" type="number" min={20} max={300} step={0.1}
            value={bpm.toFixed(1)} onChange={handleBpmChange} onWheel={handleBpmWheel}
            title="BPM (scroll to fine-tune)"
          />
          <span className="bpm-lcd-label">bpm</span>
        </div>
      </div>

      {/* Key */}
      <div className="key-wrap">
        <label className="param-label">Key</label>
        <CustomSelect value={key} options={KEY_OPTIONS} onChange={setKey} width={110} />
      </div>

      {/* Time sig — click numerator or denominator to change */}
      <div className="ts-wrap" title="Click numerator/denominator to change time signature">
        <label className="param-label">Time</label>
        <div className="ts-editor">
          <button
            className="ts-part ts-num"
            title="Click to set beats per bar"
            onClick={() => {
              const v = prompt('Beats per bar (1–16):', String(timeSignature[0]))
              if (!v) return
              const n = parseInt(v)
              if (n >= 1 && n <= 16) setTimeSignature(n, timeSignature[1])
            }}
          >{timeSignature[0]}</button>
          <span className="ts-divider">/</span>
          <button
            className="ts-part ts-den"
            title="Click to set note value (2, 4, 8, 16)"
            onClick={() => {
              const v = prompt('Note value (2, 4, 8, 16):', String(timeSignature[1]))
              if (!v) return
              const n = parseInt(v)
              if ([2,4,8,16].includes(n)) setTimeSignature(timeSignature[0], n)
              else alert('Note value must be 2, 4, 8, or 16.')
            }}
          >{timeSignature[1]}</button>
        </div>
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
        <CustomSelect value={snapValue} options={SNAP_OPTIONS} onChange={setSnapValue} disabled={!snapEnabled} width={70} />
      </div>

      {/* Zoom */}
      <div className="zoom-wrap">
        <label className="param-label">Zoom</label>
        <button className="tbt" onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} title="Zoom Out (−)">−</button>
        <span className="param-label" style={{ minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="tbt" onClick={() => setZoom(Math.min(6, zoom + 0.25))} title="Zoom In (+)">+</button>
      </div>

      <div className="toolbar-sep" />

      {/* AI Slider */}
      <div className="ai-slider-wrap">
        <span className="param-label">Manual</span>
        <input type="range" min={0} max={100} value={aiLevel} className="ai-slider"
          onChange={e => setAiLevel(parseInt(e.target.value))} title="AI Involvement"
        />
        <span className="param-label">AI</span>
        <span className="ai-badge">{aiLabel}</span>
      </div>

      <div className="toolbar-sep" />

      {/* Inspector */}
      <button className={`tbt ${inspectorOpen ? 'active' : ''}`} onClick={() => setInspectorOpen(!inspectorOpen)} title="Inspector (I)">
        <svg width="11" height="11" viewBox="0 0 11 11"><rect x="0" y="0" width="4" height="11" fill="currentColor" rx="1"/><rect x="6" y="0" width="5" height="2" fill="currentColor" rx="1"/><rect x="6" y="4" width="5" height="2" fill="currentColor" rx="1"/><rect x="6" y="8" width="3" height="2" fill="currentColor" rx="1"/></svg>
      </button>

      {/* Export */}
      <button className="tbt tbt-export" onClick={onExport} title="Export / Bounce to WAV (⌘E)">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 1v6M3 5l2.5 2.5L8 5M1 9.5h9"/>
        </svg>
      </button>

      {/* Clawbot */}
      <button
        className={`tbt tbt-clawbot clawbot-toggle ${showClawbot ? 'active' : ''}`}
        onClick={() => setShowClawbot(!showClawbot)}
        title="Clawbot AI Panel (B)"
      >
        <img
          src="/assets/clawbot-mascot.png" alt="Clawbot" className="mascot-sm"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </button>
    </div>
  )
}
