import React, { useRef } from 'react'
import { useProjectStore, Track } from '../store/projectStore'

const COLORS = [
  '#a855f7','#ec4899','#3b82f6','#10b981',
  '#f59e0b','#06b6d4','#ef4444','#8b5cf6',
  '#14b8a6','#f97316','#84cc16','#e879f9',
]

function TrackHeader({ track }: { track: Track }) {
  const {
    updateTrack, removeTrack, duplicateTrack,
    selectedTrackId, selectTrack, addClip,
  } = useProjectStore()

  const nameRef = useRef<HTMLInputElement>(null)

  function handleColorPick() {
    const idx = COLORS.indexOf(track.color)
    const next = COLORS[(idx + 1) % COLORS.length]
    updateTrack(track.id, { color: next })
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    // Native context menus not available in web — show simple inline menu via a custom element
    // For now, log actions. In production this would open a floating context menu.
  }

  function volToDb(v: number) {
    if (v <= 0) return '-∞'
    const db = 20 * Math.log10(v)
    return (db >= 0 ? '+' : '') + db.toFixed(1)
  }

  const isSelected = selectedTrackId === track.id
  const isMaster = track.type === 'master'

  return (
    <div
      className={`track-header ${isSelected ? 'selected' : ''}`}
      style={{ height: track.height, borderLeftColor: track.color }}
      onClick={() => selectTrack(track.id)}
      onContextMenu={handleContextMenu}
    >
      <div className="track-header-top">
        {/* Color swatch */}
        <div
          className="track-color-dot"
          style={{ background: track.color }}
          onClick={(e) => { e.stopPropagation(); handleColorPick() }}
          title="Click to change color"
        />

        {/* Type badge */}
        <span className="track-type-badge">{track.type.toUpperCase()}</span>

        {/* Name */}
        <input
          ref={nameRef}
          className="track-name-input"
          defaultValue={track.name}
          onBlur={e => updateTrack(track.id, { name: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onClick={e => e.stopPropagation()}
        />

        {/* Remove (not for master) */}
        {!isMaster && (
          <button
            className="track-x"
            onClick={e => { e.stopPropagation(); removeTrack(track.id) }}
            title="Delete track"
          >✕</button>
        )}
      </div>

      <div className="track-header-controls">
        {/* Mute */}
        <button
          className={`track-btn ${track.muted ? 'muted' : ''}`}
          onClick={e => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}
          title="Mute (M)"
        >M</button>

        {/* Solo */}
        <button
          className={`track-btn ${track.solo ? 'soloed' : ''}`}
          onClick={e => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }) }}
          title="Solo (S)"
        >S</button>

        {/* Arm */}
        {!isMaster && (
          <button
            className={`track-btn arm-btn ${track.armed ? 'armed' : ''}`}
            onClick={e => { e.stopPropagation(); updateTrack(track.id, { armed: !track.armed }) }}
            title="Record arm (R)"
          >⏺</button>
        )}

        {/* Volume */}
        <input
          type="range" min={0} max={125} step={1}
          className="track-vol-slider"
          value={Math.round(track.volume * 100)}
          onChange={e => { e.stopPropagation(); updateTrack(track.id, { volume: parseInt(e.target.value) / 100 }) }}
          onClick={e => e.stopPropagation()}
          title={`Volume: ${volToDb(track.volume)} dB`}
        />
        <span className="track-db-label">{volToDb(track.volume)}</span>

        {/* Pan */}
        <input
          type="range" min={-100} max={100} step={1}
          className="track-pan-slider"
          value={Math.round(track.pan * 100)}
          onChange={e => { e.stopPropagation(); updateTrack(track.id, { pan: parseInt(e.target.value) / 100 }) }}
          onClick={e => e.stopPropagation()}
          title={`Pan: ${track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(Math.round(track.pan*100))}` : `R${Math.round(track.pan*100)}`}`}
        />
      </div>

      {/* Plugin count badge */}
      {track.plugins.length > 0 && (
        <div className="plugin-badge" title={`${track.plugins.length} plugin(s)`}>
          FX {track.plugins.length}
        </div>
      )}
    </div>
  )
}

export function TrackList() {
  const { tracks, addTrack, scrollTop } = useProjectStore()

  return (
    <div className="track-list">
      <div className="track-list-header">
        <button className="add-track-btn" onClick={() => addTrack('audio')} title="Add Audio Track">+ Audio</button>
        <button className="add-track-btn" onClick={() => addTrack('midi')} title="Add MIDI Track">+ MIDI</button>
        <button className="add-track-btn" onClick={() => addTrack('bus')} title="Add Bus">+ Bus</button>
      </div>
      <div className="track-list-body" style={{ transform: `translateY(-${scrollTop}px)` }}>
        {tracks.map(track => (
          <TrackHeader key={track.id} track={track} />
        ))}
      </div>
    </div>
  )
}
