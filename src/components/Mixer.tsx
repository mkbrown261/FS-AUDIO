import React, { useRef, useState, useCallback } from 'react'
import { useProjectStore, Track } from '../store/projectStore'

// ── VU Meter ──────────────────────────────────────────────────────────────────
const VU_SEGS = 20
function VuMeter({ level }: { level: number }) {
  const db = level > 0.001 ? 20 * Math.log10(level) : -60
  // -60dB = 0 segs, 0dB = 20 segs
  const lit = Math.max(0, Math.round(((db + 60) / 60) * VU_SEGS))
  return (
    <div className="vu-meter">
      {Array.from({ length: VU_SEGS }, (_, i) => {
        const segIdx = VU_SEGS - 1 - i // top = 19 (0dB), bottom = 0 (-60dB)
        const isLit = segIdx < lit
        let color = 'rgba(255,255,255,0.06)'
        if (isLit) {
          if (segIdx >= 17) color = '#ef4444'       // top 3 = red (0 to -6dB)
          else if (segIdx >= 14) color = '#f59e0b'  // next 3 = yellow (-6 to -12dB)
          else color = '#10b981'                     // rest = green
        }
        return <div key={i} className="vu-seg" style={{ background: color }} />
      })}
    </div>
  )
}

// ── Tiny EQ Curve SVG ─────────────────────────────────────────────────────────
function EqCurve({ low, mid, high }: { low: number; mid: number; high: number }) {
  const W = 56, H = 28
  // Map dB (-18 to +18) → y (H to 0)
  const dbToY = (db: number) => H / 2 - (db / 18) * (H / 2 - 2)
  const points = [
    `0,${dbToY(low)}`,
    `${W * 0.2},${dbToY(low)}`,
    `${W * 0.35},${dbToY(mid)}`,
    `${W * 0.5},${dbToY(mid)}`,
    `${W * 0.65},${dbToY(high)}`,
    `${W},${dbToY(high)}`,
  ].join(' ')
  return (
    <svg width={W} height={H} style={{ display:'block' }}>
      <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      <polyline points={points} fill="none" stroke="#a855f7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Single channel strip ──────────────────────────────────────────────────────
function ChannelStrip({
  track, level, onVolumeChange, onPanChange
}: {
  track: Track
  level: number
  onVolumeChange: (id: string, v: number) => void
  onPanChange: (id: string, v: number) => void
}) {
  const { updateTrack, selectTrack, selectedTrackId, addPlugin } = useProjectStore()
  const [showPluginMenu, setShowPluginMenu] = useState<number | null>(null)
  const [eqGains] = useState<[number,number,number]>([0,0,0])

  const isMaster = track.type === 'master'
  const isSelected = selectedTrackId === track.id

  const volDb = track.volume <= 0.001 ? '-∞' : (20 * Math.log10(track.volume)).toFixed(1)
  const panStr = Math.abs(track.pan) < 0.01 ? 'C' : track.pan < 0 ? `L${Math.abs(Math.round(track.pan*100))}` : `R${Math.round(track.pan*100)}`

  function handleFaderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value) / 100
    updateTrack(track.id, { volume: v })
    onVolumeChange(track.id, v)
  }

  function handlePanChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value) / 100
    updateTrack(track.id, { pan: v })
    onPanChange(track.id, v)
  }

  const PLUGIN_TYPES = ['eq','compressor','reverb','delay','limiter','chorus','distortion'] as const

  return (
    <div
      className={`mixer-channel ${isMaster ? 'master-channel' : ''} ${isSelected ? 'mixer-ch-selected' : ''}`}
      onClick={() => selectTrack(track.id)}
    >
      {/* Channel name */}
      <div className="mixer-ch-name" style={{ color: track.color }}>
        {track.name}
      </div>

      {/* Insert slots */}
      <div className="insert-slots">
        {[0,1,2,3].map(i => {
          const plugin = track.plugins[i]
          return (
            <div
              key={i}
              className={`insert-slot ${plugin ? (plugin.enabled ? 'has-plugin' : 'disabled') : ''}`}
              onClick={(e) => { e.stopPropagation(); setShowPluginMenu(showPluginMenu === i ? null : i) }}
              title={plugin ? `${plugin.name} — click to ${plugin.enabled ? 'bypass' : 'enable'}` : 'Add plugin'}
            >
              {plugin ? plugin.name : `—`}
              {showPluginMenu === i && !plugin && (
                <div className="plugin-dropdown" onClick={e => e.stopPropagation()}>
                  {PLUGIN_TYPES.map(t => (
                    <div key={t} className="plugin-option" onClick={() => {
                      addPlugin(track.id, { id:`p-${Date.now()}`, name: t.charAt(0).toUpperCase()+t.slice(1), type: t, enabled: true, params: {} })
                      setShowPluginMenu(null)
                    }}>{t}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* EQ mini curve */}
      <EqCurve low={eqGains[0]} mid={eqGains[1]} high={eqGains[2]} />

      {/* Pan */}
      <div className="mixer-pan-wrap" title={`Pan: ${panStr}`}>
        <input
          type="range" min={-100} max={100} step={1}
          value={Math.round(track.pan * 100)}
          className="mixer-pan"
          onChange={handlePanChange}
          onClick={e => e.stopPropagation()}
        />
      </div>
      <div style={{ fontSize: 9, color: '#6b7280', textAlign:'center', marginBottom: 2 }}>{panStr}</div>

      {/* Fader + VU */}
      <div className="fader-vu-wrap">
        <VuMeter level={level} />
        <input
          type="range" min={0} max={125} step={1}
          value={Math.round(track.volume * 100)}
          className="mixer-fader"
          onChange={handleFaderChange}
          onClick={e => e.stopPropagation()}
          title={`Volume: ${volDb} dB`}
          style={{ WebkitAppearance:'slider-vertical', writingMode:'vertical-rl', height:120, width:24 } as React.CSSProperties}
        />
        <VuMeter level={level} />
      </div>

      {/* dB readout */}
      <div className="mixer-db">{volDb} dB</div>

      {/* M/S/R */}
      <div className="mixer-btns">
        <button
          className={`mxbtn ${track.muted ? 'muted' : ''}`}
          onClick={e => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}
          title="Mute"
        >M</button>
        <button
          className={`mxbtn ${track.solo ? 'soloed' : ''}`}
          onClick={e => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }) }}
          title="Solo"
        >S</button>
        {!isMaster && (
          <button
            className={`mxbtn ${track.armed ? 'armed' : ''}`}
            onClick={e => { e.stopPropagation(); updateTrack(track.id, { armed: !track.armed }) }}
            title="Arm"
          >
            <svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3" fill="currentColor"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Mixer panel ───────────────────────────────────────────────────────────────
export function Mixer({
  trackLevels,
  onVolumeChange,
  onPanChange,
}: {
  trackLevels: Map<string, number>
  onVolumeChange: (id: string, v: number) => void
  onPanChange: (id: string, v: number) => void
}) {
  const { tracks, showMixer, setShowMixer, activePanel, setActivePanel, setShowPianoRoll } = useProjectStore()
  const [panelHeight, setPanelHeight] = useState(220)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  function handleResizeDrag(e: React.MouseEvent) {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: panelHeight }
    const mv = (me: MouseEvent) => {
      if (!dragRef.current) return
      const dy = dragRef.current.startY - me.clientY
      setPanelHeight(Math.max(120, Math.min(500, dragRef.current.startH + dy)))
    }
    const up = () => { dragRef.current = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  if (!showMixer) return null

  const nonMasterTracks = tracks.filter(t => t.type !== 'master')
  const masterTrack = tracks.find(t => t.type === 'master')

  return (
    <div className="bottom-panel" style={{ height: panelHeight }}>
      {/* Resize handle */}
      <div className="resize-handle" onMouseDown={handleResizeDrag} />

      {/* Tab bar */}
      <div className="bottom-tabs">
        <button className={`btab ${activePanel === 'mixer' ? 'active' : ''}`} onClick={() => setActivePanel('mixer')}>Mixer</button>
        <button className={`btab ${activePanel === 'piano-roll' ? 'active' : ''}`} onClick={() => { setActivePanel('piano-roll'); setShowPianoRoll(true) }}>Piano Roll</button>
        <button className={`btab ${activePanel === 'plugins' ? 'active' : ''}`} onClick={() => setActivePanel('plugins')}>Smart Controls</button>
        <button className="btab btab-close" style={{ marginLeft:'auto' }} onClick={() => setShowMixer(false)}>✕</button>
      </div>

      {activePanel === 'mixer' && (
        <div className="mixer-strip-row">
          {nonMasterTracks.map(track => (
            <ChannelStrip
              key={track.id}
              track={track}
              level={trackLevels.get(track.id) ?? 0}
              onVolumeChange={onVolumeChange}
              onPanChange={onPanChange}
            />
          ))}
          {masterTrack && (
            <ChannelStrip
              track={masterTrack}
              level={Math.max(...Array.from(trackLevels.values()), 0)}
              onVolumeChange={onVolumeChange}
              onPanChange={onPanChange}
            />
          )}
        </div>
      )}

      {activePanel === 'plugins' && (
        <SmartControls />
      )}
    </div>
  )
}

// ── Smart Controls ─────────────────────────────────────────────────────────────
function SmartControls() {
  const { tracks, selectedTrackId, updatePlugin } = useProjectStore()
  const track = tracks.find(t => t.id === selectedTrackId)
  const plugin = track?.plugins.find(p => p.enabled)

  if (!track || !plugin) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'#6b7280', fontSize:13 }}>
        Select a track with a plugin to show Smart Controls
      </div>
    )
  }

  const defaults: Record<string, { min: number; max: number; default: number; unit: string }> = {
    threshold: { min: -60, max: 0, default: -24, unit: 'dB' },
    ratio: { min: 1, max: 20, default: 4, unit: ':1' },
    attack: { min: 0.001, max: 1, default: 0.003, unit: 's' },
    release: { min: 0.01, max: 5, default: 0.25, unit: 's' },
    mix: { min: 0, max: 1, default: 1, unit: '' },
    gain: { min: -20, max: 20, default: 0, unit: 'dB' },
    time: { min: 0, max: 2, default: 0.3, unit: 's' },
    feedback: { min: 0, max: 0.99, default: 0.3, unit: '' },
    depth: { min: 0, max: 1, default: 0.5, unit: '' },
    rate: { min: 0.1, max: 10, default: 1, unit: 'Hz' },
  }

  const knobKeys: Record<Plugin['type'], string[]> = {
    compressor: ['threshold','ratio','attack','release'],
    eq: ['gain'],
    reverb: ['mix','time'],
    delay: ['time','feedback','mix'],
    limiter: ['threshold','gain'],
    chorus: ['rate','depth','mix'],
    distortion: ['gain','mix'],
    vst: [],
  }

  const keys = knobKeys[plugin.type] ?? []

  return (
    <div style={{ display:'flex', alignItems:'center', gap:20, padding:'0 20px', flex:1, overflowX:'auto' }}>
      <div style={{ fontSize:12, fontWeight:800, color:'#a855f7', marginRight:8, flexShrink:0 }}>
        {plugin.name}
      </div>
      {keys.map(k => {
        const def = defaults[k] ?? { min:0, max:1, default:0.5, unit:'' }
        const val = plugin.params[k] ?? def.default
        return (
          <div key={k} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
            <input
              type="range"
              min={def.min} max={def.max} step={(def.max - def.min) / 200}
              value={val}
              style={{ WebkitAppearance:'slider-vertical', writingMode:'vertical-rl', height:70, width:20, accentColor:'#a855f7' } as React.CSSProperties}
              onChange={e => updatePlugin(track.id, plugin.id, { [k]: parseFloat(e.target.value) })}
            />
            <div style={{ fontSize:9, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.5px' }}>{k}</div>
            <div style={{ fontSize:10, color:'#f0f0f0', fontVariantNumeric:'tabular-nums' }}>
              {val.toFixed(k === 'ratio' ? 0 : 2)}{def.unit}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Type alias for Plugin to fix the SmartControls reference
type Plugin = import('../store/projectStore').Plugin
