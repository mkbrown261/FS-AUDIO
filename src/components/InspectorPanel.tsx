import React, { useCallback, useState } from 'react'
import { useProjectStore, Track, Plugin } from '../store/projectStore'

function volToDb(v: number): string {
  if (v <= 0.001) return '-∞ dB'
  const db = 20 * Math.log10(v)
  return (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB'
}

function panToStr(pan: number): string {
  if (Math.abs(pan) < 0.01) return 'Center'
  const pct = Math.round(Math.abs(pan) * 100)
  return pan < 0 ? `L ${pct}` : `R ${pct}`
}

function KnobControl({
  label, value, min, max, step = 0.1, unit = '',
  onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const startRef = React.useRef<{ y: number; val: number } | null>(null)
  const pct = (value - min) / (max - min)
  const angle = -140 + pct * 280

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    startRef.current = { y: e.clientY, val: value }
    setDragging(true)
    const mv = (me: MouseEvent) => {
      if (!startRef.current) return
      const dy = startRef.current.y - me.clientY
      const range = max - min
      const delta = (dy / 150) * range
      const next = Math.max(min, Math.min(max, startRef.current.val + delta))
      onChange(Math.round(next / step) * step)
    }
    const up = () => { setDragging(false); startRef.current = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  const handleDblClick = () => {
    const v = prompt(`${label} (${min}–${max}${unit ? ' '+unit : ''})`, value.toString())
    if (v !== null) { const n = parseFloat(v); if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n))) }
  }

  return (
    <div className="knob-wrap" title={`${label}: ${value.toFixed(1)}${unit}`}>
      <div
        className={`knob ${dragging ? 'knob-dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDblClick}
        style={{ cursor: 'ns-resize' }}
      >
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="#16213e" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
          <circle cx="18" cy="18" r="10" fill="#1a1a2e" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
          {/* Track arc */}
          <circle cx="18" cy="18" r="12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5"
            strokeDasharray="75.4" strokeDashoffset="18.85" strokeLinecap="round"
            style={{ transform: 'rotate(-220deg)', transformOrigin: '18px 18px' }}
          />
          {/* Value arc */}
          <circle cx="18" cy="18" r="12" fill="none" stroke="#a855f7" strokeWidth="2.5"
            strokeDasharray={`${pct * 75.4} 100`} strokeDashoffset="18.85" strokeLinecap="round"
            style={{ transform: 'rotate(-220deg)', transformOrigin: '18px 18px' }}
          />
          {/* Indicator */}
          <line
            x1="18" y1="8" x2="18" y2="12"
            stroke="#fff" strokeWidth="2" strokeLinecap="round"
            style={{ transform: `rotate(${angle}deg)`, transformOrigin: '18px 18px' }}
          />
        </svg>
      </div>
      <div className="knob-label">{label}</div>
      <div className="knob-value">{value.toFixed(1)}{unit}</div>
    </div>
  )
}

function EqBand({
  label, freq, gain, onGainChange
}: { label: string; freq: string; gain: number; onGainChange: (v: number) => void }) {
  return (
    <div className="eq-band">
      <div className="eq-band-label">{label}<span className="eq-freq">{freq}</span></div>
      <input
        type="range" min={-18} max={18} step={0.5} value={gain}
        className="eq-slider-v"
        onChange={e => onGainChange(parseFloat(e.target.value))}
        title={`${label}: ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`}
      />
      <div className="eq-gain-val">{gain >= 0 ? '+' : ''}{gain.toFixed(1)}</div>
    </div>
  )
}

function PluginSlot({ plugin, trackId, index }: { plugin: Plugin | undefined; trackId: string; index: number }) {
  const { addPlugin, removePlugin, togglePlugin } = useProjectStore()

  const PLUGIN_TYPES: Plugin['type'][] = ['eq', 'compressor', 'reverb', 'delay', 'limiter', 'chorus', 'distortion']

  function handleAdd() {
    const type = PLUGIN_TYPES[index % PLUGIN_TYPES.length]
    addPlugin(trackId, {
      id: `plugin-${Date.now()}`,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      type,
      enabled: true,
      params: {},
    })
  }

  if (!plugin) {
    return (
      <div className="plugin-slot empty" onClick={handleAdd} title="Click to add plugin">
        <span className="plugin-slot-num">{index + 1}</span>
        <span className="plugin-slot-name">— Empty —</span>
      </div>
    )
  }

  return (
    <div className={`plugin-slot ${plugin.enabled ? 'active' : 'bypassed'}`}>
      <button
        className="plugin-bypass-btn"
        onClick={() => togglePlugin(trackId, plugin.id)}
        title={plugin.enabled ? 'Bypass' : 'Enable'}
      >
        {plugin.enabled ? '●' : '○'}
      </button>
      <span className="plugin-slot-num">{index + 1}</span>
      <span className="plugin-slot-name">{plugin.name}</span>
      <button
        className="plugin-remove-btn"
        onClick={() => removePlugin(trackId, plugin.id)}
        title="Remove"
      >✕</button>
    </div>
  )
}

export function InspectorPanel({ onSetTrackEQ }: { onSetTrackEQ: (id: string, l: number, m: number, h: number) => void }) {
  const { tracks, selectedTrackId, updateTrack } = useProjectStore()
  const [eqGains, setEqGains] = useState<Record<string, [number, number, number]>>({})

  const track = tracks.find(t => t.id === selectedTrackId) ?? null

  if (!track) {
    return (
      <div className="inspector-panel">
        <div className="inspector-empty">
          <div className="inspector-empty-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="8" width="24" height="14" rx="3" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
              <circle cx="8" cy="15" r="3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>
              <circle cx="14" cy="15" r="3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>
              <circle cx="20" cy="15" r="3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>
              <line x1="8" y1="8" x2="8" y2="5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/>
              <line x1="14" y1="8" x2="14" y2="3" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/>
              <line x1="20" y1="8" x2="20" y2="6" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/>
            </svg>
          </div>
          <div className="inspector-empty-text">Select a track to inspect</div>
        </div>
      </div>
    )
  }

  const isMaster = track!.type === 'master'
  const eq = eqGains[track!.id] ?? [0, 0, 0]

  function handleEqChange(band: 0 | 1 | 2, val: number) {
    const next: [number, number, number] = [eq[0], eq[1], eq[2]]
    next[band] = val
    setEqGains(prev => ({ ...prev, [track!.id]: next }))
    onSetTrackEQ(track!.id, next[0], next[1], next[2])
  }

  const volDb = volToDb(track!.volume)
  const panStr = panToStr(track!.pan)

  return (
    <div className="inspector-panel">
      {/* Track identity */}
      <div className="inspector-section">
        <div className="inspector-track-header">
          <div className="inspector-color-bar" style={{ background: track!.color }} />
          <div>
            <div className="inspector-track-name">{track!.name}</div>
            <div className="inspector-track-type">{track!.type.toUpperCase()} TRACK</div>
          </div>
        </div>
      </div>

      {/* Volume & Pan */}
      <div className="inspector-section">
        <div className="inspector-section-title">Channel</div>
        <div className="inspector-vol-row">
          <span className="inspector-label">Volume</span>
          <input
            type="range" min={0} max={125} step={1}
            value={Math.round(track!.volume * 100)}
            className="inspector-slider"
            onChange={e => updateTrack(track!.id, { volume: parseInt(e.target.value) / 100 })}
          />
          <span className="inspector-val">{volDb}</span>
        </div>
        <div className="inspector-vol-row">
          <span className="inspector-label">Pan</span>
          <input
            type="range" min={-100} max={100} step={1}
            value={Math.round(track!.pan * 100)}
            className="inspector-slider"
            onChange={e => updateTrack(track!.id, { pan: parseInt(e.target.value) / 100 })}
          />
          <span className="inspector-val">{panStr}</span>
        </div>

        {/* M/S/Arm quick buttons */}
        <div className="inspector-msarm">
          <button
            className={`inspector-btn ${track!.muted ? 'btn-muted' : ''}`}
            onClick={() => updateTrack(track!.id, { muted: !track!.muted })}
          >M</button>
          <button
            className={`inspector-btn ${track!.solo ? 'btn-soloed' : ''}`}
            onClick={() => updateTrack(track!.id, { solo: !track!.solo })}
          >S</button>
          {!isMaster && (
            <button
              className={`inspector-btn ${track!.armed ? 'btn-armed' : ''}`}
              onClick={() => updateTrack(track!.id, { armed: !track!.armed })}
            >ARM</button>
          )}
        </div>
      </div>

      {/* EQ */}
      <div className="inspector-section">
        <div className="inspector-section-title">EQ</div>
        <div className="eq-bands-row">
          <EqBand label="Low" freq="320Hz" gain={eq[0]} onGainChange={v => handleEqChange(0, v)} />
          <EqBand label="Mid" freq="1kHz" gain={eq[1]} onGainChange={v => handleEqChange(1, v)} />
          <EqBand label="High" freq="3.2kHz" gain={eq[2]} onGainChange={v => handleEqChange(2, v)} />
        </div>
      </div>

      {/* Plugin inserts */}
      <div className="inspector-section">
        <div className="inspector-section-title">Inserts</div>
        <div className="plugin-slots">
          {[0,1,2,3].map(i => (
            <PluginSlot key={i} plugin={track!.plugins[i]} trackId={track!.id} index={i} />
          ))}
        </div>
      </div>

      {/* Sends (stub) */}
      <div className="inspector-section">
        <div className="inspector-section-title">Sends</div>
        <div className="sends-stub">
          {track!.sends.length === 0
            ? <div className="inspector-empty-text" style={{ fontSize: 11 }}>No sends configured</div>
            : track!.sends.map(s => (
                <div key={s.id} className="inspector-vol-row">
                  <span className="inspector-label">Bus</span>
                  <input type="range" min={0} max={100} value={Math.round(s.level * 100)} className="inspector-slider" readOnly />
                  <span className="inspector-val">{Math.round(s.level * 100)}%</span>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  )
}
