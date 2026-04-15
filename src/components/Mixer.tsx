import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useProjectStore, Track } from '../store/projectStore'
import { PluginRack, PLUGIN_DEFAULTS } from './plugins/BuiltInPlugins'
import { MidiOutputPanel } from './MidiOutputPanel'
import { AutomationLaneView, AddAutomationLaneButton, AUTOMATION_PARAMS } from './AutomationLaneView'

// ── VU Meter with Peak Hold ───────────────────────────────────────────────────
const VU_SEGS = 20
const PEAK_HOLD_MS = 2500   // how long peak hold lingers
const PEAK_FALL_MS = 800    // how long it takes to fall after hold

function VuMeter({ level }: { level: number }) {
  const db = level > 0.001 ? 20 * Math.log10(level) : -60
  // -60dB = 0 segs, 0dB = 20 segs
  const lit = Math.max(0, Math.round(((db + 60) / 60) * VU_SEGS))

  // Peak hold state
  const peakDbRef = useRef(-60)
  const peakTimeRef = useRef(0)
  const [peakSeg, setPeakSeg] = useState(-1)
  const rafRef = useRef(0)

  useEffect(() => {
    const now = performance.now()
    if (db > peakDbRef.current) {
      peakDbRef.current = db
      peakTimeRef.current = now
    }

    const animate = (t: number) => {
      const elapsed = t - peakTimeRef.current
      if (elapsed > PEAK_HOLD_MS + PEAK_FALL_MS) {
        peakDbRef.current = -60
      } else if (elapsed > PEAK_HOLD_MS) {
        // linear fall
        const progress = (elapsed - PEAK_HOLD_MS) / PEAK_FALL_MS
        peakDbRef.current -= progress * 2
      }
      const seg = Math.max(0, Math.round(((peakDbRef.current + 60) / 60) * VU_SEGS)) - 1
      setPeakSeg(seg)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [db])

  // Clip LED — lights red if level is clipping (>= 0 dBFS)
  const isClipping = db >= -0.5

  return (
    <div className="vu-meter" style={{ position: 'relative' }}>
      {/* Clip LED */}
      <div
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isClipping ? '#ef4444' : 'rgba(255,255,255,0.08)',
          boxShadow: isClipping ? '0 0 6px #ef4444' : 'none',
          margin: '0 auto 2px',
          transition: 'background 0.1s, box-shadow 0.1s',
        }}
        title={isClipping ? 'CLIPPING!' : 'No clip'}
      />
      {Array.from({ length: VU_SEGS }, (_, i) => {
        const segIdx = VU_SEGS - 1 - i // top = 19 (0dB), bottom = 0 (-60dB)
        const isLit = segIdx < lit
        const isPeak = segIdx === peakSeg
        let color = 'rgba(255,255,255,0.06)'
        if (isLit) {
          if (segIdx >= 17) color = '#ef4444'
          else if (segIdx >= 14) color = '#f59e0b'
          else color = '#10b981'
        } else if (isPeak && peakSeg >= 0) {
          // Peak hold indicator — same color band but brighter
          if (segIdx >= 17) color = '#ff6b6b'
          else if (segIdx >= 14) color = '#fbbf24'
          else color = '#34d399'
        }
        return (
          <div
            key={i}
            className="vu-seg"
            style={{
              background: color,
              boxShadow: isPeak && peakSeg >= 0 ? `0 0 3px ${color}` : undefined,
            }}
          />
        )
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
  const { updateTrack, selectTrack, selectedTrackId, addPlugin, setActivePanel, openPluginWindow } = useProjectStore()
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
                  // Open floating window for this plugin
                  openPluginWindow(plugin.id)
                } else {
                  setShowPluginMenu(showPluginMenu === i ? null : i)
                }
              }}
              title={plugin ? `${plugin.name} — click to open window` : 'Add plugin'}
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
  const { tracks, showMixer, setShowMixer, activePanel, setActivePanel, setShowPianoRoll, pixelsPerBeat, scrollLeft, activeTool, automationLanes } = useProjectStore()
  const [panelHeight, setPanelHeight] = useState(220)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  function handleResizeDrag(e: React.MouseEvent) {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: panelHeight }
    const mv = (me: MouseEvent) => {
      if (!dragRef.current) return
      const dy = dragRef.current.startY - me.clientY
      setPanelHeight(Math.max(120, Math.min(600, dragRef.current.startH + dy)))
    }
    const up = () => { dragRef.current = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  if (!showMixer) return null

  const nonMasterTracks = tracks.filter(t => t.type !== 'master')
  const masterTrack = tracks.find(t => t.type === 'master')
  const TOTAL_BEATS = 96 * 4

  return (
    <div className="bottom-panel" style={{ height: panelHeight }}>
      {/* Resize handle */}
      <div className="resize-handle" onMouseDown={handleResizeDrag} />

      {/* Tab bar */}
      <div className="bottom-tabs">
        <button className={`btab ${activePanel === 'mixer' ? 'active' : ''}`} onClick={() => setActivePanel('mixer')}>Mixer</button>
        <button className={`btab ${activePanel === 'piano-roll' ? 'active' : ''}`} onClick={() => { setActivePanel('piano-roll'); setShowPianoRoll(true) }}>Piano Roll</button>
        <button className={`btab ${activePanel === 'plugins' ? 'active' : ''}`} onClick={() => setActivePanel('plugins')}>Smart Controls</button>
        <button className={`btab ${activePanel === 'automation' ? 'active' : ''}`} onClick={() => setActivePanel('automation')}>
          Automation
          {automationLanes.length > 0 && (
            <span className="btab-badge">{automationLanes.length}</span>
          )}
        </button>
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

      {activePanel === 'automation' && (
        <AutomationPanel
          pixelsPerBeat={pixelsPerBeat}
          scrollLeft={scrollLeft}
          totalBeats={TOTAL_BEATS}
          activeTool={activeTool}
        />
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

// ── Automation Panel ───────────────────────────────────────────────────────────
function AutomationPanel({ pixelsPerBeat, scrollLeft, totalBeats, activeTool }: {
  pixelsPerBeat: number
  scrollLeft: number
  totalBeats: number
  activeTool: string
}) {
  const { tracks, automationLanes, selectedTrackId, selectTrack } = useProjectStore()
  const nonMasterTracks = tracks.filter(t => t.type !== 'master')

  if (automationLanes.length === 0) {
    return (
      <div className="automation-panel-empty">
        <div className="automation-panel-empty-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M2 20 Q7 8 14 14 Q21 20 26 6" stroke="rgba(168,85,247,.5)" strokeWidth="2" fill="none" strokeLinecap="round"/>
            <circle cx="7" cy="12" r="3" fill="rgba(168,85,247,.25)" stroke="rgba(168,85,247,.5)" strokeWidth="1.5"/>
            <circle cx="14" cy="14" r="3" fill="rgba(168,85,247,.25)" stroke="rgba(168,85,247,.5)" strokeWidth="1.5"/>
            <circle cx="21" cy="10" r="3" fill="rgba(168,85,247,.25)" stroke="rgba(168,85,247,.5)" strokeWidth="1.5"/>
          </svg>
        </div>
        <div className="automation-panel-empty-text">No automation lanes yet</div>
        <div className="automation-panel-empty-sub">
          Click <strong>+ Auto</strong> on any track to add an automation lane,<br/>
          then use the Pencil tool to draw automation curves.
        </div>
        <div className="automation-panel-tracks">
          {nonMasterTracks.map(t => (
            <div key={t.id} className="automation-panel-track-row">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11 }}>{t.name}</span>
              <AddAutomationLaneButton trackId={t.id} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Group lanes by track
  const lanesByTrack = nonMasterTracks.map(t => ({
    track: t,
    lanes: automationLanes.filter(l => l.trackId === t.id),
  })).filter(g => g.lanes.length > 0)

  return (
    <div className="automation-panel" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
      <div className="automation-panel-header">
        <span className="automation-panel-title">Automation Editor</span>
        <span className="automation-panel-hint">Use Pencil tool to draw · Scissors to erase · drag points to adjust</span>
      </div>
      {lanesByTrack.map(({ track, lanes }) => (
        <div key={track.id} className="automation-track-group">
          <div
            className={`automation-track-label${selectedTrackId === track.id ? ' selected' : ''}`}
            onClick={() => selectTrack(track.id)}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: track.color, flexShrink: 0 }} />
            <span>{track.name}</span>
            <AddAutomationLaneButton trackId={track.id} />
          </div>
          {lanes.map(lane => (
            <AutomationLaneView
              key={lane.id}
              lane={lane}
              pixelsPerBeat={pixelsPerBeat}
              scrollLeft={scrollLeft}
              totalBeats={totalBeats}
              activeTool={activeTool}
            />
          ))}
        </div>
      ))}
      {/* Tracks without lanes — show add buttons */}
      {nonMasterTracks
        .filter(t => !automationLanes.some(l => l.trackId === t.id))
        .map(t => (
          <div key={t.id} className="automation-track-group automation-track-empty">
            <div className="automation-track-label">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
              <span>{t.name}</span>
              <AddAutomationLaneButton trackId={t.id} />
            </div>
          </div>
        ))
      }
    </div>
  )
}
