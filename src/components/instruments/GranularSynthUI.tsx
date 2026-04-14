/**
 * FS-AUDIO Granular Synthesizer UI
 * Texture / cloud generator with sample loading and grain controls.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'

// ── Helpers ─────────────────────────────────────────────────────────────────
const pn = (v: string | number | undefined, def: number): number => Number(v ?? def) || def

// ── Knob ────────────────────────────────────────────────────────────────────
interface KnobProps {
  label: string; value: number; min: number; max: number
  step?: number; unit?: string; size?: number; color?: string
  onChange: (v: number) => void
}
const Knob: React.FC<KnobProps> = ({ label, value, min, max, step = 0.01, unit = '', size = 44, color = '#10b981', onChange }) => {
  const dragging = useRef(false)
  const startY = useRef(0)
  const startVal = useRef(0)

  const norm = (max === min) ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = -140 + norm * 280

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startVal.current = value
    const move = (me: MouseEvent) => {
      if (!dragging.current) return
      const dy = startY.current - me.clientY
      const range = max - min
      let nv = startVal.current + dy * (range / 180)
      nv = Math.max(min, Math.min(max, nv))
      nv = step >= 1 ? Math.round(nv / step) * step : Math.round(nv / step) * step
      onChange(nv)
    }
    const up = () => { dragging.current = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const dispVal = step >= 1 ? Math.round(value).toString() : value.toFixed(step < 0.01 ? 3 : 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, userSelect: 'none' }}>
      <div
        onMouseDown={onDown}
        title={`${label}: ${dispVal}${unit}`}
        style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${color} 0deg, ${color} ${norm * 280 + 40}deg, rgba(255,255,255,0.07) ${norm * 280 + 40}deg 360deg)`, cursor: 'ns-resize', position: 'relative', boxShadow: `0 0 6px ${color}55` }}
      >
        <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 2, height: size * 0.28, background: color, borderRadius: 1, transformOrigin: 'bottom center', transform: `rotate(${angle}deg) translateY(-30%)` }} />
        </div>
      </div>
      <div style={{ fontSize: 9, color: '#94a3b8', letterSpacing: '.04em', textAlign: 'center', lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 9, color, fontFamily: 'monospace', fontWeight: 700 }}>{dispVal}{unit}</div>
    </div>
  )
}

// ── Toggle Button ───────────────────────────────────────────────────────────
function Toggle({ label, value, color, onChange }: { label: string; value: boolean; color: string; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{ background: value ? color : 'rgba(255,255,255,0.05)', border: `1px solid ${value ? color : 'rgba(255,255,255,0.12)'}`, borderRadius: 5, padding: '4px 10px', color: value ? '#fff' : '#64748b', fontSize: 10, cursor: 'pointer', fontWeight: 700, letterSpacing: '.06em', transition: 'all 0.15s' }}
    >
      {label}
    </button>
  )
}

// ── Section Label ───────────────────────────────────────────────────────────
function SL({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 3, marginBottom: 8 }}>
      {children}
    </div>
  )
}

// ── Position Scrubber ───────────────────────────────────────────────────────
function PositionBar({ position, freeze, color, onChange }: { position: number; freeze: boolean; color: string; onChange: (v: number) => void }) {
  const barRef = useRef<HTMLDivElement>(null)

  const handleClick = (e: React.MouseEvent) => {
    if (!barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    onChange(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
  }

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      title="Playback position (click to scrub)"
      style={{ position: 'relative', height: 24, background: 'rgba(0,0,0,0.4)', borderRadius: 4, cursor: 'crosshair', overflow: 'hidden', border: `1px solid ${freeze ? '#f59e0b44' : 'rgba(255,255,255,0.08)'}` }}
    >
      {/* Track fill */}
      <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${position * 100}%`, background: `linear-gradient(90deg, ${color}33, ${color}88)`, transition: freeze ? 'none' : 'width 0.05s' }} />
      {/* Playhead needle */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${position * 100}%`, width: 2, background: freeze ? '#f59e0b' : color, boxShadow: `0 0 6px ${color}` }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#94a3b8', pointerEvents: 'none' }}>
        {freeze ? '❄ FROZEN' : `${(position * 100).toFixed(1)}%`}
      </div>
    </div>
  )
}

// ── Grain Cloud Visualizer ──────────────────────────────────────────────────
function GrainVisualizer({ density, size, spread, reverse }: { density: number; size: number; spread: number; reverse: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Draw grain cloud representation
    const grainCount = Math.min(Math.round(density * 0.6), 60)
    const grainW = Math.max(4, (size / 500) * width * 0.4)

    for (let i = 0; i < grainCount; i++) {
      const x = (Math.random() * (1 + spread / 50) - spread / 100) * width
      const y = height * 0.2 + Math.random() * height * 0.6
      const alpha = 0.15 + Math.random() * 0.5
      const isReversed = Math.random() < reverse
      const hue = isReversed ? 30 : 142   // orange for reversed, green for normal
      ctx.fillStyle = `hsla(${hue}, 80%, 55%, ${alpha})`
      ctx.beginPath()
      ctx.roundRect(x - grainW / 2, y - 2, grainW, 4, 2)
      ctx.fill()
    }
  }, [density, size, spread, reverse])

  return (
    <canvas ref={canvasRef} width={200} height={40}
      style={{ width: '100%', height: 40, borderRadius: 4, background: 'rgba(0,0,0,0.3)' }} />
  )
}

// ── Main GranularSynthUI ────────────────────────────────────────────────────
interface GranularSynthUIProps {
  params: Record<string, number | string>
  onUpdate: (params: Record<string, number | string>) => void
}

export function GranularSynthUI({ params: raw, onUpdate }: GranularSynthUIProps) {
  const set = useCallback((key: string, value: number | string) => {
    onUpdate({ ...raw, [key]: value })
  }, [raw, onUpdate])

  // Read params with defaults
  const position     = pn(raw.position,      0.5)
  const posRandom    = pn(raw.positionRandom, 0)
  const grainSize    = pn(raw.grainSize,     80)
  const density      = pn(raw.density,       20)
  const spread       = pn(raw.spread,        10)
  const pitch        = pn(raw.pitch,          0)
  const pitchRandom  = pn(raw.pitchRandom,    0)
  const pan          = pn(raw.pan,            0)
  const panRandom    = pn(raw.panRandom,      0)
  const reverse      = pn(raw.reverse,        0)
  const volume       = pn(raw.volume,        0.8)
  const mix          = pn(raw.mix,           1.0)
  const freeze       = Boolean(raw.freeze)
  const envelope     = (raw.envelope as string) || 'gaussian'

  const COLOR = '#10b981'   // emerald green brand
  const COLOR2 = '#06b6d4'  // cyan accent

  return (
    <div style={{ background: 'linear-gradient(135deg,#071212 0%,#0a1f1a 100%)', color: '#e2e8f0', borderRadius: 10, padding: 14, fontFamily: 'system-ui,sans-serif', minWidth: 500, maxWidth: 620, fontSize: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#10b981,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⋮</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>FS-Granular</div>
          <div style={{ fontSize: 9, color: '#94a3b8' }}>Sample-based granular cloud synthesis</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Toggle label="FREEZE" value={freeze} color="#f59e0b" onChange={v => set('freeze', v ? 1 : 0)} />
          <Knob label="VOL" value={volume} min={0} max={1} step={0.01} size={32} color={COLOR} onChange={v => set('volume', v)} />
        </div>
      </div>

      {/* Position scrubber */}
      <div style={{ marginBottom: 10 }}>
        <SL>Sample Position</SL>
        <PositionBar position={position} freeze={freeze} color={COLOR} onChange={v => set('position', v)} />
        <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
          <Knob label="POSITION" value={position}  min={0} max={1}    step={0.001} size={40} color={COLOR}  onChange={v => set('position', v)} />
          <Knob label="SCATTER"  value={posRandom} min={0} max={1}    step={0.01}  size={40} color={COLOR2} onChange={v => set('positionRandom', v)} />
        </div>
      </div>

      {/* Grain cloud visualizer */}
      <div style={{ marginBottom: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 8 }}>
        <SL>Grain Cloud Preview</SL>
        <GrainVisualizer density={density} size={grainSize} spread={spread} reverse={reverse} />
      </div>

      {/* Grain params */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, marginBottom: 10 }}>
        <SL>Grain</SL>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Knob label="SIZE"    value={grainSize} min={10}  max={500} step={1}   unit="ms" size={44} color={COLOR}  onChange={v => set('grainSize', v)} />
          <Knob label="DENSITY" value={density}   min={1}   max={100} step={1}   unit="/s" size={44} color={COLOR}  onChange={v => set('density', v)} />
          <Knob label="SPREAD"  value={spread}    min={0}   max={200} step={1}   unit="ms" size={44} color={COLOR2} onChange={v => set('spread', v)} />
          <Knob label="REVERSE" value={reverse}   min={0}   max={1}   step={0.01}          size={44} color="#f59e0b" onChange={v => set('reverse', v)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>ENVELOPE</span>
            <select
              value={envelope}
              onChange={e => set('envelope', e.target.value)}
              style={{ background: 'rgba(0,0,0,0.5)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}
            >
              <option value="gaussian">GAUSSIAN</option>
              <option value="linear">LINEAR</option>
              <option value="exponential">EXPONENTIAL</option>
            </select>
          </div>
        </div>
      </div>

      {/* Pitch */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, marginBottom: 10 }}>
        <SL>Pitch</SL>
        <div style={{ display: 'flex', gap: 10 }}>
          <Knob label="PITCH"   value={pitch}        min={-24} max={24} step={0.1}   unit="st" size={44} color="#a855f7" onChange={v => set('pitch', v)} />
          <Knob label="SCATTER" value={pitchRandom}  min={0}   max={100} step={1}    unit="¢"  size={44} color="#a855f7" onChange={v => set('pitchRandom', v)} />
        </div>
      </div>

      {/* Spatial + Mix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
          <SL>Spatial</SL>
          <div style={{ display: 'flex', gap: 10 }}>
            <Knob label="PAN"     value={pan}       min={-1} max={1} step={0.01} size={40} color={COLOR2} onChange={v => set('pan', v)} />
            <Knob label="SCATTER" value={panRandom}  min={0}  max={1} step={0.01} size={40} color={COLOR2} onChange={v => set('panRandom', v)} />
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
          <SL>Mix</SL>
          <div style={{ display: 'flex', gap: 10 }}>
            <Knob label="DRY/WET" value={mix}    min={0} max={1} step={0.01} size={40} color={COLOR} onChange={v => set('mix', v)} />
          </div>
        </div>
      </div>

      {/* Load sample hint */}
      <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(16,185,129,0.05)', borderRadius: 6, border: '1px dashed rgba(16,185,129,0.2)', fontSize: 9, color: '#64748b', textAlign: 'center' }}>
        Load a sample via the track's audio clip to use as the grain source · Parameters update in real-time
      </div>
    </div>
  )
}
