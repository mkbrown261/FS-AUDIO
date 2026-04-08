import React, { useRef, useState, useCallback } from 'react'
import { useProjectStore, Track } from '../store/projectStore'
import { PluginRack, PLUGIN_DEFAULTS } from './plugins/BuiltInPlugins'
import { MidiOutputPanel } from './MidiOutputPanel'

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
  const { updateTrack, selectTrack, selectedTrackId, addPlugin, setActivePanel } = useProjectStore()
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
              onClick={(e) => {
                e.stopPropagation()
                if (plugin) {
                  // open rack for this track
                  selectTrack(track.id)
                  setActivePanel('plugins')
                  setShowPluginMenu(null)
                } else {
                  setShowPluginMenu(showPluginMenu === i ? null : i)
                }
              }}
              title={plugin ? `${plugin.name} — click to open rack` : 'Add plugin'}
            >
              {plugin ? plugin.name : `—`}
              {showPluginMenu === i && !plugin && (
                <div className="plugin-dropdown" onClick={e => e.stopPropagation()}>
                  {Object.entries(PLUGIN_DEFAULTS).map(([key, def]) => (
                    <div key={key} className="plugin-option" onClick={() => {
                      addPlugin(track.id, {
                        id: `p-${Date.now()}`,
                        name: def.name,
                        type: def.type,
                        enabled: true,
                        params: { ...def.params },
                      })
                      setShowPluginMenu(null)
                      selectTrack(track.id)
                      setActivePanel('plugins')
                    }}>{def.name}</div>
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
        <button className={`btab ${activePanel === 'midi' ? 'active' : ''}`} onClick={() => setActivePanel('midi')}>MIDI Out</button>
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
        <PluginControlsPanel />
      )}

      {activePanel === 'midi' && (
        <div style={{ flex:1, overflowY:'auto', padding:'8px 16px' }}>
          <MidiOutputPanel />
        </div>
      )}
    </div>
  )
}

// ── Plugin Controls Panel (replaces SmartControls) ────────────────────────────
function PluginControlsPanel() {
  const { tracks, selectedTrackId } = useProjectStore()
  const track = tracks.find(t => t.id === selectedTrackId)

  if (!track) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'#6b7280', fontSize:13 }}>
        Select a track to view its plugin rack
      </div>
    )
  }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'8px 16px' }}>
      <PluginRack track={track} />
    </div>
  )
}
