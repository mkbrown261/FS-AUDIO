import React, { useRef, useCallback } from 'react'
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

// SVG icons for track types — inline to avoid emoji
function AudioIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect x="0" y="3" width="3" height="4" rx="1"/>
      <path d="M4 1 L4 9 L7 7 L7 3 Z"/>
      <path d="M8 3 Q10 5 8 7" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}
function MidiIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect x="0" y="2" width="2" height="6" rx="1"/>
      <rect x="3" y="4" width="2" height="4" rx="1"/>
      <rect x="6" y="1" width="2" height="7" rx="1"/>
    </svg>
  )
}
function BusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <circle cx="3" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="5" y1="5" x2="5" y2="5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 5 L5 5 L7 5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  )
}
function MasterIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <polygon points="5,1 6.2,3.8 9,4.1 7,6 7.6,9 5,7.5 2.4,9 3,6 1,4.1 3.8,3.8"/>
    </svg>
  )
}

function TrackTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'audio': return <AudioIcon />
    case 'midi': return <MidiIcon />
    case 'bus': return <BusIcon />
    case 'master': return <MasterIcon />
    default: return null
  }
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

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startHeight = track.height

    const mv = (me: MouseEvent) => {
      const dy = me.clientY - startY
      const newHeight = Math.max(56, Math.min(200, startHeight + dy))
      updateTrack(track.id, { height: newHeight })
    }
    const up = () => {
      window.removeEventListener('mousemove', mv)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }, [track.id, track.height, updateTrack])

  return (
    <div
      className={`track-header ${isSelected ? 'selected' : ''}`}
      style={{ height: track.height, borderLeftColor: track.color }}
      onClick={() => selectTrack(track.id)}
    >
      <div className="track-header-top">
        <div className="track-color-dot" style={{ background: track.color }} onClick={e => { e.stopPropagation(); cycleColor() }} title="Click to change color" />
        <span className="track-type-badge"><TrackTypeIcon type={track.type} /> {track.type.toUpperCase()}</span>
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
            title="Record arm"
          >
            <svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3" fill="currentColor"/></svg>
          </button>
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

      {/* Resize handle — drag to change track height */}
      <div
        className="track-resize-handle"
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize track"
      />
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
