/**
 * FS-AUDIO Built-In Plugin Rack — Elite Edition
 * All plugins are implemented 100% with Web Audio API — no external dependencies.
 * Plugin architecture is WAM2-compatible (Web Audio Modules 2.0 design patterns).
 *
 * Classic plugins:
 *  1. FS-EQ3        — 3-band parametric EQ
 *  2. FS-Comp       — Dynamics compressor
 *  3. FS-Limiter    — Brick-wall limiter
 *  4. FS-Reverb     — Algorithmic plate reverb (synthetic IR)
 *  5. FS-Delay      — Stereo delay with feedback
 *  6. FS-Chorus     — Modulated delay chorus
 *  7. FS-Bitcrusher — Lo-fi bit depth reducer
 *
 * Elite Plugin Suite (new):
 *  8. FS-Saturn     — Multiband harmonic saturation (FabFilter Saturn inspired)
 *  9. FS-Pressure   — Vintage bus compressor, SSL G-Bus / Neve 33609 character
 * 10. FS-Spacetime  — Shimmer reverb + tempo-sync ping-pong delay (Valhalla/Echoboy)
 * 11. FS-Transient  — Attack/sustain transient designer (SPL Transient Designer)
 */

import React, { useState, useCallback } from 'react'
import { useProjectStore, Track, Plugin } from '../../store/projectStore'

// ── Knob Component ────────────────────────────────────────────────────────────
interface KnobProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
  size?: number
}

function Knob({ label, value, min, max, step = 0.01, unit = '', onChange, size = 36 }: KnobProps) {
  const norm = (value - min) / (max - min)
  const angle = -135 + norm * 270 // -135° to +135°
  const cx = size / 2, cy = size / 2, r = size / 2 - 3

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startVal = value
    const range = max - min

    const move = (me: MouseEvent) => {
      const dy = startY - me.clientY // drag up = increase
      const delta = (dy / 120) * range
      const newVal = Math.max(min, Math.min(max, startVal + delta))
      const snapped = step ? Math.round(newVal / step) * step : newVal
      onChange(Math.round(snapped * 1000) / 1000)
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [value, min, max, step, onChange])

  const rad = (angle * Math.PI) / 180
  const tickX = cx + r * Math.sin(rad)
  const tickY = cy - r * Math.cos(rad)
  const innerX = cx + (r - 6) * Math.sin(rad)
  const innerY = cy - (r - 6) * Math.cos(rad)

  const formatVal = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(1)}k`
    if (Math.abs(v) < 10 && v % 1 !== 0) return v.toFixed(1)
    return Math.round(v).toString()
  }

  return (
    <div className="knob-wrap" style={{ width: size + 16 }}>
      <svg
        width={size} height={size}
        className="knob-svg"
        onMouseDown={handleMouseDown}
        style={{ cursor: 'ns-resize', userSelect: 'none' }}
        aria-label={`${label}: ${formatVal(value)}${unit}`}
      >
        {/* Track arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={3} />
        {/* Value arc */}
        <path
          d={describeArc(cx, cy, r, -135, -135 + norm * 270)}
          fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round"
        />
        {/* Dot */}
        <circle cx={cx} cy={cy} r={r - 8} fill="rgba(255,255,255,0.05)" />
        {/* Pointer */}
        <line x1={innerX} y1={innerY} x2={tickX} y2={tickY} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 9, color: 'var(--text-m)', textAlign: 'center', lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 9, color: 'var(--text-s)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
        {formatVal(value)}{unit}
      </div>
    </div>
  )
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startRad = (startAngle * Math.PI) / 180
  const endRad = (endAngle * Math.PI) / 180
  const x1 = cx + r * Math.sin(startRad)
  const y1 = cy - r * Math.cos(startRad)
  const x2 = cx + r * Math.sin(endRad)
  const y2 = cy - r * Math.cos(endRad)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

// ── Plugin Default Params ─────────────────────────────────────────────────────
export const PLUGIN_DEFAULTS: Record<string, { params: Record<string, number>; name: string; type: Plugin['type'] }> = {
  eq: {
    name: 'FS-EQ3',
    type: 'eq',
    params: {
      lowGain: 0, lowFreq: 100,
      midGain: 0, midFreq: 1000, midQ: 1,
      highGain: 0, highFreq: 8000,
    },
  },
  compressor: {
    name: 'FS-Comp',
    type: 'compressor',
    params: { threshold: -18, ratio: 4, attack: 0.01, release: 0.1, knee: 6, makeupGain: 0 },
  },
  limiter: {
    name: 'FS-Limiter',
    type: 'limiter',
    params: { threshold: -1, release: 0.05, ceiling: -0.1 },
  },
  reverb: {
    name: 'FS-Reverb',
    type: 'reverb',
    params: { wet: 0.3, size: 2.5, damping: 0.5, predelay: 0.02 },
  },
  delay: {
    name: 'FS-Delay',
    type: 'delay',
    params: { wet: 0.25, time: 0.375, feedback: 0.35, stereoSpread: 0.3 },
  },
  chorus: {
    name: 'FS-Chorus',
    type: 'chorus',
    params: { wet: 0.5, rate: 0.8, depth: 0.003, delay: 0.015 },
  },
  distortion: {
    name: 'FS-Bitcrusher',
    type: 'distortion',
    params: { bits: 16, downsample: 1, wet: 0.5 },
  },

  // ── Elite Plugin Suite ──────────────────────────────────────────────────────
  saturation: {
    name: 'FS-Saturn',
    type: 'saturation',
    params: {
      // Low band
      lowDrive: 0, lowFreq: 250, lowMode: 0,   // mode: 0=tape, 1=tube, 2=clip, 3=fuzz
      // Mid band
      midDrive: 0, midFreq: 3000, midMode: 1,
      // High band
      highDrive: 0, highMode: 2,
      // Global
      mix: 0.5, output: 0,
    },
  },

  bus_compressor: {
    name: 'FS-Pressure',
    type: 'bus_compressor',
    params: {
      threshold: -12,
      ratio: 4,         // 1.5 / 2 / 4 / 10 discrete steps mapped 0-3
      attack: 0.001,    // 0.001 / 0.003 / 0.01 / 0.03 / 0.1 / 0.3 ms → mapped
      release: 0.1,     // auto = -1
      makeup: 0,
      // Color: 0 = clean, 1 = SSL (punchy), 2 = Neve (warm)
      color: 1,
      mix: 1.0,         // parallel mix (NY compression)
      autoGain: 1,      // auto makeup
    },
  },

  spacetime: {
    name: 'FS-Spacetime',
    type: 'spacetime',
    params: {
      // Shimmer Reverb
      revWet: 0.3,
      revSize: 3.5,
      revDamping: 0.4,
      revPredelay: 0.02,
      shimmer: 0.3,     // shimmer pitch-up amount (0-1)
      shimmerPitch: 12, // semitones (octave up by default)
      // Ping-Pong Delay
      dlyWet: 0.2,
      dlyTime: 0.375,   // quarter note at 120bpm = 0.5s
      dlyFeedback: 0.4,
      dlySpread: 0.8,   // ping-pong width
      // BPM sync: 0=free, 1=1/4, 2=1/8, 3=1/2, 4=1/16
      dlySync: 1,
    },
  },

  transient: {
    name: 'FS-Transient',
    type: 'transient',
    params: {
      attack: 0,        // -24 to +24 dB — punch the transient
      sustain: 0,       // -24 to +24 dB — shape the tail
      gain: 0,          // output gain
      // Mode: 0 = drum (fast), 1 = general, 2 = smooth
      mode: 1,
      // Sensitivity (detection threshold)
      sensitivity: 0.5,
      clipProtect: 1,   // enable automatic output clip protection
    },
  },
}

// ── Per-plugin UI ─────────────────────────────────────────────────────────────
interface PluginEditorProps {
  plugin: Plugin
  onChange: (params: Record<string, number>) => void
}

function EQEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="LO GAIN" value={p.lowGain ?? 0} min={-18} max={18} unit=" dB" onChange={v => onChange({ ...p, lowGain: v })} />
      <Knob label="LO Hz" value={p.lowFreq ?? 100} min={20} max={500} step={1} unit=" Hz" onChange={v => onChange({ ...p, lowFreq: v })} />
      <Knob label="MID GAIN" value={p.midGain ?? 0} min={-18} max={18} unit=" dB" onChange={v => onChange({ ...p, midGain: v })} />
      <Knob label="MID Hz" value={p.midFreq ?? 1000} min={200} max={8000} step={10} unit=" Hz" onChange={v => onChange({ ...p, midFreq: v })} />
      <Knob label="MID Q" value={p.midQ ?? 1} min={0.1} max={10} step={0.1} onChange={v => onChange({ ...p, midQ: v })} />
      <Knob label="HI GAIN" value={p.highGain ?? 0} min={-18} max={18} unit=" dB" onChange={v => onChange({ ...p, highGain: v })} />
      <Knob label="HI Hz" value={p.highFreq ?? 8000} min={2000} max={20000} step={100} unit=" Hz" onChange={v => onChange({ ...p, highFreq: v })} />
    </div>
  )
}

function CompressorEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="THRESH" value={p.threshold ?? -18} min={-60} max={0} unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
      <Knob label="RATIO" value={p.ratio ?? 4} min={1} max={20} step={0.1} unit=":1" onChange={v => onChange({ ...p, ratio: v })} />
      <Knob label="ATTACK" value={(p.attack ?? 0.01) * 1000} min={0.1} max={200} step={0.1} unit=" ms" onChange={v => onChange({ ...p, attack: v / 1000 })} />
      <Knob label="RELEASE" value={(p.release ?? 0.1) * 1000} min={10} max={2000} step={10} unit=" ms" onChange={v => onChange({ ...p, release: v / 1000 })} />
      <Knob label="KNEE" value={p.knee ?? 6} min={0} max={40} unit=" dB" onChange={v => onChange({ ...p, knee: v })} />
      <Knob label="MAKEUP" value={p.makeupGain ?? 0} min={0} max={24} unit=" dB" onChange={v => onChange({ ...p, makeupGain: v })} />
    </div>
  )
}

function LimiterEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="CEILING" value={p.ceiling ?? -0.1} min={-12} max={0} step={0.1} unit=" dB" onChange={v => onChange({ ...p, ceiling: v })} />
      <Knob label="THRESH" value={p.threshold ?? -1} min={-20} max={0} step={0.1} unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
      <Knob label="RELEASE" value={(p.release ?? 0.05) * 1000} min={1} max={500} step={1} unit=" ms" onChange={v => onChange({ ...p, release: v / 1000 })} />
    </div>
  )
}

function ReverbEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="WET" value={p.wet ?? 0.3} min={0} max={1} unit="" onChange={v => onChange({ ...p, wet: v })} />
      <Knob label="SIZE" value={p.size ?? 2.5} min={0.1} max={10} step={0.1} unit=" s" onChange={v => onChange({ ...p, size: v })} />
      <Knob label="DAMP" value={p.damping ?? 0.5} min={0} max={1} onChange={v => onChange({ ...p, damping: v })} />
      <Knob label="PRE-DLY" value={(p.predelay ?? 0.02) * 1000} min={0} max={100} step={1} unit=" ms" onChange={v => onChange({ ...p, predelay: v / 1000 })} />
    </div>
  )
}

function DelayEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="WET" value={p.wet ?? 0.25} min={0} max={1} onChange={v => onChange({ ...p, wet: v })} />
      <Knob label="TIME" value={(p.time ?? 0.375) * 1000} min={1} max={2000} step={1} unit=" ms" onChange={v => onChange({ ...p, time: v / 1000 })} />
      <Knob label="FDBK" value={p.feedback ?? 0.35} min={0} max={0.98} step={0.01} onChange={v => onChange({ ...p, feedback: v })} />
      <Knob label="SPREAD" value={p.stereoSpread ?? 0.3} min={0} max={1} onChange={v => onChange({ ...p, stereoSpread: v })} />
    </div>
  )
}

function ChorusEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="WET" value={p.wet ?? 0.5} min={0} max={1} onChange={v => onChange({ ...p, wet: v })} />
      <Knob label="RATE" value={p.rate ?? 0.8} min={0.05} max={8} step={0.05} unit=" Hz" onChange={v => onChange({ ...p, rate: v })} />
      <Knob label="DEPTH" value={(p.depth ?? 0.003) * 1000} min={0.1} max={20} step={0.1} unit=" ms" onChange={v => onChange({ ...p, depth: v / 1000 })} />
      <Knob label="DELAY" value={(p.delay ?? 0.015) * 1000} min={1} max={50} step={1} unit=" ms" onChange={v => onChange({ ...p, delay: v / 1000 })} />
    </div>
  )
}

function DistortionEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="BITS" value={p.bits ?? 16} min={2} max={16} step={1} onChange={v => onChange({ ...p, bits: v })} />
      <Knob label="RATE ÷" value={p.downsample ?? 1} min={1} max={32} step={1} onChange={v => onChange({ ...p, downsample: v })} />
      <Knob label="WET" value={p.wet ?? 0.5} min={0} max={1} onChange={v => onChange({ ...p, wet: v })} />
    </div>
  )
}

// ── FS-Saturn — Multiband Harmonic Saturation ─────────────────────────────────
const SAT_MODES = ['TAPE', 'TUBE', 'CLIP', 'FUZZ']

function SaturnEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const modeBtn = (band: string, modeKey: string) => (
    <div className="plugin-mode-group">
      {SAT_MODES.map((m, i) => (
        <button
          key={m}
          className={`plugin-mode-btn ${Math.round(p[modeKey] ?? 0) === i ? 'active' : ''}`}
          onClick={() => onChange({ ...p, [modeKey]: i })}
        >{m}</button>
      ))}
      <span className="plugin-mode-label">{band}</span>
    </div>
  )
  return (
    <div className="plugin-saturn-wrap">
      <div className="plugin-saturn-band">
        <div className="plugin-saturn-band-label" style={{ color: '#f59e0b' }}>LOW</div>
        <div className="plugin-knobs-row">
          <Knob label="DRIVE" value={p.lowDrive ?? 0} min={0} max={10} step={0.1} onChange={v => onChange({ ...p, lowDrive: v })} />
          <Knob label="FREQ" value={p.lowFreq ?? 250} min={50} max={800} step={10} unit=" Hz" onChange={v => onChange({ ...p, lowFreq: v })} />
        </div>
        {modeBtn('MODE', 'lowMode')}
      </div>
      <div className="plugin-saturn-divider" />
      <div className="plugin-saturn-band">
        <div className="plugin-saturn-band-label" style={{ color: '#10b981' }}>MID</div>
        <div className="plugin-knobs-row">
          <Knob label="DRIVE" value={p.midDrive ?? 0} min={0} max={10} step={0.1} onChange={v => onChange({ ...p, midDrive: v })} />
          <Knob label="FREQ" value={p.midFreq ?? 3000} min={800} max={8000} step={100} unit=" Hz" onChange={v => onChange({ ...p, midFreq: v })} />
        </div>
        {modeBtn('MODE', 'midMode')}
      </div>
      <div className="plugin-saturn-divider" />
      <div className="plugin-saturn-band">
        <div className="plugin-saturn-band-label" style={{ color: '#06b6d4' }}>HIGH</div>
        <div className="plugin-knobs-row">
          <Knob label="DRIVE" value={p.highDrive ?? 0} min={0} max={10} step={0.1} onChange={v => onChange({ ...p, highDrive: v })} />
        </div>
        {modeBtn('MODE', 'highMode')}
      </div>
      <div className="plugin-saturn-divider" />
      <div className="plugin-knobs-row">
        <Knob label="MIX" value={p.mix ?? 0.5} min={0} max={1} onChange={v => onChange({ ...p, mix: v })} />
        <Knob label="OUTPUT" value={p.output ?? 0} min={-12} max={12} unit=" dB" onChange={v => onChange({ ...p, output: v })} />
      </div>
    </div>
  )
}

// ── FS-Pressure — Vintage Bus Compressor ──────────────────────────────────────
const PRESSURE_RATIOS  = ['1.5', '2', '4', '10']
const PRESSURE_ATTACKS = ['0.1', '0.3', '1', '3', '10', '30']
const PRESSURE_COLORS  = ['CLEAN', 'SSL', 'NEVE']

function PressureEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-pressure-wrap">
      <div className="plugin-knobs-row">
        <Knob label="THRESH"  value={p.threshold ?? -12} min={-40} max={0}   unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
        <Knob label="MAKEUP"  value={p.makeup ?? 0}      min={0}   max={20}  unit=" dB" onChange={v => onChange({ ...p, makeup: v })} />
        <Knob label="MIX"     value={p.mix ?? 1}         min={0}   max={1}   onChange={v => onChange({ ...p, mix: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">RATIO</span>
          {PRESSURE_RATIOS.map((r, i) => (
            <button key={r} className={`plugin-step-btn ${Math.round(p.ratio ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, ratio: i })}>{r}:1</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">ATTACK ms</span>
          {PRESSURE_ATTACKS.map((a, i) => (
            <button key={a} className={`plugin-step-btn ${Math.round((p.attack ?? 2) * 10) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, attack: i / 10 })}>{a}</button>
          ))}
        </div>
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">RELEASE</span>
          <Knob label="ms" value={(p.release ?? 0.1) * 1000} min={50} max={1200} step={10} unit=" ms"
            onChange={v => onChange({ ...p, release: v / 1000 })} />
          <button
            className={`plugin-step-btn ${p.release === -1 ? 'active' : ''}`}
            onClick={() => onChange({ ...p, release: -1 })}>AUTO</button>
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">COLOR</span>
          {PRESSURE_COLORS.map((c, i) => (
            <button key={c}
              className={`plugin-step-btn ${Math.round(p.color ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, color: i })}>{c}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">AUTO-GAIN</span>
          <button
            className={`plugin-step-btn ${p.autoGain ? 'active' : ''}`}
            onClick={() => onChange({ ...p, autoGain: p.autoGain ? 0 : 1 })}>
            {p.autoGain ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── FS-Spacetime — Shimmer Reverb + Ping-Pong Delay ───────────────────────────
const SYNC_LABELS = ['FREE', '1/4', '1/8', '1/2', '1/16']

function SpacetimeEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-spacetime-wrap">
      {/* Shimmer Reverb section */}
      <div className="plugin-section-title" style={{ color: '#a855f7' }}>✦ SHIMMER REVERB</div>
      <div className="plugin-knobs-row">
        <Knob label="WET"      value={p.revWet ?? 0.3}       min={0}   max={1}   onChange={v => onChange({ ...p, revWet: v })} />
        <Knob label="SIZE"     value={p.revSize ?? 3.5}       min={0.1} max={12}  step={0.1} unit=" s" onChange={v => onChange({ ...p, revSize: v })} />
        <Knob label="DAMP"     value={p.revDamping ?? 0.4}    min={0}   max={1}   onChange={v => onChange({ ...p, revDamping: v })} />
        <Knob label="PRE-DLY"  value={(p.revPredelay ?? 0.02) * 1000} min={0} max={100} step={1} unit=" ms" onChange={v => onChange({ ...p, revPredelay: v / 1000 })} />
        <Knob label="SHIMMER"  value={p.shimmer ?? 0.3}       min={0}   max={1}   onChange={v => onChange({ ...p, shimmer: v })} />
        <Knob label="SHIM +st" value={p.shimmerPitch ?? 12}   min={1}   max={24}  step={1}  onChange={v => onChange({ ...p, shimmerPitch: v })} />
      </div>
      {/* Ping-Pong Delay section */}
      <div className="plugin-section-title" style={{ color: '#3b82f6', marginTop: 8 }}>⬡ PING-PONG DELAY</div>
      <div className="plugin-knobs-row">
        <Knob label="WET"    value={p.dlyWet ?? 0.2}      min={0}    max={1}    onChange={v => onChange({ ...p, dlyWet: v })} />
        <Knob label="TIME"   value={(p.dlyTime ?? 0.375) * 1000} min={10} max={2000} step={1} unit=" ms" onChange={v => onChange({ ...p, dlyTime: v / 1000 })} />
        <Knob label="FDBK"   value={p.dlyFeedback ?? 0.4} min={0}    max={0.95} step={0.01} onChange={v => onChange({ ...p, dlyFeedback: v })} />
        <Knob label="SPREAD" value={p.dlySpread ?? 0.8}   min={0}    max={1}    onChange={v => onChange({ ...p, dlySpread: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">BPM SYNC</span>
          {SYNC_LABELS.map((s, i) => (
            <button key={s} className={`plugin-step-btn ${Math.round(p.dlySync ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, dlySync: i })}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── FS-Transient — Attack/Sustain Transient Designer ──────────────────────────
const TRANSIENT_MODES = ['DRUM', 'GENERAL', 'SMOOTH']

function TransientEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-transient-wrap">
      <div className="plugin-knobs-row">
        <Knob label="ATTACK"  value={p.attack ?? 0}       min={-24} max={24} unit=" dB" onChange={v => onChange({ ...p, attack: v })} />
        <Knob label="SUSTAIN" value={p.sustain ?? 0}      min={-24} max={24} unit=" dB" onChange={v => onChange({ ...p, sustain: v })} />
        <Knob label="GAIN"    value={p.gain ?? 0}         min={-12} max={12} unit=" dB" onChange={v => onChange({ ...p, gain: v })} />
        <Knob label="SENSE"   value={p.sensitivity ?? 0.5} min={0}  max={1}  onChange={v => onChange({ ...p, sensitivity: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">MODE</span>
          {TRANSIENT_MODES.map((m, i) => (
            <button key={m} className={`plugin-step-btn ${Math.round(p.mode ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, mode: i })}>{m}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">CLIP PROTECT</span>
          <button
            className={`plugin-step-btn ${p.clipProtect ? 'active' : ''}`}
            onClick={() => onChange({ ...p, clipProtect: p.clipProtect ? 0 : 1 })}>
            {p.clipProtect ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Plugin Slot ───────────────────────────────────────────────────────────────
interface PluginSlotProps {
  trackId: string
  plugin: Plugin
  slotIndex: number
}

function PluginSlot({ trackId, plugin, slotIndex }: PluginSlotProps) {
  const { updatePlugin, togglePlugin, removePlugin } = useProjectStore()
  const [expanded, setExpanded] = useState(false)

  const handleChange = useCallback((params: Record<string, number>) => {
    updatePlugin(trackId, plugin.id, params)
  }, [trackId, plugin.id, updatePlugin])

  function renderEditor() {
    switch (plugin.type) {
      case 'eq':           return <EQEditor plugin={plugin} onChange={handleChange} />
      case 'compressor':   return <CompressorEditor plugin={plugin} onChange={handleChange} />
      case 'limiter':      return <LimiterEditor plugin={plugin} onChange={handleChange} />
      case 'reverb':       return <ReverbEditor plugin={plugin} onChange={handleChange} />
      case 'delay':        return <DelayEditor plugin={plugin} onChange={handleChange} />
      case 'chorus':       return <ChorusEditor plugin={plugin} onChange={handleChange} />
      case 'distortion':   return <DistortionEditor plugin={plugin} onChange={handleChange} />
      // Elite Suite
      case 'saturation':   return <SaturnEditor plugin={plugin} onChange={handleChange} />
      case 'bus_compressor': return <PressureEditor plugin={plugin} onChange={handleChange} />
      case 'spacetime':    return <SpacetimeEditor plugin={plugin} onChange={handleChange} />
      case 'transient':    return <TransientEditor plugin={plugin} onChange={handleChange} />
      default: return null
    }
  }

  const typeColors: Record<string, string> = {
    eq: '#06b6d4', compressor: '#10b981', limiter: '#ef4444',
    reverb: '#a855f7', delay: '#3b82f6', chorus: '#ec4899',
    distortion: '#f59e0b',
    // Elite
    saturation: '#f97316', bus_compressor: '#22d3ee',
    spacetime: '#c084fc', transient: '#4ade80',
  }
  const color = typeColors[plugin.type] ?? '#6b7280'

  return (
    <div className={`plugin-slot-v2 ${plugin.enabled ? '' : 'plugin-bypassed'}`} style={{ borderColor: expanded ? color + '66' : undefined }}>
      <div className="plugin-slot-v2-header">
        <span className="plugin-slot-num" style={{ color }}>{slotIndex + 1}</span>
        <div
          className="plugin-power-dot"
          style={{ background: plugin.enabled ? color : undefined }}
          onClick={() => togglePlugin(trackId, plugin.id)}
          title={plugin.enabled ? 'Bypass' : 'Enable'}
        />
        <span className="plugin-slot-name" style={{ color: plugin.enabled ? 'var(--text-p)' : 'var(--text-m)' }}>
          {plugin.name}
        </span>
        <button className="plugin-expand-btn" onClick={() => setExpanded(e => !e)}>
          {expanded ? '▲' : '▼'}
        </button>
        <button className="plugin-remove-btn" onClick={() => removePlugin(trackId, plugin.id)} title="Remove">✕</button>
      </div>
      {expanded && (
        <div className="plugin-slot-v2-body">
          {renderEditor()}
        </div>
      )}
    </div>
  )
}

// ── Plugin Rack ───────────────────────────────────────────────────────────────
interface PluginRackProps {
  track: Track
}

const CLASSIC_PLUGINS = ['eq','compressor','limiter','reverb','delay','chorus','distortion']
const ELITE_PLUGINS   = ['saturation','bus_compressor','spacetime','transient']

const PLUGIN_MENU = Object.entries(PLUGIN_DEFAULTS).map(([key, def]) => ({
  key, name: def.name, type: def.type,
  elite: ELITE_PLUGINS.includes(key),
}))

export function PluginRack({ track }: PluginRackProps) {
  const { addPlugin } = useProjectStore()
  const [showAdd, setShowAdd] = useState(false)

  function addNewPlugin(key: string) {
    const def = PLUGIN_DEFAULTS[key]
    if (!def) return
    addPlugin(track.id, {
      id: `plugin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: def.name,
      type: def.type,
      enabled: true,
      params: { ...def.params },
    })
    setShowAdd(false)
  }

  return (
    <div className="plugin-rack">
      <div className="plugin-rack-header">
        <span className="plugin-rack-title">INSERT EFFECTS</span>
        <button className="plugin-rack-add-btn" onClick={() => setShowAdd(s => !s)} title="Add Plugin">
          + ADD
        </button>
      </div>

      {showAdd && (
        <div className="plugin-add-menu">
          <div className="plugin-add-section-label">CLASSIC</div>
          {PLUGIN_MENU.filter(p => !p.elite).map(p => (
            <button key={p.key} className="plugin-add-option" onClick={() => addNewPlugin(p.key)}>
              <span className="plugin-add-type">{p.type.toUpperCase()}</span>
              {p.name}
            </button>
          ))}
          <div className="plugin-add-section-label plugin-add-section-elite">★ ELITE SUITE</div>
          {PLUGIN_MENU.filter(p => p.elite).map(p => (
            <button key={p.key} className="plugin-add-option plugin-add-elite" onClick={() => addNewPlugin(p.key)}>
              <span className="plugin-add-type" style={{ color: '#f97316' }}>{p.type.replace('_',' ').toUpperCase()}</span>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="plugin-rack-slots">
        {track.plugins.length === 0 && (
          <div className="plugin-rack-empty">No effects — click + ADD to insert</div>
        )}
        {track.plugins.map((plugin, i) => (
          <PluginSlot key={plugin.id} trackId={track.id} plugin={plugin} slotIndex={i} />
        ))}
      </div>
    </div>
  )
}
