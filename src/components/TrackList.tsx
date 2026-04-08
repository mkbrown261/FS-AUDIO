import React, { useRef, useCallback, useState } from 'react'
import { useProjectStore, Track } from '../store/projectStore'
import { AddAutomationLaneButton } from './AutomationLaneView'

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

// ── Drag-reorder state (shared between TrackHeader and TrackList) ─────────────
interface DragState {
  dragIdx: number
  overIdx: number
}

function TrackHeader({
  track, idx, dragState, onDragStart, onDragOver, onDragEnd,
  onVolumeChange, onPanChange, onArmClick, onFreezeTrack,
  isFreezing, freezeProgress,
}: {
  track: Track
  idx: number
  dragState: DragState | null
  onDragStart: (idx: number) => void
  onDragOver: (idx: number) => void
  onDragEnd: () => void
  onVolumeChange: (id: string, v: number) => void
  onPanChange: (id: string, v: number) => void
  onArmClick: (trackId: string) => void
  onFreezeTrack?: (trackId: string) => void
  isFreezing?: boolean
  freezeProgress?: number
}) {
  const { updateTrack, removeTrack, selectTrack, selectedTrackId } = useProjectStore()
  const nameRef = useRef<HTMLInputElement>(null)
  const isMaster = track.type === 'master'
  const isSelected = selectedTrackId === track.id

  // Visual drag feedback
  const isDragging = dragState?.dragIdx === idx
  const isDropTarget = dragState !== null && dragState.overIdx === idx && dragState.dragIdx !== idx
  const dropAbove = isDropTarget && dragState!.overIdx < dragState!.dragIdx
  const dropBelow = isDropTarget && dragState!.overIdx > dragState!.dragIdx

  function cycleColor() {
    const cidx = COLORS.indexOf(track.color)
    updateTrack(track.id, { color: COLORS[(cidx + 1) % COLORS.length] })
  }

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startHeight = track.height
    const mv = (me: MouseEvent) => {
      updateTrack(track.id, { height: Math.max(56, Math.min(200, startHeight + (me.clientY - startY))) })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }, [track.id, track.height, updateTrack])

  return (
    <div
      className={`track-header${isSelected ? ' selected' : ''}${isDragging ? ' track-dragging' : ''}${dropAbove ? ' track-drop-above' : ''}${dropBelow ? ' track-drop-below' : ''}`}
      style={{ height: track.height, borderLeftColor: track.color }}
      onClick={() => selectTrack(track.id)}
      onDragOver={e => { e.preventDefault(); onDragOver(idx) }}
    >
      <div className="track-header-top">
        {/* Drag handle — only non-master tracks are reorderable */}
        {!isMaster && (
          <div
            className="track-drag-handle"
            draggable
            onDragStart={e => { e.stopPropagation(); onDragStart(idx) }}
            onDragEnd={onDragEnd}
            title="Drag to reorder track"
          >
            <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" opacity="0.4">
              <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
              <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
              <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
            </svg>
          </div>
        )}

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
        {!isMaster && track.type === 'audio' && (
          <button
            className={`track-btn freeze-btn ${track.frozen ? 'frozen' : ''} ${isFreezing ? 'freezing' : ''}`}
            onClick={e => { e.stopPropagation(); if (!isFreezing) onFreezeTrack?.(track.id) }}
            disabled={isFreezing}
            title={isFreezing ? `Freezing… ${Math.round((freezeProgress ?? 0) * 100)}%` : track.frozen ? 'Unfreeze track' : 'Freeze track'}
          >
            {isFreezing ? (
              // Spinning arc while rendering
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="4.5" cy="4.5" r="3.5" strokeOpacity="0.2"/>
                <path d="M4.5 1A3.5 3.5 0 0 1 8 4.5" strokeLinecap="round"
                  style={{ animation: 'ap-spin .7s linear infinite' }}/>
              </svg>
            ) : track.frozen ? (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                <path d="M4 0v8M0 4h8M1.2 1.2l5.6 5.6M6.8 1.2L1.2 6.8" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              </svg>
            ) : (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M4 0.5V7.5M2 2L4 0.5L6 2M2 6L4 7.5L6 6M0.5 4H7.5M0.5 2.5L2 4L0.5 5.5M7.5 2.5L6 4L7.5 5.5"/>
              </svg>
            )}
          </button>
        )}
        {/* Freeze progress bar — appears below controls while freezing */}
        {isFreezing && (
          <div className="track-freeze-progress">
            <div className="track-freeze-bar" style={{ width: `${Math.round((freezeProgress ?? 0) * 100)}%` }} />
          </div>
        )}
        {!isMaster && (
          <button
            className={`track-btn arm-btn ${track.armed ? 'armed' : ''}`}
            onClick={e => { e.stopPropagation(); onArmClick(track.id) }}
            title="Record arm"
          >
            <svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3" fill="currentColor"/></svg>
          </button>
        )}

        {/* Automation lane add button */}
        {!isMaster && (
          <AddAutomationLaneButton trackId={track.id} />
        )}

        {/* Volume */}
        <input
          type="range" min={0} max={125} step={1}
          className="track-vol-slider"
          id={`vol-${track.id}`}
          value={Math.round(track.volume * 100)}
          onChange={e => {
            e.stopPropagation()
            const v = parseInt(e.target.value) / 100
            console.log('[TrackList] 🔊 VOLUME slider changed:', track.name, 'value=', e.target.value, 'volume=', v)
            updateTrack(track.id, { volume: v })
            onVolumeChange(track.id, v)
          }}
          onInput={e => {
            console.log('[TrackList] 🔊 VOLUME input event:', track.name, 'value=', (e.target as HTMLInputElement).value)
          }}
          onClick={e => e.stopPropagation()}
          title={`Volume: ${volToDb(track.volume)} dB`}
        />
        <span className="track-db-label" title={`${volToDb(track.volume)} dB`}>{volToDb(track.volume)}</span>

        {/* Pan */}
        <input
          type="range" min={-100} max={100} step={1}
          className="track-pan-slider"
          id={`pan-${track.id}`}
          value={Math.round(track.pan * 100)}
          onChange={e => {
            e.stopPropagation()
            const v = parseInt(e.target.value) / 100
            console.log('[TrackList] 🎚️ PAN slider changed:', track.name, 'value=', e.target.value, 'pan=', v)
            updateTrack(track.id, { pan: v })
            onPanChange(track.id, v)
          }}
          onInput={e => {
            console.log('[TrackList] 🎚️ PAN input event:', track.name, 'value=', (e.target as HTMLInputElement).value)
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

export function TrackList({ onVolumeChange, onPanChange, onArmClick, onFreezeTrack, freezingTrackId, freezeProgress, width }: {
  onVolumeChange: (id: string, v: number) => void
  onPanChange: (id: string, v: number) => void
  onArmClick: (trackId: string) => void
  onFreezeTrack?: (trackId: string) => void
  freezingTrackId?: string | null
  freezeProgress?: number
  width?: number
}) {
  const { tracks, addTrack, moveTrack } = useProjectStore()
  const [dragState, setDragState] = useState<DragState | null>(null)

  function handleDragStart(idx: number) {
    setDragState({ dragIdx: idx, overIdx: idx })
  }

  function handleDragOver(idx: number) {
    if (!dragState) return
    if (dragState.overIdx !== idx) setDragState({ ...dragState, overIdx: idx })
  }

  function handleDragEnd() {
    if (dragState && dragState.dragIdx !== dragState.overIdx) {
      moveTrack(dragState.dragIdx, dragState.overIdx)
    }
    setDragState(null)
  }

  return (
    <div
      className="track-list"
      style={width !== undefined ? { width: '100%' } : undefined}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDragEnd}
    >
      <div className="track-list-header">
        <button className="add-track-btn" onClick={() => addTrack('audio')}>+ Audio</button>
        <button className="add-track-btn" onClick={() => addTrack('midi')}>+ MIDI</button>
        <button className="add-track-btn" onClick={() => addTrack('bus')}>+ Bus</button>
      </div>
      <div className="track-list-body">
        {tracks.map((track, idx) => (
          <TrackHeader
            key={track.id}
            track={track}
            idx={idx}
            dragState={dragState}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onVolumeChange={onVolumeChange}
            onPanChange={onPanChange}
            onArmClick={onArmClick}
            onFreezeTrack={onFreezeTrack}
            isFreezing={freezingTrackId === track.id}
            freezeProgress={freezingTrackId === track.id ? freezeProgress : 0}
          />
        ))}
      </div>
    </div>
  )
}
