/**
 * GlobalTracksBar — Logic Pro-style global tracks area
 *
 * Renders three lanes above the track list:
 *   1. Tempo lane   — tempo map breakpoints with BPM labels
 *   2. Key lane     — key/scale changes along the timeline
 *   3. Signature lane — time-signature changes
 *
 * Clicking on a lane adds a new event at that beat position.
 * Events can be dragged left/right or right-clicked to delete.
 */

import React, { useCallback, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'

interface GlobalTracksBarProps {
  pixelsPerBeat: number
  scrollLeft: number
  totalWidth: number
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const SCALE_NAMES = ['Major','Minor','Dorian','Phrygian','Lydian','Mixolydian','Locrian','Pent. Maj','Pent. Min','Blues','Chromatic']
const SIG_OPTIONS = ['2/4','3/4','4/4','5/4','6/4','6/8','7/8','12/8']

const LANE_H = 22

// ── Key change event type (stored locally — can be persisted later) ─────────
interface KeyEvent { id: string; beat: number; root: number; scale: string }
interface SigEvent { id: string; beat: number; num: number; den: number }

export function GlobalTracksBar({ pixelsPerBeat, scrollLeft, totalWidth }: GlobalTracksBarProps) {
  const {
    bpm, setBpm,
    tempoMap, addTempoPoint, updateTempoPoint, removeTempoPoint,
  } = useProjectStore()

  // Key and signature events — local state (can be promoted to store later)
  const [keyEvents, setKeyEvents] = useState<KeyEvent[]>([
    { id: 'key-0', beat: 0, root: 0, scale: 'Major' },
  ])
  const [sigEvents, setSigEvents] = useState<SigEvent[]>([
    { id: 'sig-0', beat: 0, num: 4, den: 4 },
  ])

  const [editingTempo, setEditingTempo] = useState<string | null>(null)
  const [tempoBpmInput, setTempoBpmInput] = useState('')

  // ── Helper: beat → pixel ────────────────────────────────────────────────
  const beatToPx = (beat: number) => beat * pixelsPerBeat - scrollLeft

  // ── Snap click to 1-beat grid ───────────────────────────────────────────
  const xToBeat = useCallback((clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left + scrollLeft
    return Math.round(x / pixelsPerBeat)
  }, [pixelsPerBeat, scrollLeft])

  // ── Tempo lane click: add tempo point ──────────────────────────────────
  const handleTempoClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.gt-event')) return
    const beat = xToBeat(e.clientX, e.currentTarget.getBoundingClientRect())
    if (beat <= 0) return // don't add before beat 0
    addTempoPoint(beat, bpm)
  }, [xToBeat, bpm, addTempoPoint])

  // ── Tempo event drag ───────────────────────────────────────────────────
  const startTempoDrag = useCallback((e: React.MouseEvent, id: string, origBeat: number) => {
    e.stopPropagation()
    const startX = e.clientX
    const mv = (me: MouseEvent) => {
      const dx = (me.clientX - startX) / pixelsPerBeat
      updateTempoPoint(id, { beat: Math.max(0.01, origBeat + dx) })
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }, [pixelsPerBeat, updateTempoPoint])

  // ── Key lane click: add key event ──────────────────────────────────────
  const handleKeyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.gt-event')) return
    const beat = xToBeat(e.clientX, e.currentTarget.getBoundingClientRect())
    if (beat <= 0) return
    setKeyEvents(prev => [...prev, { id: `key-${Date.now()}`, beat, root: 0, scale: 'Major' }].sort((a, b) => a.beat - b.beat))
  }, [xToBeat])

  // ── Signature lane click ─────────────────────────────────────────────
  const handleSigClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.gt-event')) return
    const beat = xToBeat(e.clientX, e.currentTarget.getBoundingClientRect())
    if (beat <= 0) return
    setSigEvents(prev => [...prev, { id: `sig-${Date.now()}`, beat, num: 4, den: 4 }].sort((a, b) => a.beat - b.beat))
  }, [xToBeat])

  // ── Global BPM display at beat 0 ────────────────────────────────────
  const globalTempoEvent = { id: 'global', beat: 0, bpm }

  return (
    <div style={{
      width: totalWidth,
      minWidth: '100%',
      userSelect: 'none',
      borderBottom: '2px solid rgba(255,255,255,0.08)',
      background: 'rgba(0,0,0,0.25)',
      overflow: 'hidden',
    }}>

      {/* ── TEMPO LANE ──────────────────────────────────────────────── */}
      <div
        style={{ height: LANE_H, position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'crosshair' }}
        onClick={handleTempoClick}
      >
        {/* Lane label */}
        <div style={{ position: 'sticky', left: 0, zIndex: 10, display: 'inline-flex', alignItems: 'center', height: LANE_H, paddingLeft: 6, paddingRight: 8, background: 'rgba(15,15,26,0.9)', borderRight: '1px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, pointerEvents: 'none' }}>
          TEMPO
        </div>

        {/* Global BPM node at beat 0 */}
        <TempoNode
          beat={globalTempoEvent.beat}
          bpm={globalTempoEvent.bpm}
          px={beatToPx(0)}
          isGlobal
          onDblClick={() => {
            const v = prompt('Global BPM:', String(bpm))
            const n = parseFloat(v ?? '')
            if (!isNaN(n) && n > 0) setBpm(n)
          }}
        />

        {/* Tempo map points */}
        {tempoMap.map(tp => {
          const px = beatToPx(tp.beat)
          if (px < -40 || px > totalWidth + 40) return null
          return (
            <TempoNode
              key={tp.id}
              beat={tp.beat}
              bpm={tp.bpm}
              px={px}
              onDrag={e => startTempoDrag(e, tp.id, tp.beat)}
              onDblClick={() => {
                const v = prompt(`BPM at beat ${tp.beat.toFixed(1)}:`, String(tp.bpm))
                const n = parseFloat(v ?? '')
                if (!isNaN(n) && n > 0) updateTempoPoint(tp.id, { bpm: n })
              }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); removeTempoPoint(tp.id) }}
            />
          )
        })}

        {/* Tempo ramp lines between points */}
        {(() => {
          const allPts = [{ beat: 0, bpm }, ...tempoMap].sort((a, b) => a.beat - b.beat)
          if (allPts.length < 2) return null
          const maxBpm = Math.max(...allPts.map(p => p.bpm))
          const minBpm = Math.min(...allPts.map(p => p.bpm))
          const range = maxBpm - minBpm || 1
          const pts = allPts.map(p => {
            const x = beatToPx(p.beat)
            const y = LANE_H - 4 - ((p.bpm - minBpm) / range) * (LANE_H - 10)
            return `${x},${y}`
          }).join(' ')
          return (
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: LANE_H, pointerEvents: 'none' }}>
              <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.4} />
            </svg>
          )
        })()}
      </div>

      {/* ── KEY LANE ──────────────────────────────────────────────────── */}
      <div
        style={{ height: LANE_H, position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'crosshair' }}
        onClick={handleKeyClick}
      >
        <div style={{ position: 'sticky', left: 0, zIndex: 10, display: 'inline-flex', alignItems: 'center', height: LANE_H, paddingLeft: 6, paddingRight: 8, background: 'rgba(15,15,26,0.9)', borderRight: '1px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, pointerEvents: 'none' }}>
          KEY
        </div>

        {keyEvents.map((kev, idx) => {
          const px = beatToPx(kev.beat)
          if (px < -80 || px > totalWidth + 80) return null
          const nextPx = idx + 1 < keyEvents.length ? beatToPx(keyEvents[idx + 1].beat) : totalWidth + scrollLeft
          const barW = Math.max(60, nextPx - px - 1)
          return (
            <div key={kev.id} className="gt-event"
              style={{ position: 'absolute', left: px, top: 2, height: LANE_H - 4, width: barW, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3, paddingLeft: 4, overflow: 'hidden', cursor: 'grab' }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (kev.id !== 'key-0') setKeyEvents(p => p.filter(k => k.id !== kev.id)) }}
            >
              <select value={kev.root} onChange={e => setKeyEvents(p => p.map(k => k.id === kev.id ? { ...k, root: Number(e.target.value) } : k))}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 9, background: 'transparent', border: 'none', color: '#10b981', fontWeight: 700, cursor: 'pointer', outline: 'none', maxWidth: 28 }}>
                {NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
              </select>
              <select value={kev.scale} onChange={e => setKeyEvents(p => p.map(k => k.id === kev.id ? { ...k, scale: e.target.value } : k))}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 9, background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', outline: 'none', maxWidth: 70 }}>
                {SCALE_NAMES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )
        })}
      </div>

      {/* ── TIME SIGNATURE LANE ──────────────────────────────────────── */}
      <div
        style={{ height: LANE_H, position: 'relative', cursor: 'crosshair' }}
        onClick={handleSigClick}
      >
        <div style={{ position: 'sticky', left: 0, zIndex: 10, display: 'inline-flex', alignItems: 'center', height: LANE_H, paddingLeft: 6, paddingRight: 8, background: 'rgba(15,15,26,0.9)', borderRight: '1px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, pointerEvents: 'none' }}>
          TIME
        </div>

        {sigEvents.map((sev, idx) => {
          const px = beatToPx(sev.beat)
          if (px < -80 || px > totalWidth + 80) return null
          const nextPx = idx + 1 < sigEvents.length ? beatToPx(sigEvents[idx + 1].beat) : totalWidth + scrollLeft
          const barW = Math.max(50, nextPx - px - 1)
          return (
            <div key={sev.id} className="gt-event"
              style={{ position: 'absolute', left: px, top: 2, height: LANE_H - 4, width: barW, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 4, overflow: 'hidden', cursor: 'grab' }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (sev.id !== 'sig-0') setSigEvents(p => p.filter(s => s.id !== sev.id)) }}
            >
              <select value={`${sev.num}/${sev.den}`}
                onChange={e => {
                  const [n, d] = e.target.value.split('/').map(Number)
                  setSigEvents(p => p.map(s => s.id === sev.id ? { ...s, num: n, den: d } : s))
                }}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 9, background: 'transparent', border: 'none', color: '#a855f7', fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
                {SIG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tempo node sub-component ────────────────────────────────────────────────
interface TempoNodeProps {
  beat: number
  bpm: number
  px: number
  isGlobal?: boolean
  onDrag?: (e: React.MouseEvent) => void
  onDblClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function TempoNode({ bpm, px, isGlobal, onDrag, onDblClick, onContextMenu }: TempoNodeProps) {
  return (
    <div
      className="gt-event"
      style={{
        position: 'absolute',
        left: px,
        top: 2,
        height: LANE_H - 4,
        minWidth: 36,
        paddingLeft: isGlobal ? 48 : 4,
        paddingRight: 4,
        background: isGlobal ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.2)',
        border: `1px solid rgba(245,158,11,${isGlobal ? 0.15 : 0.5})`,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        cursor: isGlobal ? 'default' : 'grab',
        zIndex: isGlobal ? 1 : 2,
      }}
      onMouseDown={!isGlobal ? onDrag : undefined}
      onDoubleClick={onDblClick}
      onContextMenu={onContextMenu}
      title={isGlobal ? `Global BPM: ${bpm} — dbl-click to change` : `${bpm} BPM — drag to move, dbl-click to edit, right-click to delete`}
    >
      <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', whiteSpace: 'nowrap' }}>
        {isGlobal ? '♩=' : ''}{bpm}
      </span>
    </div>
  )
}
