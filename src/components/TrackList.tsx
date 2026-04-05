import React, { useRef } from 'react'
import { useProjectStore, Track } from '../store/projectStore'

const COLORS = ['#a855f7','#ec4899','#3b82f6','#10b981','#f59e0b','#06b6d4','#ef4444','#8b5cf6','#14b8a6','#f97316','#84cc16','#e879f9']

function volToDb(v: number): string {
  if (v <= 0.001) return '-∞'
  const db = 20 * Math.log10(v)
  return (db >= 0 ? '+' : '') + db.toFixed(1)
}

function panStr(p: number): string {
  if (Math.abs(p) < 0.01) return 'C'
  const n = Math.round(Math.abs(p) * 100)
  return p < 0 ? `L${n}` : `R${n}`
}

const TYPE_ICON: Record<string, string> = {
  audio: '🔊', midi: '🎹', bus: '🔀', master: '⭐'
}

function TrackHeader({ track, onVolumeChange, onPanChange }: {
  track: Track
  onVolumeChange: (id: string, v: number) => void
  onPanChange: (id: string, v: number) => void
}) {
  const { updateTrack, removeTrack, selectTrack, selectedTrackId } = useProjectStore()
  const nameRef = useRef<HTMLInputElement>(null)
  const isMaster = track.type === 'master'
  const isSelected = selectedTrackId === track.id

  function cycleColor() {
    const idx = COLORS.indexOf(track.color)
    updateTrack(track.id, { color: COLORS[(idx + 1) % COLORS.length] })
  }

  return (
    <div
      className={`track-header ${isSelected ? 'selected' : ''}`}
      style={{ height: track.height, borderLeftColor: track.color }}
      onClick={() => selectTrack(track.id)}
    >
      <div className="track-header-top">
        <div className="track-color-dot" style={{ background: track.color }} onClick={e => { e.stopPropagation(); cycleColor() }} title="Click to change color" />
        <span className="track-type-badge">{TYPE_ICON[track.type]} {track.type.toUpperCase()}</span>
        <input
          ref={nameRef}
          className="track-name-input"
          defaultValue={track.name}
          onBlur={e => updateTrack(track.id, { name: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onClick={e => e.stopPropagation()}
        />
        {!isMaster && (
          <button className="track-x" onClick={e => { e.stopPropagation(); removeTrack(track.id) }} title="Delete track">✕</button>
        )}
      </div>

      <div className="track-header-controls">
        <button className={`track-btn ${track.muted ? 'muted' : ''}`} onClick={e => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }} title="Mute (M)">M</button>
        <button className={`track-btn ${track.solo ? 'soloed' : ''}`} onClick={e => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }) }} title="Solo (S)">S</button>
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
          onChange={e => {
            e.stopPropagation()
            const v = parseInt(e.target.value) / 100
            updateTrack(track.id, { volume: v })
            onVolumeChange(track.id, v)
          }}
          onClick={e => e.stopPropagation()}
          title={`Volume: ${volToDb(track.volume)} dB`}
        />
        <span className="track-db-label" title={`${volToDb(track.volume)} dB`}>{volToDb(track.volume)}</span>

        {/* Pan */}
        <input
          type="range" min={-100} max={100} step={1}
          className="track-pan-slider"
          value={Math.round(track.pan * 100)}
          onChange={e => {
            e.stopPropagation()
            const v = parseInt(e.target.value) / 100
            updateTrack(track.id, { pan: v })
            onPanChange(track.id, v)
          }}
          onClick={e => e.stopPropagation()}
          title={`Pan: ${panStr(track.pan)}`}
        />
        <span style={{ fontSize: 9, color: '#6b7280', minWidth: 22, textAlign: 'right' }}>{panStr(track.pan)}</span>
      </div>

      {track.plugins.length > 0 && (
        <div className="plugin-badge">FX {track.plugins.length}</div>
      )}
    </div>
  )
}

export function TrackList({ onVolumeChange, onPanChange }: {
  onVolumeChange: (id: string, v: number) => void
  onPanChange: (id: string, v: number) => void
}) {
  const { tracks, addTrack } = useProjectStore()

  return (
    <div className="track-list">
      <div className="track-list-header">
        <button className="add-track-btn" onClick={() => addTrack('audio')}>+ Audio</button>
        <button className="add-track-btn" onClick={() => addTrack('midi')}>+ MIDI</button>
        <button className="add-track-btn" onClick={() => addTrack('bus')}>+ Bus</button>
      </div>
      <div className="track-list-body">
        {tracks.map(track => (
          <TrackHeader key={track.id} track={track} onVolumeChange={onVolumeChange} onPanChange={onPanChange} />
        ))}
      </div>
    </div>
  )
}
