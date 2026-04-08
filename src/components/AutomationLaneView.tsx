/**
 * AutomationLaneView — per-track automation drawing/editing
 * Renders below each track lane in the Timeline.
 * Supports draw (pencil), erase, and pointer (drag) modes.
 */
import React, { useRef, useCallback, useState } from 'react'
import {
  useProjectStore,
  AutomationLane,
  AutomationCurve,
} from '../store/projectStore'

// ── Automation parameter presets ──────────────────────────────────────────────
export const AUTOMATION_PARAMS = [
  { param: 'volume',  label: 'Volume',   min: 0,    max: 1,    default: 0.8  },
  { param: 'pan',     label: 'Pan',      min: -1,   max: 1,    default: 0    },
  { param: 'eq-low',  label: 'EQ Low',   min: -18,  max: 18,   default: 0    },
  { param: 'eq-mid',  label: 'EQ Mid',   min: -18,  max: 18,   default: 0    },
  { param: 'eq-high', label: 'EQ High',  min: -18,  max: 18,   default: 0    },
  { param: 'reverb',  label: 'Reverb',   min: 0,    max: 1,    default: 0    },
  { param: 'delay',   label: 'Delay',    min: 0,    max: 1,    default: 0    },
  { param: 'chorus',  label: 'Chorus',   min: 0,    max: 1,    default: 0    },
  { param: 'bitcrs',  label: 'Bitcrush', min: 0,    max: 1,    default: 0    },
]

const LANE_HEIGHT = 60

// ── Interpolate automation value at a given beat ───────────────────────────────
export function interpolateAutomation(lane: AutomationLane, beat: number): number {
  const pts = lane.points
  if (pts.length === 0) return lane.defaultValue
  if (pts.length === 1) return pts[0].value
  if (beat <= pts[0].beat) return pts[0].value
  if (beat >= pts[pts.length - 1].beat) return pts[pts.length - 1].value

  // Find surrounding points
  let lo = 0
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].beat <= beat && beat <= pts[i + 1].beat) { lo = i; break }
  }
  const a = pts[lo], b = pts[lo + 1]
  const t = (beat - a.beat) / (b.beat - a.beat)

  switch (lane.curve) {
    case 'step':   return a.value
    case 'smooth': { const s = t * t * (3 - 2 * t); return a.value + (b.value - a.value) * s }
    default:       return a.value + (b.value - a.value) * t // linear
  }
}

// ── Add Lane Button ───────────────────────────────────────────────────────────
export function AddAutomationLaneButton({ trackId }: { trackId: string }) {
  const { addAutomationLane, automationLanes } = useProjectStore()
  const [open, setOpen] = useState(false)

  // Check which params already have lanes for this track
  const existing = new Set(automationLanes.filter(l => l.trackId === trackId).map(l => l.param))

  function add(p: typeof AUTOMATION_PARAMS[0]) {
    if (existing.has(p.param)) return
    addAutomationLane({
      trackId,
      param: p.param,
      label: p.label,
      minValue: p.min,
      maxValue: p.max,
      defaultValue: p.default,
      curve: 'linear',
    })
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="auto-add-btn"
        onClick={() => setOpen(o => !o)}
        title="Add automation lane"
      >
        + Auto
      </button>
      {open && (
        <div className="auto-param-menu">
          {AUTOMATION_PARAMS.map(p => (
            <div
              key={p.param}
              className={`auto-param-option ${existing.has(p.param) ? 'auto-param-used' : ''}`}
              onClick={() => add(p)}
            >
              {p.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Single Automation Lane ────────────────────────────────────────────────────
interface AutomationLaneViewProps {
  lane: AutomationLane
  pixelsPerBeat: number
  scrollLeft: number
  totalBeats: number
  activeTool: string
}

export function AutomationLaneView({
  lane,
  pixelsPerBeat,
  scrollLeft,
  totalBeats,
  activeTool,
}: AutomationLaneViewProps) {
  const {
    addAutomationPoint,
    removeAutomationPoint,
    updateAutomationPoint,
    removeAutomationLane,
    setAutomationCurve,
    toggleAutomationLane,
  } = useProjectStore()

  const svgRef = useRef<SVGSVGElement>(null)
  // dragRef tracks an existing point being dragged: its original beat (key into store)
  const dragRef = useRef<{ origBeat: number; isDraggingExisting: boolean } | null>(null)

  const W = totalBeats * pixelsPerBeat
  const H = LANE_HEIGHT

  // Convert px → beat (accounting for scrollLeft)
  const pxToBeat = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, (clientX - rect.left + scrollLeft) / pixelsPerBeat)
  }

  // Convert normalized value → Y pixel
  const valToY = (v: number) => {
    const norm = (v - lane.minValue) / (lane.maxValue - lane.minValue)
    return H - norm * (H - 4) - 2
  }
  const yToVal = (y: number) => {
    const norm = 1 - (y - 2) / (H - 4)
    return Math.max(lane.minValue, Math.min(lane.maxValue, lane.minValue + norm * (lane.maxValue - lane.minValue)))
  }

  // Build SVG path from points
  const buildPath = () => {
    if (lane.points.length === 0) return ''
    const pts = lane.points
    const parts: string[] = []

    const firstX = pts[0].beat * pixelsPerBeat - scrollLeft
    const firstY = valToY(pts[0].value)
    parts.push(`M ${firstX} ${firstY}`)

    for (let i = 1; i < pts.length; i++) {
      const x = pts[i].beat * pixelsPerBeat - scrollLeft
      const y = valToY(pts[i].value)
      if (lane.curve === 'step') {
        parts.push(`H ${x} V ${y}`)
      } else if (lane.curve === 'smooth') {
        const prevX = pts[i - 1].beat * pixelsPerBeat - scrollLeft
        const prevY = valToY(pts[i - 1].value)
        const cpx = (prevX + x) / 2
        parts.push(`C ${cpx} ${prevY} ${cpx} ${y} ${x} ${y}`)
      } else {
        parts.push(`L ${x} ${y}`)
      }
    }
    return parts.join(' ')
  }

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const beat = pxToBeat(e.clientX)
    const rect = svgRef.current!.getBoundingClientRect()
    const y = e.clientY - rect.top
    const value = yToVal(y)

    if (activeTool === 'scissors') {
      // Erase: find nearest point within 12px
      const nearest = lane.points.find(p => {
        const px = p.beat * pixelsPerBeat - scrollLeft
        return Math.abs(px - (e.clientX - rect.left)) < 12
      })
      if (nearest) removeAutomationPoint(lane.id, nearest.beat)
      return
    }

    if (activeTool === 'pencil' || activeTool === 'pointer') {
      // Check if clicking near an existing point — if so, drag it
      const existing = lane.points.find(p => {
        const px = p.beat * pixelsPerBeat - scrollLeft
        const py = valToY(p.value)
        return Math.abs(px - (e.clientX - rect.left)) < 8 && Math.abs(py - y) < 8
      })
      if (existing) {
        dragRef.current = { origBeat: existing.beat, isDraggingExisting: true }
      } else {
        // Draw new point
        addAutomationPoint(lane.id, { beat, value })
        dragRef.current = { origBeat: beat, isDraggingExisting: false }
      }
    }
  }, [activeTool, lane, pixelsPerBeat, scrollLeft, addAutomationPoint, removeAutomationPoint])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    if (activeTool !== 'pencil' && activeTool !== 'pointer') return
    const beat = pxToBeat(e.clientX)
    const rect = svgRef.current!.getBoundingClientRect()
    const y = e.clientY - rect.top
    const value = yToVal(y)

    if (dragRef.current.isDraggingExisting) {
      // Drag existing point: update its value (keep beat) OR move to new beat
      // We update both beat and value by removing+adding (store deduplicates by beat proximity)
      updateAutomationPoint(lane.id, dragRef.current.origBeat, value)
    } else {
      // Pencil draw: add points as we move
      addAutomationPoint(lane.id, { beat, value })
      dragRef.current = { origBeat: beat, isDraggingExisting: false }
    }
  }, [activeTool, lane, pixelsPerBeat, scrollLeft, addAutomationPoint, updateAutomationPoint])

  const handleMouseUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const path = buildPath()
  const defaultY = valToY(lane.defaultValue)

  // Value display for label
  const formatVal = (v: number) => {
    if (lane.param === 'volume') return `${Math.round(v * 100)}%`
    if (lane.param === 'pan') return v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`
    if (lane.param.startsWith('eq-')) return `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`
    return v.toFixed(2)
  }

  return (
    <div className="auto-lane">
      {/* Header */}
      <div className="auto-lane-header">
        <button className="auto-lane-vis" onClick={() => toggleAutomationLane(lane.id)} title="Hide/show lane">
          {lane.visible ? '▾' : '▸'}
        </button>
        <span className="auto-lane-label">{lane.label}</span>
        {lane.points.length > 0 && (
          <span className="auto-lane-pts">{lane.points.length} pt{lane.points.length !== 1 ? 's' : ''}</span>
        )}
        <div className="auto-curve-btns">
          {(['linear', 'smooth', 'step'] as AutomationCurve[]).map(c => (
            <button
              key={c}
              className={`auto-curve-btn ${lane.curve === c ? 'active' : ''}`}
              onClick={() => setAutomationCurve(lane.id, c)}
              title={`Curve: ${c}`}
            >
              {c === 'linear' ? '/' : c === 'smooth' ? '∿' : '⊓'}
            </button>
          ))}
        </div>
        {lane.points.length > 0 && (
          <button
            className="auto-lane-clear"
            onClick={() => {
              // Remove all points by rebuilding lane (remove + re-add without points)
              const pts = [...lane.points]
              pts.forEach(p => removeAutomationPoint(lane.id, p.beat))
            }}
            title="Clear all points"
          >⌫</button>
        )}
        <button className="auto-lane-del" onClick={() => removeAutomationLane(lane.id)} title="Delete lane">✕</button>
      </div>

      {/* Drawing canvas */}
      {lane.visible && (
        <div className="auto-lane-canvas-wrap" style={{ height: H }}>
          <svg
            ref={svgRef}
            width={W}
            height={H}
            className="auto-lane-svg"
            style={{ cursor: activeTool === 'scissors' ? 'crosshair' : activeTool === 'pencil' ? 'cell' : 'default' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Background grid lines */}
            <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />

            {/* Default value line */}
            <line x1={0} y1={defaultY} x2={W} y2={defaultY} stroke="rgba(168,85,247,0.2)" strokeWidth={1} strokeDasharray="4 4" />

            {/* Automation curve fill */}
            {path && lane.points.length >= 2 && (
              <path
                d={`${path} L ${lane.points[lane.points.length - 1].beat * pixelsPerBeat - scrollLeft} ${H} L ${lane.points[0].beat * pixelsPerBeat - scrollLeft} ${H} Z`}
                fill="rgba(168,85,247,0.07)"
              />
            )}

            {/* Automation curve line */}
            {path && (
              <path
                d={path}
                fill="none"
                stroke="rgba(168,85,247,0.85)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Control points */}
            {lane.points.map((p, i) => {
              const cx = p.beat * pixelsPerBeat - scrollLeft
              const cy = valToY(p.value)
              if (cx < -8 || cx > W + 8) return null
              return (
                <g key={i}>
                  <circle
                    cx={cx} cy={cy} r={5}
                    fill="#a855f7"
                    stroke="#fff"
                    strokeWidth={1.5}
                    style={{ cursor: activeTool === 'scissors' ? 'pointer' : 'grab' }}
                    onMouseDown={e => {
                      e.stopPropagation()
                      if (activeTool === 'scissors') {
                        removeAutomationPoint(lane.id, p.beat)
                      } else {
                        dragRef.current = { origBeat: p.beat, isDraggingExisting: true }
                      }
                    }}
                  />
                  {/* Value tooltip on hover */}
                  <title>{formatVal(p.value)} @ beat {p.beat.toFixed(2)}</title>
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </div>
  )
}
