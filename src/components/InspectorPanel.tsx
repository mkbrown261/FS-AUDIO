import React, { useCallback, useState, useRef, useEffect } from 'react'
import { useProjectStore, Track, Plugin, Clip } from '../store/projectStore'
import { PluginRack } from './plugins/BuiltInPlugins'

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

interface PluginSlotProps {
  plugin: Plugin | undefined
  trackId: string
  index: number
  onSetEQ: (l: number, m: number, h: number) => void
  onSetCompressor: (threshold: number, ratio: number, attack: number, release: number) => void
}

function PluginSlot({ plugin, trackId, index, onSetEQ, onSetCompressor }: PluginSlotProps) {
  const { addPlugin, removePlugin, togglePlugin, updatePlugin, openPluginWindow } = useProjectStore()
  const [expanded, setExpanded] = useState(false)

  const PLUGIN_TYPES: Plugin['type'][] = ['eq', 'compressor', 'reverb', 'delay', 'limiter', 'chorus', 'distortion']

  function handleAdd() {
    const type = PLUGIN_TYPES[index % PLUGIN_TYPES.length]
    addPlugin(trackId, {
      id: `plugin-${Date.now()}`,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      type,
      enabled: true,
      params: type === 'eq' ? { low: 0, mid: 0, high: 0 }
             : type === 'compressor' ? { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 }
             : {},
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

  function handleParamChange(key: string, val: number) {
    if (!plugin) return
    const next = { ...plugin.params, [key]: val }
    updatePlugin(trackId, plugin.id, next)
    if (plugin.type === 'eq' && plugin.enabled) {
      onSetEQ(next.low ?? 0, next.mid ?? 0, next.high ?? 0)
    } else if (plugin.type === 'compressor' && plugin.enabled) {
      onSetCompressor(next.threshold ?? -24, next.ratio ?? 4, next.attack ?? 0.003, next.release ?? 0.25)
    }
  }

  function handleBypass() {
    togglePlugin(trackId, plugin!.id)
    // When re-enabling, reapply params
    if (!plugin!.enabled) {
      if (plugin!.type === 'eq') onSetEQ(plugin!.params.low ?? 0, plugin!.params.mid ?? 0, plugin!.params.high ?? 0)
      if (plugin!.type === 'compressor') onSetCompressor(plugin!.params.threshold ?? -24, plugin!.params.ratio ?? 4, plugin!.params.attack ?? 0.003, plugin!.params.release ?? 0.25)
    } else {
      // Bypassing — reset to neutral
      if (plugin!.type === 'eq') onSetEQ(0, 0, 0)
      if (plugin!.type === 'compressor') onSetCompressor(-60, 1, 0.003, 0.25)
    }
  }

  return (
    <div className={`plugin-slot ${plugin.enabled ? 'active' : 'bypassed'}`}>
      <div className="plugin-slot-header">
        <button className="plugin-bypass-btn" onClick={handleBypass} title={plugin.enabled ? 'Bypass' : 'Enable'}>
          <div className={`plugin-power-dot ${plugin.enabled ? 'on' : 'off'}`} />
        </button>
        <span className="plugin-slot-num">{index + 1}</span>
        <span className="plugin-slot-name" onClick={() => openPluginWindow(plugin.id)} style={{ cursor: 'pointer' }} title="Click to open window">
          {plugin.name}
        </span>
        <button className="plugin-expand-btn" onClick={() => setExpanded(e => !e)} title="Edit">
          {expanded ? '▲' : '▼'}
        </button>
        <button className="plugin-remove-btn" onClick={() => removePlugin(trackId, plugin.id)} title="Remove">✕</button>
      </div>

      {expanded && plugin.enabled && (
        <div className="plugin-params">
          {plugin.type === 'eq' && (
            <>
              {(['low', 'mid', 'high'] as const).map((key, idx) => {
                const labels = ['Low', 'Mid', 'High']
                const val = (plugin.params[key] as number) ?? 0
                return (
                  <div key={key} className="plugin-param-row">
                    <span className="inspector-label">{labels[idx]}</span>
                    <input type="range" min={-12} max={12} step={0.5} value={val} className="inspector-slider"
                      onChange={e => handleParamChange(key, parseFloat(e.target.value))} />
                    <span className="inspector-val">{val > 0 ? '+' : ''}{val.toFixed(1)} dB</span>
                  </div>
                )
              })}
            </>
          )}
          {plugin.type === 'compressor' && (
            <>
              <div className="plugin-param-row">
                <span className="inspector-label">Threshold</span>
                <input type="range" min={-60} max={0} step={1} value={plugin.params.threshold ?? -24} className="inspector-slider"
                  onChange={e => handleParamChange('threshold', parseFloat(e.target.value))} />
                <span className="inspector-val">{plugin.params.threshold ?? -24} dB</span>
              </div>
              <div className="plugin-param-row">
                <span className="inspector-label">Ratio</span>
                <input type="range" min={1} max={20} step={0.5} value={plugin.params.ratio ?? 4} className="inspector-slider"
                  onChange={e => handleParamChange('ratio', parseFloat(e.target.value))} />
                <span className="inspector-val">{plugin.params.ratio ?? 4}:1</span>
              </div>
              <div className="plugin-param-row">
                <span className="inspector-label">Attack</span>
                <input type="range" min={0.001} max={0.1} step={0.001} value={plugin.params.attack ?? 0.003} className="inspector-slider"
                  onChange={e => handleParamChange('attack', parseFloat(e.target.value))} />
                <span className="inspector-val">{((plugin.params.attack ?? 0.003) * 1000).toFixed(1)} ms</span>
              </div>
              <div className="plugin-param-row">
                <span className="inspector-label">Release</span>
                <input type="range" min={0.01} max={2} step={0.01} value={plugin.params.release ?? 0.25} className="inspector-slider"
                  onChange={e => handleParamChange('release', parseFloat(e.target.value))} />
                <span className="inspector-val">{((plugin.params.release ?? 0.25) * 1000).toFixed(0)} ms</span>
              </div>
            </>
          )}
          {!['eq','compressor'].includes(plugin.type) && (
            <div className="plugin-param-row" style={{ color: 'var(--text-m)', fontSize: 11 }}>
              {plugin.name} — no parameters
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface InspectorPanelProps {
  onSetTrackEQ: (id: string, l: number, m: number, h: number) => void
  onSetTrackVolume: (id: string, volume: number) => void
  onSetTrackPan: (id: string, pan: number) => void
  onSetTrackCompressor: (id: string, threshold: number, ratio: number, attack: number, release: number) => void
}

export function InspectorPanel({ onSetTrackEQ, onSetTrackVolume, onSetTrackPan, onSetTrackCompressor }: InspectorPanelProps) {
  const { tracks, selectedTrackId, selectedClipIds, updateTrack, updateClip, setActiveTake, deleteTake, setClipFadeIn, setClipFadeOut, addSend, removeSend, updateSendLevel, toggleSendPreFader } = useProjectStore()
  const [eqGains, setEqGains] = useState<Record<string, [number, number, number]>>({})
  const [showSendMenu, setShowSendMenu] = useState(false)
  const sendMenuRef = useRef<HTMLDivElement>(null)

  // Close send menu when clicking outside
  useEffect(() => {
    if (!showSendMenu) return
    const handler = (e: MouseEvent) => {
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) {
        setShowSendMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSendMenu])

  const track = tracks.find(t => t.id === selectedTrackId) ?? null

  // Find selected clip (first selected clip wins)
  const selectedClip: Clip | null = (() => {
    if (!selectedClipIds.length) return null
    for (const t of tracks) {
      const c = t.clips.find(cl => selectedClipIds.includes(cl.id))
      if (c) return c
    }
    return null
  })()

  if (!track) {
    return (
      <div className="inspector-panel" style={{ width: '100%', minWidth: 0 }}>
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
    <div className="inspector-panel" style={{ width: '100%', minWidth: 0 }}>
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
            onChange={e => {
              const v = parseInt(e.target.value) / 100
              updateTrack(track!.id, { volume: v })
              onSetTrackVolume(track!.id, v)
            }}
          />
          <span className="inspector-val">{volDb}</span>
        </div>
        <div className="inspector-vol-row">
          <span className="inspector-label">Pan</span>
          <input
            type="range" min={-100} max={100} step={1}
            value={Math.round(track!.pan * 100)}
            className="inspector-slider"
            onChange={e => {
              const v = parseInt(e.target.value) / 100
              updateTrack(track!.id, { pan: v })
              onSetTrackPan(track!.id, v)
            }}
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

      {/* ── Clip section (shows when a clip is selected) ── */}
      {selectedClip && (
        <div className="inspector-section">
          <div className="inspector-section-title">
            Clip
            <span style={{ fontWeight: 400, color: 'var(--text-m)', marginLeft: 6, fontSize: 9 }}>
              {selectedClip.name}
            </span>
          </div>

          {/* Gain */}
          <div className="inspector-vol-row">
            <span className="inspector-label">Gain</span>
            <input
              type="range" min={0} max={200} step={1}
              value={Math.round((selectedClip.gain ?? 1) * 100)}
              className="inspector-slider"
              onChange={e => updateClip(selectedClip.id, { gain: parseInt(e.target.value) / 100 })}
            />
            <span className="inspector-val">{Math.round((selectedClip.gain ?? 1) * 100)}%</span>
          </div>

          {/* Fade In */}
          <div className="inspector-vol-row">
            <span className="inspector-label">Fade In</span>
            <input
              type="range" min={0} max={Math.max(1, selectedClip.durationBeats * 0.95)} step={0.01}
              value={selectedClip.fadeIn ?? 0}
              className="inspector-slider"
              onChange={e => setClipFadeIn(selectedClip.id, parseFloat(e.target.value))}
            />
            <span className="inspector-val">{(selectedClip.fadeIn ?? 0).toFixed(2)} b</span>
          </div>

          {/* Fade Out */}
          <div className="inspector-vol-row">
            <span className="inspector-label">Fade Out</span>
            <input
              type="range" min={0} max={Math.max(1, selectedClip.durationBeats * 0.95)} step={0.01}
              value={selectedClip.fadeOut ?? 0}
              className="inspector-slider"
              onChange={e => setClipFadeOut(selectedClip.id, parseFloat(e.target.value))}
            />
            <span className="inspector-val">{(selectedClip.fadeOut ?? 0).toFixed(2)} b</span>
          </div>

          {/* Takes section */}
          {(selectedClip.takes?.length ?? 0) > 0 && (
            <>
              <div className="inspector-section-title" style={{ marginTop: 8 }}>
                Takes
                <span style={{ fontWeight: 400, color: 'var(--text-m)', marginLeft: 6, fontSize: 9 }}>
                  {(selectedClip.takes?.length ?? 0)} total
                </span>
              </div>
              <div className="inspector-takes">
                {selectedClip.takes!.map((take, i) => {
                  const isActive = i === (selectedClip.activeTakeIndex ?? 0)
                  return (
                    <div
                      key={i}
                      className={`inspector-take-row${isActive ? ' active' : ''}`}
                      onClick={() => setActiveTake(selectedClip.id, i)}
                      title={`Click to activate Take ${i + 1}`}
                    >
                      <div className="inspector-take-num">{i + 1}</div>
                      <div className="inspector-take-name">{take.name}</div>
                      {isActive && (
                        <div className="inspector-take-active-badge">ACTIVE</div>
                      )}
                      <button
                        className="inspector-take-del"
                        title="Delete take"
                        onClick={e => { e.stopPropagation(); deleteTake(selectedClip.id, i) }}
                      >✕</button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* EQ */}
      <div className="inspector-section">
        <div className="inspector-section-title">EQ</div>
        <div className="eq-bands-row">
          <EqBand label="Low" freq="320Hz" gain={eq[0]} onGainChange={v => handleEqChange(0, v)} />
          <EqBand label="Mid" freq="1kHz" gain={eq[1]} onGainChange={v => handleEqChange(1, v)} />
          <EqBand label="High" freq="3.2kHz" gain={eq[2]} onGainChange={v => handleEqChange(2, v)} />
        </div>
      </div>

      {/* Plugin Rack — full-featured with built-in plugins */}
      <div className="inspector-section" style={{ padding: 0 }}>
        <PluginRack track={track!} />
      </div>

      {/* Sends — functional routing to bus tracks */}
      {!isMaster && (
        <div className="inspector-section">
          <div className="inspector-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Sends
            <div style={{ position: 'relative', marginLeft: 'auto' }} ref={sendMenuRef}>
              <button
                className="inspector-btn"
                style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3 }}
                onClick={() => setShowSendMenu(v => !v)}
                title="Add send to bus"
              >+ Bus</button>
              {showSendMenu && (() => {
                const busTracks = tracks.filter(t => t.type === 'bus' || t.type === 'master')
                return (
                  <div className="send-bus-menu">
                    {busTracks.length === 0 && (
                      <div className="send-bus-option" style={{ opacity: .5, cursor: 'default' }}>No bus tracks</div>
                    )}
                    {busTracks.map(bt => (
                      <div
                        key={bt.id}
                        className="send-bus-option"
                        onClick={() => {
                          addSend(track!.id, bt.id)
                          setShowSendMenu(false)
                        }}
                      >
                        <span style={{ color: bt.color, marginRight: 4 }}>●</span>
                        {bt.name}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>

          <div className="sends-stub">
            {track!.sends.length === 0 ? (
              <div className="inspector-empty-text" style={{ fontSize: 11 }}>
                No sends — click + Bus to route to a bus
              </div>
            ) : (
              track!.sends.map(send => {
                const busTrack = tracks.find(t => t.id === send.busId)
                return (
                  <div key={send.id} className="send-row">
                    <div
                      className="send-bus-dot"
                      style={{ background: busTrack?.color ?? '#6b7280' }}
                      title={busTrack?.name ?? send.busId}
                    />
                    <span className="inspector-label" style={{ minWidth: 54 }}>{busTrack?.name ?? 'Bus'}</span>
                    <input
                      type="range" min={0} max={100} step={1}
                      value={Math.round(send.level * 100)}
                      className="inspector-slider"
                      onChange={e => updateSendLevel(track!.id, send.id, parseInt(e.target.value) / 100)}
                    />
                    <span className="inspector-val" style={{ minWidth: 26 }}>{Math.round(send.level * 100)}%</span>
                    <button
                      className={`send-prefader-btn${send.preFader ? ' active' : ''}`}
                      onClick={() => toggleSendPreFader(track!.id, send.id)}
                      title={send.preFader ? 'Pre-fader (click for post)' : 'Post-fader (click for pre)'}
                    >{send.preFader ? 'PRE' : 'POST'}</button>
                    <button
                      className="send-remove-btn"
                      onClick={() => removeSend(track!.id, send.id)}
                      title="Remove send"
                    >✕</button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
