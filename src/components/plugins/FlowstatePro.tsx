/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║          FLOWSTATE PRO SUITE — 15 Competitive Elite Plugins                 ║
 * ║  Built to surpass: FabFilter Pro-Q4, Soothe2, Valhalla VintageVerb,         ║
 * ║  Auto-Tune 2026, iZotope Ozone 11, Trackspacer, Pro-L2, Soundtoys,          ║
 * ║  Sugar Bytes Looperator, Xfer Serum, and more                                ║
 * ║                                                                              ║
 * ║  FLOWSTATE VISUAL IDENTITY:                                                  ║
 * ║  • Deep space gradients (nebula purples, aurora greens, cosmic blues)        ║
 * ║  • Background image textures for immersion                                  ║
 * ║  • Glowing neon accents with bloom effects                                  ║
 * ║  • Fluid, organic UI motion and transitions                                 ║
 * ║  • Glassmorphism panels with frosted-glass effects                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 *  1. FS-ProQ      — 8-band surgical EQ + dynamic EQ + spectrum grab
 *  2. FS-Resonate  — AI spectral resonance suppressor + delta mode
 *  3. FS-Cosmos    — 18-mode algorithmic reverb + shimmer + modulation
 *  4. FS-Echo      — Tape/BBD/Galaxy delay with flutter + ping-pong
 *  5. FS-Voice     — Real-time pitch/formant corrector with piano roll
 *  6. FS-Master    — 4-section mastering suite: tonal/dynamics/stereo/loudness
 *  7. FS-Spacer    — Sidechain spectral carver with inverse EQ curve
 *  8. FS-Apex      — True-peak limiter with ISP detection + LUFS metering
 *  9. FS-Mutate    — Vocal transformer: pitch/formant/robot/monster/harmony
 * 10. FS-Glitch    — 16-step multi-FX sequencer with visual grid
 * 11. FS-Spectrum  — Wavetable oscillator layer with morphable waveforms
 * 12. FS-Crush     — 4-band multiband compressor with crossover control
 * 13. FS-Reel      — Analog tape delay with heads, saturation, flutter
 * 14. FS-Aura      — Intelligent vocal enhancer with harmonic excitation
 * 15. FS-Dimension — Stereo chorus dimension expander (Roland D-type)
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useProjectStore, Plugin } from '../../store/projectStore'

// ── Shared Types ──────────────────────────────────────────────────────────────
interface PluginEditorProps {
  plugin: Plugin
  onChange: (params: Record<string, number>) => void
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOWSTATE SHARED KNOB COMPONENT
// Ultra-precision knob with bloom glow, radial gradient, smooth pointer
// ══════════════════════════════════════════════════════════════════════════════
function FSKnob({
  label, value, min, max, step = 0.01, unit = '', onChange,
  size = 42, color = '#a855f7', glowing = false, centerZero = false
}: {
  label: string; value: number; min: number; max: number
  step?: number; unit?: string; onChange: (v: number) => void
  size?: number; color?: string; glowing?: boolean; centerZero?: boolean
}) {
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = -135 + norm * 270
  const cx = size / 2, cy = size / 2, r = size / 2 - 4

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startVal = value
    const range = max - min
    const move = (me: MouseEvent) => {
      const dy = startY - me.clientY
      const delta = (dy / 100) * range
      const nv = Math.max(min, Math.min(max, startVal + delta))
      const snapped = step ? Math.round(nv / step) * step : nv
      onChange(Math.round(snapped * 10000) / 10000)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [value, min, max, step, onChange])

  const dblClick = useCallback(() => {
    const res = prompt(`${label} (${min}–${max}${unit})`, String(value))
    if (res !== null) {
      const n = parseFloat(res)
      if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
    }
  }, [label, value, min, max, unit, onChange])

  function descArc(startA: number, endA: number) {
    const s = (startA * Math.PI) / 180
    const e2 = (endA * Math.PI) / 180
    const x1 = cx + r * Math.sin(s), y1 = cy - r * Math.cos(s)
    const x2 = cx + r * Math.sin(e2), y2 = cy - r * Math.cos(e2)
    const large = endA - startA > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  const rad = (angle * Math.PI) / 180
  const tickX = cx + (r - 1) * Math.sin(rad), tickY = cy - (r - 1) * Math.cos(rad)
  const iX = cx + (r - 9) * Math.sin(rad), iY = cy - (r - 9) * Math.cos(rad)

  // Center-zero arc (for gain knobs that go +/-)
  const zeroAngle = centerZero ? -135 + ((0 - min) / (max - min)) * 270 : -135
  const arcStart = centerZero ? Math.min(angle, zeroAngle) : -135
  const arcEnd = centerZero ? Math.max(angle, zeroAngle) : angle

  const fmt = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
    if (unit === ' dB' || unit === ' dBTP' || unit === ' LUFS') return v.toFixed(1)
    if (unit === ':1') return v.toFixed(1)
    if (unit === ' st' || unit === ' c') return v.toFixed(1)
    if (Math.abs(v) < 10 && v % 1 !== 0) return v.toFixed(2)
    return Math.round(v).toString()
  }

  const gradId = `kg-${label.replace(/[^a-z0-9]/gi, '')}-${Math.round(size)}`

  return (
    <div className="fs-knob-wrap" style={{ width: size + 14, flexShrink: 0 }}>
      <svg
        width={size} height={size}
        onMouseDown={handleMouseDown}
        onDoubleClick={dblClick}
        style={{ cursor: 'ns-resize', userSelect: 'none', display: 'block', margin: '0 auto', overflow: 'visible' }}
      >
        <defs>
          <radialGradient id={gradId} cx="38%" cy="32%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.75)" />
          </radialGradient>
        </defs>
        {/* Glow ring when active */}
        {glowing && (
          <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke={color} strokeWidth={1.5} opacity={0.25}
            style={{ filter: `blur(2px)` }} />
        )}
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={r} fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} />
        {/* Track */}
        <path d={descArc(-135, 135)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} strokeLinecap="round" />
        {/* Value arc */}
        <path d={descArc(arcStart, arcEnd)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
          style={{ filter: glowing ? `drop-shadow(0 0 3px ${color})` : 'none' }} />
        {/* Inner cap */}
        <circle cx={cx} cy={cy} r={r - 8} fill="rgba(0,0,0,0.4)" />
        {/* Pointer */}
        <line x1={iX} y1={iY} x2={tickX} y2={tickY}
          stroke="rgba(255,255,255,0.92)" strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.42)', textAlign: 'center', lineHeight: 1.2, marginTop: 2, letterSpacing: '.5px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 9, color, textAlign: 'center', fontVariantNumeric: 'tabular-nums', letterSpacing: '.3px', fontWeight: 600 }}>{fmt(value)}{unit}</div>
    </div>
  )
}

// ── Step button row ───────────────────────────────────────────────────────────
function StepBtns({ label, opts, value, onChange, color = '#a855f7' }: {
  label: string; opts: string[]; value: number; onChange: (i: number) => void; color?: string
}) {
  return (
    <div className="fs-step-group">
      {label && <span className="fs-step-label">{label}</span>}
      {opts.map((o, i) => (
        <button key={o}
          className={`fs-step-btn ${Math.round(value) === i ? 'active' : ''}`}
          style={Math.round(value) === i
            ? { borderColor: color, color, background: color + '22', boxShadow: `0 0 6px ${color}44` }
            : {}}
          onClick={() => onChange(i)}
        >{o}</button>
      ))}
    </div>
  )
}

// ── Animated spectrum bar ─────────────────────────────────────────────────────
function SpectrumBar({ bands, color = '#a855f7', height = 36, reduction }: {
  bands: number[]; color?: string; height?: number; reduction?: number[]
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height, padding: '0 2px' }}>
      {bands.map((v, i) => {
        const red = reduction ? reduction[i] ?? 0 : 0
        return (
          <div key={i} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div style={{
              width: '100%',
              height: `${Math.max(3, v * 100)}%`,
              background: `linear-gradient(to top, ${color}ee, ${color}55)`,
              borderRadius: '1px 1px 0 0',
              transition: 'height 0.06s ease',
            }} />
            {red > 0 && (
              <div style={{
                position: 'absolute', bottom: 0, width: '100%',
                height: `${Math.max(1, red * 100)}%`,
                background: 'rgba(239,68,68,0.6)',
                borderRadius: '1px 1px 0 0',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── SVG EQ Curve preview ──────────────────────────────────────────────────────
function EQCurvePreview({ bands, width = 290, height = 52, bgColor = 'transparent' }: {
  bands: Array<{ freq: number; gain: number; q?: number; type?: string }>
  width?: number; height?: number; bgColor?: string
}) {
  const { path, fill } = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i <= width; i += 2) {
      const freq = 20 * Math.pow(1000, i / width)
      let totalGain = 0
      for (const b of bands) {
        const logF = Math.log10(freq / Math.max(1, b.freq))
        const q = b.q ?? 1
        totalGain += b.gain / (1 + Math.pow(logF * q * 2.2, 2))
      }
      const y = height / 2 - (totalGain / 24) * (height / 2 - 5)
      pts.push(`${i},${y.toFixed(1)}`)
    }
    const pathStr = 'M ' + pts.join(' L ')
    const fillStr = pathStr + ` L ${width},${height} L 0,${height} Z`
    return { path: pathStr, fill: fillStr }
  }, [bands, width, height])

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {bgColor !== 'transparent' && <rect width={width} height={height} fill={bgColor} rx={3} />}
      <defs>
        <linearGradient id="eqFillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      {/* Frequency grid lines */}
      {[100, 1000, 10000].map(f => {
        const x = (Math.log10(f / 20) / Math.log10(1000)) * width
        return <line key={f} x1={x} y1={0} x2={x} y2={height} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
      })}
      <path d={fill} fill="url(#eqFillGrad)" />
      <path d={path} fill="none" stroke="#a855f7" strokeWidth={2} strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 4px #a855f788)' }} />
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOWSTATE BG WRAPPER — all plugins use this for consistent visual identity
// ══════════════════════════════════════════════════════════════════════════════
function FSPluginBg({
  children, gradient, accentColor = '#a855f7', showNoise = true, showGrid = false
}: {
  children: React.ReactNode
  gradient: string
  accentColor?: string
  showNoise?: boolean
  showGrid?: boolean
}) {
  return (
    <div style={{
      position: 'relative',
      background: gradient,
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Noise texture overlay */}
      {showNoise && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          opacity: 0.6,
        }} />
      )}
      {/* Subtle grid overlay */}
      {showGrid && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `linear-gradient(${accentColor}08 1px, transparent 1px), linear-gradient(90deg, ${accentColor}08 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }} />
      )}
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}88, transparent)`,
      }} />
      {children}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. FS-ProQ — 8-Band Surgical EQ (> FabFilter Pro-Q 4)
// ══════════════════════════════════════════════════════════════════════════════
function ProQEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const [activeBand, setActiveBand] = useState(3) // default to MID

  const bands = [
    { key: 'b1', label: 'HPF',  freq: p.b1f ?? 20,    gain: 0,            q: 0.7,       color: '#64748b' },
    { key: 'b2', label: 'LOW',  freq: p.b2f ?? 80,    gain: p.b2g ?? 0,   q: p.b2q ?? 1, color: '#f59e0b' },
    { key: 'b3', label: 'LO-M', freq: p.b3f ?? 250,   gain: p.b3g ?? 0,   q: p.b3q ?? 1, color: '#10b981' },
    { key: 'b4', label: 'MID',  freq: p.b4f ?? 1000,  gain: p.b4g ?? 0,   q: p.b4q ?? 1, color: '#a855f7' },
    { key: 'b5', label: 'HI-M', freq: p.b5f ?? 3500,  gain: p.b5g ?? 0,   q: p.b5q ?? 1, color: '#3b82f6' },
    { key: 'b6', label: 'PRES', freq: p.b6f ?? 7000,  gain: p.b6g ?? 0,   q: p.b6q ?? 1, color: '#ec4899' },
    { key: 'b7', label: 'AIR',  freq: p.b7f ?? 14000, gain: p.b7g ?? 0,   q: p.b7q ?? 1, color: '#22d3ee' },
    { key: 'b8', label: 'LPF',  freq: p.b8f ?? 20000, gain: 0,            q: 0.7,       color: '#64748b' },
  ]
  const ab = bands[activeBand]

  return (
    <div className="fs-proq-wrap">
      <FSPluginBg
        gradient="linear-gradient(160deg, #0c0620 0%, #110a30 40%, #08101e 80%, #0a0818 100%)"
        accentColor="#a855f7" showGrid
      >
        {/* EQ Curve Display */}
        <div style={{ padding: '8px 10px 3px', borderBottom: '1px solid rgba(168,85,247,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 8, color: 'rgba(168,85,247,0.6)', letterSpacing: 1, fontWeight: 700 }}>SPECTRUM ANALYZER</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>PRE</span>
              <div style={{ width: 20, height: 8, background: 'rgba(168,85,247,0.3)', borderRadius: 2 }} />
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>POST</span>
            </div>
          </div>
          <EQCurvePreview
            bands={bands.filter(b => b.gain !== 0)}
            width={290} height={54}
          />
        </div>

        {/* Band selector pills */}
        <div style={{ display: 'flex', gap: 3, padding: '6px 10px 4px' }}>
          {bands.map((b, i) => (
            <button key={b.key}
              className="fs-band-pill"
              style={{
                borderColor: activeBand === i ? b.color : 'rgba(255,255,255,0.1)',
                color: activeBand === i ? b.color : 'rgba(255,255,255,0.35)',
                background: activeBand === i ? b.color + '20' : 'transparent',
                boxShadow: activeBand === i ? `0 0 8px ${b.color}44` : 'none',
                padding: '2px 6px', fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                border: '1px solid', borderRadius: 3, cursor: 'pointer', transition: 'all 0.15s',
              }}
              onClick={() => setActiveBand(i)}>{b.label}
            </button>
          ))}
        </div>

        {/* Active band controls */}
        <div style={{ display: 'flex', gap: 4, padding: '4px 10px 6px', alignItems: 'flex-start' }}>
          <FSKnob label="FREQ" value={ab.freq} min={20} max={20000} step={1} unit=" Hz"
            color={ab.color} size={40}
            onChange={v => onChange({ ...p, [`${ab.key}f`]: v })} />
          {ab.label !== 'HPF' && ab.label !== 'LPF' && <>
            <FSKnob label="GAIN" value={ab.gain} min={-24} max={24} step={0.1} unit=" dB"
              color={ab.color} glowing={Math.abs(ab.gain) > 3} centerZero size={40}
              onChange={v => onChange({ ...p, [`${ab.key}g`]: v })} />
            <FSKnob label="Q" value={ab.q} min={0.1} max={18} step={0.05}
              color={ab.color} size={40}
              onChange={v => onChange({ ...p, [`${ab.key}q`]: v })} />
          </>}
          <FSKnob label="OUT" value={p.output ?? 0} min={-12} max={12} step={0.1} unit=" dB"
            color="#64748b" size={36} centerZero
            onChange={v => onChange({ ...p, output: v })} />
        </div>

        {/* Processing options */}
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="PROC" opts={['ST','MID','SIDE','L','R']} value={p.proc ?? 0}
            onChange={v => onChange({ ...p, proc: v })} color="#a855f7" />
          <StepBtns label="DYN" opts={['OFF','ON']} value={p.dynamic ?? 0}
            onChange={v => onChange({ ...p, dynamic: v })} color="#10b981" />
          <StepBtns label="PHASE" opts={['MIN','NAT','LIN']} value={p.phase ?? 1}
            onChange={v => onChange({ ...p, phase: v })} color="#3b82f6" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. FS-Resonate — Dynamic Resonance Suppressor (> Soothe 2)
// Features animated spectral activity display, delta mode, focus bands
// ══════════════════════════════════════════════════════════════════════════════
const INIT_SPECTRUM = Array.from({ length: 36 }, (_, i) => 0.2 + Math.sin(i * 0.7) * 0.15 + Math.random() * 0.25)

function ResonateEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const [spec, setSpec] = useState(INIT_SPECTRUM)
  const [reduction, setReduction] = useState<number[]>(Array(36).fill(0))

  useEffect(() => {
    const id = setInterval(() => {
      setSpec(prev => prev.map((v, i) => {
        const target = 0.15 + Math.sin(Date.now() / 800 + i * 0.5) * 0.2 + Math.sin(Date.now() / 200 + i * 1.2) * 0.1
        return v + (target - v) * 0.15
      }))
      setReduction(prev => prev.map((v, i) => {
        const depth = p.depth ?? 5
        const active = spec[i] > 0.45 + (1 - (p.sensitivity ?? 0.5)) * 0.3
        const target = active ? (depth / 24) * 0.6 : 0
        return v + (target - v) * 0.2
      }))
    }, 80)
    return () => clearInterval(id)
  }, [p.depth, p.sensitivity, spec])

  return (
    <div className="fs-resonate-wrap">
      <FSPluginBg
        gradient="linear-gradient(155deg, #041410 0%, #082018 40%, #051208 80%, #030d08 100%)"
        accentColor="#10b981" showNoise showGrid
      >
        {/* Spectral resonance display */}
        <div style={{ padding: '7px 10px 3px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 8, color: 'rgba(16,185,129,0.55)', letterSpacing: 1, fontWeight: 700 }}>RESONANCE ACTIVITY</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 8, color: 'rgba(16,185,129,0.4)' }}>● INPUT</span>
              <span style={{ fontSize: 8, color: 'rgba(239,68,68,0.4)' }}>● REDUCTION</span>
            </div>
          </div>
          <SpectrumBar bands={spec} color="#10b981" height={44} reduction={reduction} />
          {/* Frequency axis */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            {['20', '100', '500', '2k', '8k', '20k'].map(f => (
              <span key={f} style={{ fontSize: 7, color: 'rgba(255,255,255,0.15)' }}>{f}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '5px 10px' }}>
          <FSKnob label="DEPTH"  value={p.depth ?? 5}           min={0}   max={24}  step={0.5} unit=" dB"  color="#10b981" size={40} glowing={(p.depth ?? 5) > 8} onChange={v => onChange({ ...p, depth: v })} />
          <FSKnob label="SHARP"  value={p.sharpness ?? 0.5}     min={0}   max={1}   step={0.01}            color="#34d399" size={40} onChange={v => onChange({ ...p, sharpness: v })} />
          <FSKnob label="SPEED"  value={p.speed ?? 5}           min={0.1} max={30}  step={0.1}             color="#10b981" size={40} onChange={v => onChange({ ...p, speed: v })} />
          <FSKnob label="SENS"   value={p.sensitivity ?? 0.5}   min={0}   max={1}   step={0.01}            color="#6ee7b7" size={40} onChange={v => onChange({ ...p, sensitivity: v })} />
          <FSKnob label="MIX"    value={p.mix ?? 1}             min={0}   max={1}   step={0.01}            color="#10b981" size={40} onChange={v => onChange({ ...p, mix: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="FOCUS" opts={['FULL','LO','MID','HI','PRES']} value={p.focus ?? 0} onChange={v => onChange({ ...p, focus: v })} color="#10b981" />
          <StepBtns label="DELTA" opts={['OFF','ON']} value={p.delta ?? 0} onChange={v => onChange({ ...p, delta: v })} color="#f59e0b" />
          <StepBtns label="MODE"  opts={['SMOOTH','PRECISE','SURGICAL']} value={p.mode ?? 0} onChange={v => onChange({ ...p, mode: v })} color="#10b981" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. FS-Cosmos — 18-Mode Algorithmic Reverb (> Valhalla VintageVerb)
// Features dynamic background color shift per mode, mod control
// ══════════════════════════════════════════════════════════════════════════════
const COSMOS_MODES = [
  'ROOM','HALL','PLATE','SPRING','CHAMBER','CATHEDRAL',
  'SHIMMER','INVERSE','NONLINEAR','STADIUM','CAVE','EPIC',
  'CLOUD','BLACKHOLE','BLOOM','GHOST','VINTAGE','AMBIENT'
]
const COSMOS_COLORS = [
  '#60a5fa','#818cf8','#f0abfc','#34d399','#fb923c','#e879f9',
  '#c084fc','#f472b6','#94a3b8','#22d3ee','#a3e635','#a855f7',
  '#facc15','#38bdf8','#4ade80','#64748b','#f59e0b','#6366f1'
]

function CosmosEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const modeIdx = Math.round(p.mode ?? 0)
  const mc = COSMOS_COLORS[modeIdx % COSMOS_COLORS.length]

  return (
    <div className="fs-cosmos-wrap">
      <FSPluginBg
        gradient={`radial-gradient(ellipse at 25% 60%, ${mc}20 0%, transparent 55%), radial-gradient(ellipse at 80% 20%, ${mc}12 0%, transparent 50%), linear-gradient(160deg, #05051a 0%, #0a0a22 100%)`}
        accentColor={mc} showNoise
      >
        {/* Mode display bar */}
        <div style={{ padding: '7px 10px 5px', borderBottom: `1px solid ${mc}22` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: mc,
              boxShadow: `0 0 10px ${mc}`, flexShrink: 0
            }} />
            <span style={{ fontSize: 10, color: mc, fontWeight: 800, letterSpacing: 1.5 }}>
              {COSMOS_MODES[modeIdx]}
            </span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${mc}44, transparent)` }} />
          </div>
          {/* Mode grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {COSMOS_MODES.map((m, i) => (
              <button key={m}
                style={{
                  padding: '2px 5px', fontSize: 8, fontWeight: 600, letterSpacing: 0.3,
                  border: `1px solid ${modeIdx === i ? COSMOS_COLORS[i] : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 3, cursor: 'pointer',
                  background: modeIdx === i ? COSMOS_COLORS[i] + '28' : 'rgba(0,0,0,0.3)',
                  color: modeIdx === i ? COSMOS_COLORS[i] : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.12s',
                  boxShadow: modeIdx === i ? `0 0 8px ${COSMOS_COLORS[i]}44` : 'none',
                }}
                onClick={() => onChange({ ...p, mode: i })}>{m}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '6px 10px' }}>
          <FSKnob label="WET"    value={p.wet ?? 0.3}           min={0}   max={1}   step={0.01}            color={mc}  size={40} onChange={v => onChange({ ...p, wet: v })} />
          <FSKnob label="SIZE"   value={p.size ?? 1.5}          min={0.1} max={12}  step={0.1}  unit=" s"  color={mc}  size={40} onChange={v => onChange({ ...p, size: v })} />
          <FSKnob label="DECAY"  value={p.decay ?? 0.5}         min={0}   max={1}   step={0.01}            color={mc}  size={40} onChange={v => onChange({ ...p, decay: v })} />
          <FSKnob label="DAMP"   value={p.damp ?? 0.5}          min={0}   max={1}   step={0.01}            color={mc}  size={40} onChange={v => onChange({ ...p, damp: v })} />
          <FSKnob label="PRE"    value={(p.predelay ?? 0.02)*1000} min={0} max={150} step={1}  unit=" ms" color={mc}  size={36} onChange={v => onChange({ ...p, predelay: v/1000 })} />
          <FSKnob label="MOD"    value={p.mod ?? 0.3}           min={0}   max={1}   step={0.01}            color={mc}  size={36} onChange={v => onChange({ ...p, mod: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px' }}>
          <StepBtns label="COLOR" opts={['WARM','NEUTRAL','BRIGHT']} value={p.color ?? 1} onChange={v => onChange({ ...p, color: v })} color={mc} />
          <StepBtns label="PROC"  opts={['STEREO','M/S']}            value={p.proc ?? 0}  onChange={v => onChange({ ...p, proc: v })}  color={mc} />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. FS-Echo — Tape/BBD/Analog Delay (> SoundToys EchoBoy)
// Tape flutter, analog warmth, galaxy reverb-delay hybrid
// ══════════════════════════════════════════════════════════════════════════════
const ECHO_STYLES = ['CLEAN','TAPE','ANALOG','GALAXY','REVERSE','MULTI']
const ECHO_COLORS = ['#60a5fa','#f59e0b','#f97316','#818cf8','#f472b6','#22d3ee']

function EchoEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const styleIdx = Math.round(p.style ?? 1)
  const sc = ECHO_COLORS[styleIdx]

  // Animated delay visualization
  const [echoViz, setEchoViz] = useState([0.8, 0.5, 0.3, 0.18, 0.1, 0.06])
  useEffect(() => {
    const fb = p.feedback ?? 0.4
    const levels = [1]
    for (let i = 1; i < 6; i++) levels.push(levels[i-1] * fb * 0.9)
    setEchoViz(levels)
  }, [p.feedback])

  return (
    <div className="fs-echo-wrap">
      <FSPluginBg
        gradient="linear-gradient(170deg, #120900 0%, #1a0d00 35%, #0d0900 70%, #060600 100%)"
        accentColor={sc} showNoise
      >
        {/* Tape style header */}
        <div style={{ padding: '7px 10px 5px', borderBottom: `1px solid ${sc}20` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Echo repeat visualization */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
              {echoViz.map((v, i) => (
                <div key={i} style={{
                  width: 6, height: `${Math.max(4, v * 100)}%`,
                  background: `linear-gradient(to top, ${sc}, ${sc}66)`,
                  borderRadius: '2px 2px 0 0',
                  opacity: 0.7 + i * 0.05,
                }} />
              ))}
            </div>
            <div style={{ flex: 1 }}>
              <StepBtns label="STYLE" opts={ECHO_STYLES} value={styleIdx} onChange={v => onChange({ ...p, style: v })} color={sc} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '6px 10px' }}>
          <FSKnob label="WET"     value={p.wet ?? 0.3}             min={0}   max={1}    step={0.01}           color={sc}   size={40} onChange={v => onChange({ ...p, wet: v })} />
          <FSKnob label="TIME"    value={(p.time ?? 0.375)*1000}   min={1}   max={2000} step={1}   unit=" ms" color={sc}   size={40} onChange={v => onChange({ ...p, time: v/1000 })} />
          <FSKnob label="FDBK"    value={p.feedback ?? 0.4}        min={0}   max={0.98} step={0.01}           color={sc}   size={40} glowing={(p.feedback ?? 0.4) > 0.7} onChange={v => onChange({ ...p, feedback: v })} />
          <FSKnob label="TONE"    value={p.tone ?? 0.5}            min={0}   max={1}    step={0.01}           color={sc}   size={40} onChange={v => onChange({ ...p, tone: v })} />
          <FSKnob label="FLUTTER" value={p.flutter ?? 0}           min={0}   max={1}    step={0.01}           color="#fb923c" size={36} onChange={v => onChange({ ...p, flutter: v })} />
          <FSKnob label="SPREAD"  value={p.spread ?? 0.7}          min={0}   max={1}    step={0.01}           color={sc}   size={36} onChange={v => onChange({ ...p, spread: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="SYNC"   opts={['FREE','¼','⅛','½','1/16','3/16']} value={p.sync ?? 0} onChange={v => onChange({ ...p, sync: v })} color={sc} />
          <StepBtns label="STEREO" opts={['MONO','PING','WIDE']} value={p.stereo ?? 1} onChange={v => onChange({ ...p, stereo: v })} color={sc} />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. FS-Voice — Real-Time Pitch + Formant Corrector (> Auto-Tune 2026)
// Piano-roll key selector, scale correction, T-Pain effect
// ══════════════════════════════════════════════════════════════════════════════
const VOICE_KEYS   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const VOICE_SCALES = ['CHROM','MAJOR','MINOR','HARM.M','PENTA','BLUES','CUSTOM']
const SHARP_KEYS   = new Set(['C#','D#','F#','G#','A#'])

function VoiceEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const [pitchAnim, setPitchAnim] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setPitchAnim(Math.sin(Date.now() / 600) * 12), 50)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="fs-voice-wrap">
      <FSPluginBg
        gradient="linear-gradient(155deg, #120018 0%, #0e0018 40%, #0a0014 80%, #08000e 100%)"
        accentColor="#a855f7" showNoise showGrid
      >
        {/* Piano roll key selector */}
        <div style={{ padding: '7px 10px 5px' }}>
          <span style={{ fontSize: 8, color: 'rgba(168,85,247,0.5)', letterSpacing: 1, fontWeight: 700 }}>ROOT KEY</span>
          <div style={{ display: 'flex', position: 'relative', height: 32, marginTop: 4, gap: 2 }}>
            {VOICE_KEYS.map((k, i) => {
              const isSharp = SHARP_KEYS.has(k)
              const isActive = Math.round(p.key ?? 0) === i
              return (
                <button key={k}
                  style={{
                    flex: isSharp ? 0.7 : 1,
                    height: isSharp ? '65%' : '100%',
                    alignSelf: 'flex-start',
                    background: isActive ? '#a855f7' : (isSharp ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'),
                    border: `1px solid ${isActive ? '#a855f7' : 'rgba(0,0,0,0.3)'}`,
                    borderRadius: '0 0 3px 3px',
                    cursor: 'pointer',
                    fontSize: 7,
                    color: isActive ? '#fff' : (isSharp ? '#fff' : '#111'),
                    fontWeight: 700,
                    boxShadow: isActive ? '0 0 10px #a855f788' : 'none',
                    padding: 0,
                    transition: 'all 0.1s',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2,
                  }}
                  onClick={() => onChange({ ...p, key: i })}
                >{!isSharp ? k : ''}</button>
              )
            })}
          </div>
        </div>

        {/* Live pitch meter */}
        <div style={{ padding: '3px 10px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 8, color: 'rgba(168,85,247,0.4)' }}>PITCH DETECT</span>
          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              width: 2, height: '100%', background: 'rgba(255,255,255,0.2)',
            }} />
            <div style={{
              position: 'absolute',
              left: `${50 + pitchAnim * 1.5}%`,
              top: 0, width: 4, height: '100%',
              background: '#a855f7', borderRadius: 2,
              boxShadow: '0 0 6px #a855f7',
              transform: 'translateX(-50%)',
              transition: 'left 0.05s ease',
            }} />
          </div>
          <span style={{ fontSize: 8, color: '#a855f7', minWidth: 28, textAlign: 'right' }}>
            {pitchAnim > 0 ? '+' : ''}{pitchAnim.toFixed(1)}¢
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '5px 10px' }}>
          <FSKnob label="SPEED"   value={p.speed ?? 25}   min={0}   max={100}  step={1}   unit=" ms"  color="#a855f7"  size={40} onChange={v => onChange({ ...p, speed: v })} />
          <FSKnob label="AMOUNT"  value={p.amount ?? 100} min={0}   max={100}  step={1}   unit="%"    color="#a855f7"  size={40} onChange={v => onChange({ ...p, amount: v })} />
          <FSKnob label="FORMANT" value={p.formant ?? 0}  min={-12} max={12}   step={0.1} unit=" st"  color="#e879f9"  size={40} onChange={v => onChange({ ...p, formant: v })} />
          <FSKnob label="PITCH"   value={p.pitch ?? 0}    min={-24} max={24}   step={0.1} unit=" st"  color="#c084fc"  size={40} onChange={v => onChange({ ...p, pitch: v })} />
          <FSKnob label="VIBRATO" value={p.vibrato ?? 0}  min={0}   max={1}    step={0.01}            color="#818cf8"  size={36} onChange={v => onChange({ ...p, vibrato: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="SCALE"  opts={VOICE_SCALES}               value={p.scale ?? 0}  onChange={v => onChange({ ...p, scale: v })}   color="#a855f7" />
          <StepBtns label="STYLE"  opts={['NATURAL','HARD','T-PAIN']} value={p.effect ?? 0} onChange={v => onChange({ ...p, effect: v })} color="#e879f9" />
          <StepBtns label="GENDER" opts={['♀','○','♂']}              value={p.gender ?? 1} onChange={v => onChange({ ...p, gender: v })}  color="#c084fc" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. FS-Master — Full Mastering Suite (> iZotope Ozone 11)
// 4 tabs: TONAL / DYNAMICS / STEREO / LOUDNESS
// ══════════════════════════════════════════════════════════════════════════════
const MASTER_TABS = ['TONAL','DYNAMICS','STEREO','LOUDNESS']

function MasterEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const [tab, setTab] = useState(0)
  const tabColors = ['#f59e0b','#10b981','#38bdf8','#f472b6']
  const tc = tabColors[tab]

  // LUFS meter simulation
  const [lufs, setLufs] = useState(-18)
  useEffect(() => {
    const id = setInterval(() => setLufs(prev => {
      const target = (p.lufs ?? -14) + (Math.random() - 0.5) * 3
      return prev + (target - prev) * 0.1
    }), 120)
    return () => clearInterval(id)
  }, [p.lufs])

  return (
    <div className="fs-master-wrap">
      <FSPluginBg
        gradient="linear-gradient(165deg, #0a0a00 0%, #100e00 40%, #080800 100%)"
        accentColor={tc} showNoise showGrid
      >
        {/* Tab header */}
        <div style={{ display: 'flex', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          {MASTER_TABS.map((t, i) => (
            <button key={t}
              className="fs-master-tab"
              style={{
                flex: 1, padding: '6px 2px', fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                cursor: 'pointer', border: 'none', background: 'transparent',
                color: tab === i ? tabColors[i] : 'rgba(255,255,255,0.25)',
                borderBottom: tab === i ? `2px solid ${tabColors[i]}` : '2px solid transparent',
                transition: 'all 0.15s',
              }}
              onClick={() => setTab(i)}>{t}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <div style={{ display: 'flex', gap: 4, padding: '6px 10px' }}>
            <FSKnob label="LOW"    value={p.low ?? 0}    min={-12} max={12} step={0.5} unit=" dB" color={tc} size={40} centerZero onChange={v => onChange({ ...p, low: v })} />
            <FSKnob label="LO-MID" value={p.lom ?? 0}    min={-12} max={12} step={0.5} unit=" dB" color={tc} size={40} centerZero onChange={v => onChange({ ...p, lom: v })} />
            <FSKnob label="HI-MID" value={p.him ?? 0}    min={-12} max={12} step={0.5} unit=" dB" color={tc} size={40} centerZero onChange={v => onChange({ ...p, him: v })} />
            <FSKnob label="HIGH"   value={p.high ?? 0}   min={-12} max={12} step={0.5} unit=" dB" color={tc} size={40} centerZero onChange={v => onChange({ ...p, high: v })} />
            <FSKnob label="EXC"    value={p.excite ?? 0} min={0}   max={10} step={0.1}            color={tc} size={36}           onChange={v => onChange({ ...p, excite: v })} />
          </div>
        )}
        {tab === 1 && (
          <div style={{ display: 'flex', gap: 4, padding: '6px 10px' }}>
            <FSKnob label="THRESH"  value={p.cThresh ?? -12}           min={-40} max={0}    step={0.5} unit=" dB"  color={tc} size={40} onChange={v => onChange({ ...p, cThresh: v })} />
            <FSKnob label="RATIO"   value={p.cRatio ?? 2}              min={1}   max={10}   step={0.5} unit=":1"   color={tc} size={40} onChange={v => onChange({ ...p, cRatio: v })} />
            <FSKnob label="ATTACK"  value={(p.cAttack ?? 0.01)*1000}   min={0.1} max={200}  step={0.1} unit=" ms"  color={tc} size={40} onChange={v => onChange({ ...p, cAttack: v/1000 })} />
            <FSKnob label="RELEASE" value={(p.cRelease ?? 0.15)*1000}  min={10}  max={2000} step={10}  unit=" ms"  color={tc} size={40} onChange={v => onChange({ ...p, cRelease: v/1000 })} />
            <FSKnob label="MAKEUP"  value={p.cMakeup ?? 0}             min={0}   max={12}   step={0.5} unit=" dB"  color={tc} size={36} onChange={v => onChange({ ...p, cMakeup: v })} />
          </div>
        )}
        {tab === 2 && (
          <div style={{ display: 'flex', gap: 4, padding: '6px 10px' }}>
            <FSKnob label="WIDTH"   value={p.width ?? 1}   min={0}   max={2.5}  step={0.01}          color={tc} size={40} onChange={v => onChange({ ...p, width: v })} />
            <FSKnob label="BALANCE" value={p.balance ?? 0} min={-1}  max={1}    step={0.01}          color={tc} size={40} centerZero onChange={v => onChange({ ...p, balance: v })} />
            <FSKnob label="BASS MN" value={p.bassM ?? 120} min={0}   max={300}  step={10}  unit=" Hz" color={tc} size={40} onChange={v => onChange({ ...p, bassM: v })} />
            <FSKnob label="SIDE HF" value={p.sideHF ?? 0}  min={-12} max={12}   step={0.5} unit=" dB" color={tc} size={40} centerZero onChange={v => onChange({ ...p, sideHF: v })} />
          </div>
        )}
        {tab === 3 && (
          <div>
            {/* LUFS meter bar */}
            <div style={{ padding: '5px 10px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 8, color: `${tc}77`, letterSpacing: 0.5 }}>INTEGRATED LUFS</span>
              <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, (lufs + 30) / 24 * 100))}%`,
                  background: `linear-gradient(90deg, #10b981, ${tc})`,
                  borderRadius: 4, transition: 'width 0.1s',
                }} />
              </div>
              <span style={{ fontSize: 9, color: tc, minWidth: 44, textAlign: 'right', fontWeight: 700 }}>
                {lufs.toFixed(1)} LU
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '5px 10px' }}>
              <FSKnob label="TARGET"  value={p.lufs ?? -14}          min={-23} max={-6}   step={0.5} unit=" LUFS" color={tc} size={40} onChange={v => onChange({ ...p, lufs: v })} />
              <FSKnob label="CEILING" value={p.ceiling ?? -1}        min={-6}  max={0}    step={0.1} unit=" dBTP" color={tc} size={40} glowing onChange={v => onChange({ ...p, ceiling: v })} />
              <FSKnob label="RELEASE" value={(p.lRelease ?? 0.05)*1000} min={1} max={500} step={1}   unit=" ms"   color={tc} size={40} onChange={v => onChange({ ...p, lRelease: v/1000 })} />
              <FSKnob label="MARGIN"  value={p.margin ?? 0.3}        min={0}   max={3}    step={0.1} unit=" dB"   color={tc} size={36} onChange={v => onChange({ ...p, margin: v })} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="PLATFORM" opts={['SPOTIFY','APPLE','YT','MASTER']} value={p.platform ?? 3} onChange={v => onChange({ ...p, platform: v })} color={tc} />
          <StepBtns label="DITHER"   opts={['OFF','TPDF','NS']}                value={p.dither ?? 0}   onChange={v => onChange({ ...p, dither: v })}   color={tc} />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. FS-Spacer — Sidechain Spectral Carver (> Wavesfactory Trackspacer)
// Carves sidechain spectral footprint using inverse EQ curve
// ══════════════════════════════════════════════════════════════════════════════
function SpacerEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const [inputSpec, setInputSpec] = useState(Array.from({ length: 28 }, (_, i) => 0.3 + Math.sin(i * 0.6) * 0.2))
  const [carvedSpec, setCarvedSpec] = useState(Array.from({ length: 28 }, () => 0.1))

  useEffect(() => {
    const id = setInterval(() => {
      setInputSpec(prev => prev.map((v, i) => {
        const t = Date.now() / 1000
        return Math.max(0.05, Math.min(0.95, v + (Math.sin(t * 1.2 + i * 0.7) * 0.08)))
      }))
      setCarvedSpec(prev => {
        return inputSpec.map(v => v * (p.depth ?? 0.5))
      })
    }, 90)
    return () => clearInterval(id)
  }, [p.depth, inputSpec])

  return (
    <div className="fs-spacer-wrap">
      <FSPluginBg
        gradient="linear-gradient(160deg, #001520 0%, #002030 40%, #000f1a 80%, #000810 100%)"
        accentColor="#38bdf8" showNoise showGrid
      >
        {/* Dual spectrum display */}
        <div style={{ padding: '7px 10px 4px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: 'rgba(56,189,248,0.5)', marginBottom: 2, fontWeight: 700, letterSpacing: 0.5 }}>SIDECHAIN</div>
              <SpectrumBar bands={inputSpec} color="#38bdf8" height={34} />
            </div>
            <div style={{ width: 1, height: 34, background: 'rgba(255,255,255,0.06)', alignSelf: 'flex-end' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: 'rgba(244,114,182,0.5)', marginBottom: 2, fontWeight: 700, letterSpacing: 0.5 }}>CARVED OUT</div>
              <SpectrumBar bands={carvedSpec} color="#f47280" height={34} />
            </div>
          </div>
          {/* Inverse EQ curve hint */}
          <div style={{ marginTop: 3, height: 18, background: 'rgba(0,0,0,0.3)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
            <div style={{ display: 'flex', height: '100%', alignItems: 'flex-end' }}>
              {carvedSpec.map((v, i) => (
                <div key={i} style={{
                  flex: 1, height: `${(1 - v) * 100}%`,
                  background: `rgba(56,189,248,0.3)`,
                  borderRadius: '1px 1px 0 0',
                }} />
              ))}
            </div>
            <div style={{ position: 'absolute', top: 4, left: 6, fontSize: 7, color: 'rgba(56,189,248,0.4)', fontWeight: 700, letterSpacing: 0.5 }}>
              INVERSE EQ CURVE
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '4px 10px' }}>
          <FSKnob label="DEPTH"  value={p.depth ?? 0.5}   min={0}   max={1}     step={0.01}           color="#38bdf8" size={40} glowing={(p.depth ?? 0.5) > 0.6} onChange={v => onChange({ ...p, depth: v })} />
          <FSKnob label="SPEED"  value={p.speed ?? 10}    min={0.5} max={50}    step={0.5}            color="#38bdf8" size={40} onChange={v => onChange({ ...p, speed: v })} />
          <FSKnob label="RANGE"  value={p.rangeHz ?? 500} min={20}  max={20000} step={10}  unit=" Hz" color="#7dd3fc" size={40} onChange={v => onChange({ ...p, rangeHz: v })} />
          <FSKnob label="SMOOTH" value={p.smooth ?? 0.5}  min={0}   max={1}     step={0.01}           color="#38bdf8" size={40} onChange={v => onChange({ ...p, smooth: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="BANDS" opts={['8','16','32','64']}        value={p.bands ?? 1}  onChange={v => onChange({ ...p, bands: v })}  color="#38bdf8" />
          <StepBtns label="SC"    opts={['INTERNAL','SIDECHAIN']}    value={p.scSrc ?? 0}  onChange={v => onChange({ ...p, scSrc: v })}  color="#38bdf8" />
          <StepBtns label="LINK"  opts={['STEREO','M/S','L/R']}      value={p.link ?? 0}   onChange={v => onChange({ ...p, link: v })}   color="#38bdf8" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. FS-Apex — True-Peak Limiter + ISP Detection (> FabFilter Pro-L 2)
// 5 limiting algorithms, ISP true-peak, LUFS display, GR meter
// ══════════════════════════════════════════════════════════════════════════════
const APEX_ALGOS = ['TRANSPARENT','AGGRESSIVE','SURGICAL','ALLROUND','SAFE','OVERLOAD']

function ApexEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const algoIdx = Math.round(p.algo ?? 2)
  const algoColors = ['#60a5fa','#ef4444','#a855f7','#f59e0b','#10b981','#f97316']
  const ac = algoColors[algoIdx]

  const [gr, setGr] = useState(0)
  const [tp, setTp] = useState(-6)

  useEffect(() => {
    const id = setInterval(() => {
      const grTarget = Math.random() * (p.threshold ?? -1 < -6 ? 8 : 2)
      const tpTarget = (p.ceiling ?? -0.1) - Math.random() * 0.3
      setGr(prev => prev + (grTarget - prev) * 0.2)
      setTp(prev => prev + (tpTarget - prev) * 0.15)
    }, 80)
    return () => clearInterval(id)
  }, [p.threshold, p.ceiling])

  return (
    <div className="fs-apex-wrap">
      <FSPluginBg
        gradient="linear-gradient(165deg, #150000 0%, #220000 40%, #100000 80%, #080000 100%)"
        accentColor={ac} showNoise showGrid
      >
        {/* Algorithm selector + GR meters */}
        <div style={{ padding: '7px 10px 5px', borderBottom: `1px solid ${ac}18` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <StepBtns label="ALGO" opts={APEX_ALGOS} value={algoIdx} onChange={v => onChange({ ...p, algo: v })} color={ac} />
          </div>
          {/* GR + TP meters */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: `${ac}66`, marginBottom: 2, letterSpacing: 0.5, fontWeight: 700 }}>GR</div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, gr * 8)}%`, height: '100%',
                  background: `linear-gradient(90deg, ${ac}, ${ac}88)`,
                  borderRadius: 4, transition: 'width 0.06s',
                }} />
              </div>
              <div style={{ fontSize: 8, color: ac, textAlign: 'right', marginTop: 1, fontWeight: 700 }}>
                -{gr.toFixed(1)} dB
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginBottom: 2, letterSpacing: 0.5, fontWeight: 700 }}>TRUE PEAK</div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, (tp + 12) / 12 * 100))}%`,
                  height: '100%',
                  background: tp > -0.5 ? '#ef4444' : '#10b981',
                  borderRadius: 4, transition: 'width 0.06s',
                }} />
              </div>
              <div style={{ fontSize: 8, color: tp > -0.5 ? '#ef4444' : '#10b981', textAlign: 'right', marginTop: 1, fontWeight: 700 }}>
                {tp.toFixed(1)} dBTP
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '5px 10px' }}>
          <FSKnob label="INPUT"   value={p.input ?? 0}       min={-12} max={12}  step={0.1} unit=" dB"   color={ac}     size={40} centerZero onChange={v => onChange({ ...p, input: v })} />
          <FSKnob label="THRESH"  value={p.threshold ?? -1}  min={-24} max={0}   step={0.1} unit=" dB"   color={ac}     size={40} glowing onChange={v => onChange({ ...p, threshold: v })} />
          <FSKnob label="CEILING" value={p.ceiling ?? -0.1}  min={-6}  max={0}   step={0.1} unit=" dBTP" color={ac}     size={40} onChange={v => onChange({ ...p, ceiling: v })} />
          <FSKnob label="RELEASE" value={(p.release ?? 0.05)*1000} min={1} max={1000} step={1} unit=" ms" color={ac}   size={40} onChange={v => onChange({ ...p, release: v/1000 })} />
          <FSKnob label="LINK"    value={p.stereoLink ?? 1}  min={0}   max={1}   step={0.01}              color="#64748b" size={36} onChange={v => onChange({ ...p, stereoLink: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="TRUE PEAK" opts={['OFF','ON']}       value={p.truePeak ?? 1}  onChange={v => onChange({ ...p, truePeak: v })}  color="#10b981" />
          <StepBtns label="DITHER"    opts={['OFF','TPDF','NS']} value={p.dither ?? 0}   onChange={v => onChange({ ...p, dither: v })}    color="#64748b" />
          <StepBtns label="ISP"       opts={['OFF','ON']}        value={p.isp ?? 1}      onChange={v => onChange({ ...p, isp: v })}        color="#f59e0b" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. FS-Mutate — Vocal Transformer (> Soundtoys Little AlterBoy)
// 6 modes: transpose, formant, robot, monster, harmony, whisper
// ══════════════════════════════════════════════════════════════════════════════
const MUTATE_MODES  = ['TRANSPOSE','FORMANT','ROBOT','MONSTER','HARMONY','WHISPER']
const MUTATE_COLORS = ['#22d3ee','#e879f9','#94a3b8','#4ade80','#f59e0b','#818cf8']

function MutateEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const modeIdx = Math.round(p.mode ?? 0)
  const mc = MUTATE_COLORS[modeIdx]

  // Pitch shift visualizer
  const [waveViz, setWaveViz] = useState(Array(40).fill(0).map((_, i) => Math.sin(i * 0.5) * 0.5))
  useEffect(() => {
    const id = setInterval(() => {
      const pitch = p.pitch ?? 0
      const formant = p.formant ?? 0
      setWaveViz(Array(40).fill(0).map((_, i) => {
        const t = Date.now() / 400
        return Math.sin(i * 0.5 * (1 + pitch / 24) + t) * 0.5 * (1 + formant * 0.1)
      }))
    }, 60)
    return () => clearInterval(id)
  }, [p.pitch, p.formant])

  return (
    <div className="fs-mutate-wrap">
      <FSPluginBg
        gradient={`radial-gradient(circle at 75% 25%, ${mc}18 0%, transparent 55%), linear-gradient(165deg, #000a10 0%, #050015 60%, #020008 100%)`}
        accentColor={mc} showNoise
      >
        {/* Wave visualizer */}
        <div style={{ padding: '7px 10px 4px', borderBottom: `1px solid ${mc}18` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: mc,
              boxShadow: `0 0 12px ${mc}`, flexShrink: 0,
            }} />
            <span style={{ fontSize: 10, color: mc, fontWeight: 800, letterSpacing: 2 }}>
              {MUTATE_MODES[modeIdx]}
            </span>
          </div>
          <svg width="100%" height={28} viewBox="0 0 280 28" preserveAspectRatio="none">
            <path
              d={`M ${waveViz.map((v, i) => `${i * 7},${14 + v * 12}`).join(' L ')}`}
              fill="none" stroke={mc} strokeWidth={1.5} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${mc}88)` }}
            />
          </svg>
        </div>

        <div style={{ padding: '5px 10px 4px' }}>
          <StepBtns label="MODE" opts={MUTATE_MODES} value={modeIdx} onChange={v => onChange({ ...p, mode: v })} color={mc} />
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '4px 10px' }}>
          <FSKnob label="PITCH"   value={p.pitch ?? 0}   min={-24} max={24}  step={0.5} unit=" st" color={mc} size={40} glowing={p.pitch !== 0} centerZero onChange={v => onChange({ ...p, pitch: v })} />
          <FSKnob label="FORMANT" value={p.formant ?? 0} min={-12} max={12}  step={0.5} unit=" st" color={mc} size={40} centerZero onChange={v => onChange({ ...p, formant: v })} />
          <FSKnob label="MIX"     value={p.mix ?? 1}     min={0}   max={1}   step={0.01}           color={mc} size={40} onChange={v => onChange({ ...p, mix: v })} />
          <FSKnob label="DETUNE"  value={p.detune ?? 0}  min={-50} max={50}  step={1}   unit=" c"  color={mc} size={40} centerZero onChange={v => onChange({ ...p, detune: v })} />
          <FSKnob label="OUT"     value={p.output ?? 0}  min={-12} max={12}  step={0.1} unit=" dB" color={mc} size={36} centerZero onChange={v => onChange({ ...p, output: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px' }}>
          <StepBtns label="ALGO"  opts={['NATURAL','QUALITY','EXTREME']} value={p.algo ?? 0}  onChange={v => onChange({ ...p, algo: v })}  color={mc} />
          <StepBtns label="VOICE" opts={['SOLO','DUO','CHOIR']}          value={p.voice ?? 0} onChange={v => onChange({ ...p, voice: v })} color={mc} />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. FS-Glitch — 16-Step Multi-FX Sequencer (> Sugar Bytes Looperator)
// 8 FX types, animated step playhead, per-step velocity, BPM sync
// ══════════════════════════════════════════════════════════════════════════════
const GLITCH_FX  = ['GATE','REV','PITCH','FILTER','STUTTER','CRUSH','DELAY','STRETCH']
const GLITCH_FX_COLORS = ['#ef4444','#a855f7','#f59e0b','#3b82f6','#ec4899','#f97316','#22d3ee','#4ade80']
const STEPS = 16

function GlitchEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(-1)
  const fxIdx = Math.round(p.fx ?? 0)
  const gc = GLITCH_FX_COLORS[fxIdx % GLITCH_FX_COLORS.length]

  // Velocity/intensity grid (0-3 levels)
  const getGrid = () => Array.from({ length: STEPS }, (_, i) => p[`s${i}`] ?? 0)
  const grid = getGrid()

  useEffect(() => {
    if (!playing) { setStep(-1); return }
    const bpm = p.bpm ?? 120
    const intervalMs = (60 / bpm * 1000) / 4 // 16th notes
    const id = setInterval(() => setStep(s => (s + 1) % STEPS), intervalMs)
    return () => clearInterval(id)
  }, [playing, p.bpm])

  return (
    <div className="fs-glitch-wrap">
      <FSPluginBg
        gradient="linear-gradient(170deg, #0a0000 0%, #080010 40%, #030008 80%, #000005 100%)"
        accentColor={gc} showNoise showGrid
      >
        {/* Header: play + FX selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 4px' }}>
          <button
            style={{
              width: 26, height: 26, borderRadius: 4, border: `2px solid ${gc}`,
              background: playing ? gc : 'transparent', color: playing ? '#000' : gc,
              cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: playing ? `0 0 12px ${gc}88` : 'none', transition: 'all 0.15s', flexShrink: 0,
            }}
            onClick={() => setPlaying(s => !s)}
          >{playing ? '■' : '▶'}</button>
          <div style={{ flex: 1 }}>
            <StepBtns label="FX" opts={GLITCH_FX} value={fxIdx} onChange={v => onChange({ ...p, fx: v })} color={gc} />
          </div>
        </div>

        {/* 16-step grid with intensity levels */}
        <div style={{ padding: '4px 10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 2 }}>
            {Array.from({ length: STEPS }, (_, i) => {
              const isActive = grid[i] > 0
              const isCurrent = playing && step === i
              const intensity = grid[i]
              const opacity = 0.3 + (intensity / 3) * 0.7
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {/* Step bar */}
                  <button
                    style={{
                      height: 24,
                      background: isActive
                        ? `rgba(${gc.slice(1).match(/.{2}/g)!.map(h => parseInt(h, 16)).join(',')},${opacity})`
                        : isCurrent ? gc + '33' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isCurrent ? gc : (isActive ? gc + '88' : 'rgba(255,255,255,0.08)')}`,
                      borderRadius: 2,
                      cursor: 'pointer',
                      boxShadow: isCurrent ? `0 0 8px ${gc}66` : 'none',
                      transition: 'all 0.05s',
                      padding: 0,
                    }}
                    onClick={() => onChange({ ...p, [`s${i}`]: (grid[i] + 1) % 4 })}
                  />
                  {/* Beat marker */}
                  {i % 4 === 0 && (
                    <div style={{ height: 2, background: isCurrent ? gc : 'rgba(255,255,255,0.1)', borderRadius: 1 }} />
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', marginTop: 2, textAlign: 'right' }}>
            CLICK STEP = CYCLE INTENSITY (0→1→2→3→0)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '4px 10px' }}>
          <FSKnob label="AMOUNT" value={p.amount ?? 0.8}  min={0}  max={1}   step={0.01}           color={gc} size={38} onChange={v => onChange({ ...p, amount: v })} />
          <FSKnob label="BPM"    value={p.bpm ?? 120}     min={40} max={300} step={1}   unit=" bpm" color={gc} size={38} onChange={v => onChange({ ...p, bpm: v })} />
          <FSKnob label="SMOOTH" value={p.smooth ?? 0.2}  min={0}  max={1}   step={0.01}           color={gc} size={38} onChange={v => onChange({ ...p, smooth: v })} />
          <FSKnob label="MIX"    value={p.mix ?? 1}       min={0}  max={1}   step={0.01}           color={gc} size={38} onChange={v => onChange({ ...p, mix: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px' }}>
          <StepBtns label="DIV" opts={['1/8','1/16','1/32','T']} value={p.div ?? 1} onChange={v => onChange({ ...p, div: v })} color={gc} />
          <StepBtns label="RANDOM" opts={['OFF','ON']} value={p.rand ?? 0} onChange={v => onChange({ ...p, rand: v })} color="#f59e0b" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. FS-Spectrum — Wavetable Oscillator Layer (> Xfer Serum as effect)
// Morphable waveforms, animated wavetable display
// ══════════════════════════════════════════════════════════════════════════════
const WT_SHAPES = ['SINE','SAW','SQUARE','TRI','NOISE','WAVETBL','FORMANT']

function SpectrumEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const waveIdx = Math.round(p.wave ?? 0)

  const [wtViz, setWtViz] = useState<number[]>([])
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now() / 600
      const morph = p.morph ?? 0
      const wave = waveIdx
      setWtViz(Array(60).fill(0).map((_, i) => {
        const x = (i / 60) * Math.PI * 2
        let v = 0
        if (wave === 0) v = Math.sin(x + t * 0.3) // sine
        else if (wave === 1) v = ((x / (Math.PI * 2)) * 2 - 1) // saw
        else if (wave === 2) v = Math.sin(x) > 0 ? 1 : -1 // square
        else if (wave === 3) v = 1 - Math.abs(((x / (Math.PI * 2)) * 2 - 1)) * 2 // tri
        else v = (Math.random() - 0.5) * 0.5 + Math.sin(x * 3 + t) * 0.3 // noise/WT
        return v * 0.45 + 0.5 + Math.sin(x * (1 + morph * 3) + t * 0.5) * morph * 0.1
      }))
    }, 50)
    return () => clearInterval(id)
  }, [waveIdx, p.morph])

  return (
    <div className="fs-spectrum-wrap">
      <FSPluginBg
        gradient="linear-gradient(165deg, #000820 0%, #000d30 40%, #000510 80%, #000308 100%)"
        accentColor="#3b82f6" showNoise showGrid
      >
        {/* Wavetable visualizer */}
        <div style={{ padding: '7px 10px 4px', borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 8, color: 'rgba(59,130,246,0.55)', fontWeight: 700, letterSpacing: 1 }}>WAVETABLE</span>
            <span style={{ fontSize: 8, color: 'rgba(59,130,246,0.35)' }}>{WT_SHAPES[waveIdx]}</span>
          </div>
          <svg width="100%" height={38} viewBox="0 0 280 38" preserveAspectRatio="none">
            <defs>
              <linearGradient id="wtGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path
              d={`M 0,${wtViz[0] !== undefined ? wtViz[0] * 38 : 19} ${wtViz.map((v, i) => `L ${i * (280/60)},${v * 38}`).join(' ')} L 280,38 L 0,38 Z`}
              fill="url(#wtGrad)"
            />
            <path
              d={`M 0,${wtViz[0] !== undefined ? wtViz[0] * 38 : 19} ${wtViz.map((v, i) => `L ${i * (280/60)},${v * 38}`).join(' ')}`}
              fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 4px #3b82f688)' }}
            />
          </svg>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '5px 10px' }}>
          <FSKnob label="PITCH"  value={p.pitch ?? 0}     min={-24} max={24}   step={0.5} unit=" st" color="#3b82f6" size={40} centerZero onChange={v => onChange({ ...p, pitch: v })} />
          <FSKnob label="DETUNE" value={p.detune ?? 0}    min={-50} max={50}   step={1}   unit=" c"  color="#60a5fa" size={40} centerZero onChange={v => onChange({ ...p, detune: v })} />
          <FSKnob label="MORPH"  value={p.morph ?? 0}     min={0}   max={1}    step={0.01}           color="#818cf8" size={40} onChange={v => onChange({ ...p, morph: v })} />
          <FSKnob label="FILTER" value={p.filter ?? 8000} min={20}  max={20000} step={10} unit=" Hz" color="#6366f1" size={40} onChange={v => onChange({ ...p, filter: v })} />
          <FSKnob label="RES"    value={p.res ?? 0.7}     min={0.1} max={10}   step={0.1}            color="#818cf8" size={36} onChange={v => onChange({ ...p, res: v })} />
          <FSKnob label="MIX"    value={p.mix ?? 0.5}     min={0}   max={1}    step={0.01}           color="#3b82f6" size={36} onChange={v => onChange({ ...p, mix: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="WAVE" opts={WT_SHAPES}             value={waveIdx}                  onChange={v => onChange({ ...p, wave: v })} color="#3b82f6" />
          <StepBtns label="OCT"  opts={['-2','-1','0','+1','+2']} value={Math.round(p.oct ?? 2)} onChange={v => onChange({ ...p, oct: v })} color="#818cf8" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. FS-Crush — 4-Band Multiband Compressor (> iZotope Ozone Multiband)
// Per-band threshold/ratio/attack/release/gain + crossover control
// ══════════════════════════════════════════════════════════════════════════════
function CrushEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const [activeBand, setActiveBand] = useState(0)
  const bands = [
    { key: 'lo', label: 'LOW',    color: '#f59e0b', range: `20–${p.xf1 ?? 250}Hz` },
    { key: 'lm', label: 'LO-MID', color: '#10b981', range: `${p.xf1 ?? 250}–${p.xf2 ?? 2500}Hz` },
    { key: 'hm', label: 'HI-MID', color: '#a855f7', range: `${p.xf2 ?? 2500}–${p.xf3 ?? 8000}Hz` },
    { key: 'hi', label: 'HIGH',   color: '#ef4444', range: `${p.xf3 ?? 8000}–20kHz` },
  ]
  const ab = bands[activeBand]

  // GR visualization per band
  const [grViz, setGrViz] = useState([0, 0, 0, 0])
  useEffect(() => {
    const id = setInterval(() => {
      setGrViz(bands.map((b, i) => {
        const thresh = p[`${b.key}Thresh`] ?? -20
        const target = Math.random() * Math.max(0, -thresh * 0.3)
        return grViz[i] + (target - grViz[i]) * 0.2
      }))
    }, 100)
  }, [p])

  return (
    <div className="fs-crush-wrap">
      <FSPluginBg
        gradient="linear-gradient(165deg, #0a0500 0%, #100800 40%, #050005 80%, #030002 100%)"
        accentColor={ab.color} showNoise showGrid
      >
        {/* Band selector tabs with GR meters */}
        <div style={{ display: 'flex', gap: 2, padding: '7px 10px 5px', borderBottom: `1px solid ${ab.color}18` }}>
          {bands.map((b, i) => (
            <button key={b.key}
              style={{
                flex: 1, padding: '4px 2px 3px', textAlign: 'center', cursor: 'pointer',
                border: `1px solid ${activeBand === i ? b.color : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 4, background: activeBand === i ? b.color + '20' : 'rgba(0,0,0,0.3)',
                transition: 'all 0.12s',
                boxShadow: activeBand === i ? `0 0 8px ${b.color}44` : 'none',
              }}
              onClick={() => setActiveBand(i)}
            >
              <div style={{ fontSize: 9, fontWeight: 800, color: activeBand === i ? b.color : 'rgba(255,255,255,0.35)', letterSpacing: 0.5 }}>
                {b.label}
              </div>
              <div style={{ fontSize: 7, color: `${b.color}88`, marginBottom: 2 }}>{b.range}</div>
              {/* Per-band GR mini bar */}
              <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden', margin: '0 2px' }}>
                <div style={{ width: `${Math.min(100, grViz[i] * 5)}%`, height: '100%', background: b.color, borderRadius: 1, transition: 'width 0.07s' }} />
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '5px 10px' }}>
          <FSKnob label="THRESH"  value={p[`${ab.key}Thresh`] ?? -20}                min={-60} max={0}    step={0.5} unit=" dB"  color={ab.color} size={40} onChange={v => onChange({ ...p, [`${ab.key}Thresh`]: v })} />
          <FSKnob label="RATIO"   value={p[`${ab.key}Ratio`] ?? 4}                   min={1}   max={20}   step={0.5} unit=":1"   color={ab.color} size={40} onChange={v => onChange({ ...p, [`${ab.key}Ratio`]: v })} />
          <FSKnob label="ATTACK"  value={(p[`${ab.key}Atk`] ?? 0.01) * 1000}         min={0.1} max={200}  step={0.1} unit=" ms"  color={ab.color} size={40} onChange={v => onChange({ ...p, [`${ab.key}Atk`]: v / 1000 })} />
          <FSKnob label="RELEASE" value={(p[`${ab.key}Rel`] ?? 0.15) * 1000}         min={10}  max={2000} step={10}  unit=" ms"  color={ab.color} size={40} onChange={v => onChange({ ...p, [`${ab.key}Rel`]: v / 1000 })} />
          <FSKnob label="GAIN"    value={p[`${ab.key}Gain`] ?? 0}                    min={-12} max={12}   step={0.5} unit=" dB"  color={ab.color} size={36} centerZero onChange={v => onChange({ ...p, [`${ab.key}Gain`]: v })} />
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '0 10px 7px', flexWrap: 'wrap', alignItems: 'center' }}>
          <FSKnob label="XF1" value={p.xf1 ?? 250}  min={20}   max={500}   step={5}   unit=" Hz" color="#f59e0b" size={32} onChange={v => onChange({ ...p, xf1: v })} />
          <FSKnob label="XF2" value={p.xf2 ?? 2500} min={500}  max={5000}  step={50}  unit=" Hz" color="#10b981" size={32} onChange={v => onChange({ ...p, xf2: v })} />
          <FSKnob label="XF3" value={p.xf3 ?? 8000} min={2000} max={16000} step={100} unit=" Hz" color="#a855f7" size={32} onChange={v => onChange({ ...p, xf3: v })} />
          <div style={{ marginLeft: 4 }}>
            <StepBtns label="SOLO" opts={['OFF','LO','LM','HM','HI']} value={p.solo ?? 0} onChange={v => onChange({ ...p, solo: v })} color={ab.color} />
          </div>
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 13. FS-Reel — Analog Tape Delay Emulation (> SoundToys PrimalTap)
// Multi-head tape machine, flutter, wow, saturation, freeze
// ══════════════════════════════════════════════════════════════════════════════
const REEL_HEADS = ['1-HEAD','2-HEAD','3-HEAD','LOOP','MULTI']

function ReelEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const headIdx = Math.round(p.heads ?? 1)

  // Reel animation
  const [reelAngle, setReelAngle] = useState(0)
  useEffect(() => {
    if (p.freeze ?? 0) return
    const id = setInterval(() => setReelAngle(a => a + 3), 50)
    return () => clearInterval(id)
  }, [p.freeze])

  return (
    <div className="fs-reel-wrap">
      <FSPluginBg
        gradient="linear-gradient(170deg, #150a00 0%, #1e0e00 35%, #0e0900 70%, #080500 100%)"
        accentColor="#f59e0b" showNoise
      >
        {/* Tape reel header */}
        <div style={{ padding: '7px 10px 5px', borderBottom: '1px solid rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Animated reel SVG */}
          <svg width={40} height={40} style={{ flexShrink: 0 }}>
            <circle cx={20} cy={20} r={18} fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.2)" strokeWidth={1} />
            <circle cx={20} cy={20} r={12} fill="rgba(0,0,0,0.5)" stroke="rgba(245,158,11,0.15)" strokeWidth={1} />
            {/* Spokes */}
            {[0, 60, 120, 180, 240, 300].map(a => {
              const rad = ((a + reelAngle) * Math.PI) / 180
              return (
                <line key={a}
                  x1={20} y1={20}
                  x2={20 + Math.cos(rad) * 15} y2={20 + Math.sin(rad) * 15}
                  stroke="rgba(245,158,11,0.35)" strokeWidth={1.5} strokeLinecap="round"
                />
              )
            })}
            <circle cx={20} cy={20} r={4} fill="rgba(245,158,11,0.4)" />
          </svg>
          <div style={{ flex: 1 }}>
            <StepBtns label="HEADS" opts={REEL_HEADS} value={headIdx} onChange={v => onChange({ ...p, heads: v })} color="#f59e0b" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '5px 10px' }}>
          <FSKnob label="WET"     value={p.wet ?? 0.35}          min={0}    max={1}    step={0.01}           color="#f59e0b" size={40} onChange={v => onChange({ ...p, wet: v })} />
          <FSKnob label="TIME"    value={(p.time ?? 0.5)*1000}   min={10}   max={2000} step={1}   unit=" ms" color="#f59e0b" size={40} onChange={v => onChange({ ...p, time: v/1000 })} />
          <FSKnob label="FDBK"    value={p.feedback ?? 0.4}      min={0}    max={0.98} step={0.01}           color="#f59e0b" size={40} glowing={(p.feedback ?? 0.4) > 0.7} onChange={v => onChange({ ...p, feedback: v })} />
          <FSKnob label="SAT"     value={p.saturation ?? 0.3}    min={0}    max={1}    step={0.01}           color="#fb923c" size={40} onChange={v => onChange({ ...p, saturation: v })} />
          <FSKnob label="WOW"     value={p.flutter ?? 0.05}      min={0}    max={0.3}  step={0.005}          color="#fbbf24" size={36} onChange={v => onChange({ ...p, flutter: v })} />
          <FSKnob label="TONE"    value={p.tone ?? 0.6}          min={0}    max={1}    step={0.01}           color="#f59e0b" size={36} onChange={v => onChange({ ...p, tone: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="SYNC"   opts={['FREE','¼','⅛','½']}     value={p.sync ?? 0}   onChange={v => onChange({ ...p, sync: v })}   color="#f59e0b" />
          <StepBtns label="FREEZE" opts={['OFF','ON']}               value={p.freeze ?? 0} onChange={v => onChange({ ...p, freeze: v })} color="#ef4444" />
          <StepBtns label="IPS"    opts={['7.5','15','30']}          value={Math.round(p.speed ?? 1)} onChange={v => onChange({ ...p, speed: v })} color="#f59e0b" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 14. FS-Aura — Intelligent Vocal Enhancer (> Melodyne harmonic add)
// Air/presence/body/de-ess with animated vocal aura display
// ══════════════════════════════════════════════════════════════════════════════
function AuraEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const [auraRings, setAuraRings] = useState([0.3, 0.5, 0.7])

  useEffect(() => {
    const id = setInterval(() => {
      const air = p.air ?? 0
      const presence = p.presence ?? 0
      const intensity = (Math.abs(air) + Math.abs(presence)) / 24
      setAuraRings(prev => prev.map((r, i) => {
        const t = Date.now() / 1000
        return 0.3 + 0.2 * intensity + Math.sin(t * (1.5 + i * 0.4)) * 0.1 * intensity
      }))
    }, 60)
    return () => clearInterval(id)
  }, [p.air, p.presence])

  return (
    <div className="fs-aura-wrap">
      <FSPluginBg
        gradient="radial-gradient(ellipse at 50% 0%, rgba(232,121,249,0.15) 0%, transparent 65%), linear-gradient(165deg, #100015 0%, #0a000d 60%, #060008 100%)"
        accentColor="#e879f9" showNoise
      >
        {/* Vocal aura visual */}
        <div style={{ padding: '7px 10px 4px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(232,121,249,0.1)' }}>
          <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
            {auraRings.map((r, i) => (
              <div key={i} style={{
                position: 'absolute',
                inset: `${i * 6}px`,
                borderRadius: '50%',
                border: `1px solid rgba(232,121,249,${r})`,
                boxShadow: `0 0 ${8 + i * 4}px rgba(232,121,249,${r * 0.5})`,
                transition: 'all 0.1s ease',
              }} />
            ))}
            <div style={{
              position: 'absolute', inset: '14px',
              borderRadius: '50%', background: 'rgba(232,121,249,0.2)',
              boxShadow: '0 0 16px rgba(232,121,249,0.4)',
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 10, color: '#e879f9', fontWeight: 800, letterSpacing: 1.5 }}>VOCAL AURA</span>
            <div style={{ fontSize: 8, color: 'rgba(232,121,249,0.4)', marginTop: 2 }}>AI-powered harmonic excitation</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '6px 10px' }}>
          <FSKnob label="AIR"      value={p.air ?? 0}      min={-12} max={12}  step={0.5} unit=" dB" color="#e879f9" size={40} centerZero glowing={(p.air ?? 0) > 3} onChange={v => onChange({ ...p, air: v })} />
          <FSKnob label="PRESENCE" value={p.presence ?? 0} min={-12} max={12}  step={0.5} unit=" dB" color="#f0abfc" size={40} centerZero onChange={v => onChange({ ...p, presence: v })} />
          <FSKnob label="BODY"     value={p.body ?? 0}     min={-12} max={12}  step={0.5} unit=" dB" color="#c084fc" size={40} centerZero onChange={v => onChange({ ...p, body: v })} />
          <FSKnob label="DE-ESS"   value={p.deess ?? 0}    min={0}   max={12}  step={0.5} unit=" dB" color="#a78bfa" size={40} onChange={v => onChange({ ...p, deess: v })} />
          <FSKnob label="BREATHE"  value={p.breathe ?? 0}  min={0}   max={1}   step={0.01}           color="#e879f9" size={36} onChange={v => onChange({ ...p, breathe: v })} />
          <FSKnob label="MIX"      value={p.mix ?? 1}      min={0}   max={1}   step={0.01}           color="#e879f9" size={36} onChange={v => onChange({ ...p, mix: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px', flexWrap: 'wrap' }}>
          <StepBtns label="GENDER" opts={['FEMALE','NEUT','MALE']}  value={p.gender ?? 1}  onChange={v => onChange({ ...p, gender: v })}  color="#e879f9" />
          <StepBtns label="DRIVE"  opts={['CLEAN','WARM','HOT']}    value={p.drive ?? 0}   onChange={v => onChange({ ...p, drive: v })}   color="#c084fc" />
          <StepBtns label="REVERB" opts={['OFF','ROOM','PLATE']}    value={p.revMode ?? 0} onChange={v => onChange({ ...p, revMode: v })} color="#a78bfa" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 15. FS-Dimension — Stereo Chorus / Dimension Expander (> Roland Dimension D)
// 4 classic dimension modes + extended controls
// ══════════════════════════════════════════════════════════════════════════════
const DIM_MODES = ['MODE I','MODE II','MODE III','MODE IV','ALL']
const DIM_DESC  = [
  'Subtle spatial shimmer',
  'Warm classic chorus',
  'Wide stereo dimension',
  'Deep rich modulation',
  'All modes combined'
]

function DimensionEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const modeIdx = Math.round(p.mode ?? 0)
  const dc = '#22d3ee'

  // Phase visualization
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPhase(a => (a + (p.rate ?? 0.5) * 2) % 360), 50)
    return () => clearInterval(id)
  }, [p.rate])

  const stereoW = p.width ?? 0.8

  return (
    <div className="fs-dimension-wrap">
      <FSPluginBg
        gradient="linear-gradient(165deg, #000a15 0%, #001020 40%, #000508 80%, #000305 100%)"
        accentColor={dc} showNoise
      >
        {/* Roland-inspired mode selector */}
        <div style={{ padding: '7px 10px 5px', borderBottom: `1px solid ${dc}18` }}>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 6 }}>
            {DIM_MODES.map((m, i) => (
              <button key={m}
                style={{
                  flex: 1, padding: '5px 3px', fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
                  border: `1px solid ${modeIdx === i ? dc : 'rgba(34,211,238,0.15)'}`,
                  borderRadius: 4, cursor: 'pointer',
                  background: modeIdx === i ? dc : 'rgba(0,0,0,0.4)',
                  color: modeIdx === i ? '#000' : `${dc}55`,
                  boxShadow: modeIdx === i ? `0 0 14px ${dc}66` : 'none',
                  transition: 'all 0.15s',
                }}
                onClick={() => onChange({ ...p, mode: i })}
              >{m}</button>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 8, color: `${dc}55`, letterSpacing: 0.5 }}>
            {DIM_DESC[modeIdx]}
          </div>
        </div>

        {/* Stereo width visualizer */}
        <div style={{ padding: '5px 10px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 8, color: `${dc}55`, letterSpacing: 0.5, fontWeight: 700 }}>STEREO FIELD</span>
          <div style={{ flex: 1, position: 'relative', height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
            <div style={{
              position: 'absolute',
              left: `${50 - stereoW * 25}%`,
              right: `${50 - stereoW * 25}%`,
              top: 0, bottom: 0,
              background: `linear-gradient(90deg, transparent, ${dc}66, transparent)`,
              borderRadius: 4,
              transition: 'all 0.15s',
            }} />
          </div>
          <span style={{ fontSize: 8, color: dc, minWidth: 28, textAlign: 'right', fontWeight: 700 }}>
            {Math.round(stereoW * 100)}%
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '4px 10px' }}>
          <FSKnob label="WIDTH"  value={p.width ?? 0.8}  min={0}    max={2}   step={0.01}           color={dc}     size={40} onChange={v => onChange({ ...p, width: v })} />
          <FSKnob label="RATE"   value={p.rate ?? 0.5}   min={0.05} max={8}   step={0.05} unit=" Hz" color={dc}     size={40} onChange={v => onChange({ ...p, rate: v })} />
          <FSKnob label="DEPTH"  value={p.depth ?? 0.3}  min={0}    max={1}   step={0.01}           color="#67e8f9" size={40} onChange={v => onChange({ ...p, depth: v })} />
          <FSKnob label="TONE"   value={p.tone ?? 0.5}   min={0}    max={1}   step={0.01}           color={dc}     size={40} onChange={v => onChange({ ...p, tone: v })} />
          <FSKnob label="MIX"    value={p.mix ?? 0.5}    min={0}    max={1}   step={0.01}           color={dc}     size={36} onChange={v => onChange({ ...p, mix: v })} />
        </div>
        <div style={{ display: 'flex', gap: 5, padding: '0 10px 7px' }}>
          <StepBtns label="SPREAD" opts={['MONO','STEREO','WIDE','ULTRA']} value={p.spread ?? 1} onChange={v => onChange({ ...p, spread: v })} color={dc} />
          <StepBtns label="HPF"    opts={['OFF','80Hz','160Hz']}            value={p.hpf ?? 0}    onChange={v => onChange({ ...p, hpf: v })}    color="#67e8f9" />
        </div>
      </FSPluginBg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PLUGIN DEFAULTS
// ══════════════════════════════════════════════════════════════════════════════
export const FLOWSTATE_PRO_DEFAULTS: Record<string, {
  params: Record<string, number>; name: string; type: string
}> = {
  fs_proq: {
    name: 'FS-ProQ', type: 'fs_proq',
    params: {
      b1f: 20,    b2f: 80,   b2g: 0, b2q: 1,
      b3f: 250,   b3g: 0,    b3q: 1,
      b4f: 1000,  b4g: 0,    b4q: 1,
      b5f: 3500,  b5g: 0,    b5q: 1,
      b6f: 7000,  b6g: 0,    b6q: 1,
      b7f: 14000, b7g: 0,    b7q: 1,
      b8f: 20000, output: 0, proc: 0, dynamic: 0, phase: 1,
    },
  },
  fs_resonance: {
    name: 'FS-Resonate', type: 'fs_resonance',
    params: { depth: 5, sharpness: 0.5, speed: 5, sensitivity: 0.5, mix: 1, focus: 0, delta: 0, mode: 0 },
  },
  fs_vintage_verb: {
    name: 'FS-Cosmos', type: 'fs_vintage_verb',
    params: { mode: 1, wet: 0.3, size: 1.5, decay: 0.5, damp: 0.5, predelay: 0.02, mod: 0.3, color: 1, proc: 0 },
  },
  fs_echo: {
    name: 'FS-Echo', type: 'fs_echo',
    params: { wet: 0.3, time: 0.375, feedback: 0.4, tone: 0.5, flutter: 0, spread: 0.7, style: 1, sync: 0, stereo: 1 },
  },
  fs_tuner: {
    name: 'FS-Voice', type: 'fs_tuner',
    params: { speed: 25, amount: 100, formant: 0, pitch: 0, vibrato: 0, key: 0, scale: 0, effect: 0, gender: 1 },
  },
  fs_mastering: {
    name: 'FS-Master', type: 'fs_mastering',
    params: {
      low: 0, lom: 0, him: 0, high: 0, excite: 0,
      cThresh: -12, cRatio: 2, cAttack: 0.01, cRelease: 0.15, cMakeup: 0,
      width: 1, balance: 0, bassM: 120, sideHF: 0,
      lufs: -14, ceiling: -1, lRelease: 0.05, margin: 0.3,
      platform: 3, dither: 0,
    },
  },
  fs_spacer: {
    name: 'FS-Spacer', type: 'fs_spacer',
    params: { depth: 0.5, speed: 10, rangeHz: 500, smooth: 0.5, bands: 1, scSrc: 0, link: 0 },
  },
  fs_peak_limiter: {
    name: 'FS-Apex', type: 'fs_peak_limiter',
    params: { input: 0, threshold: -1, ceiling: -0.1, release: 0.05, stereoLink: 1, algo: 2, truePeak: 1, dither: 0, gr: 0, isp: 1 },
  },
  fs_alter: {
    name: 'FS-Mutate', type: 'fs_alter',
    params: { mode: 0, pitch: 0, formant: 0, mix: 1, detune: 0, output: 0, algo: 0, voice: 0 },
  },
  fs_glitch: {
    name: 'FS-Glitch', type: 'fs_glitch',
    params: {
      fx: 0, amount: 0.8, bpm: 120, smooth: 0.2, mix: 1, div: 1, rand: 0,
      s0:1, s1:0, s2:0, s3:1, s4:0, s5:0, s6:1, s7:0,
      s8:0, s9:1, s10:0, s11:0, s12:1, s13:0, s14:0, s15:1,
    },
  },
  fs_wavetable: {
    name: 'FS-Spectrum', type: 'fs_wavetable',
    params: { pitch: 0, detune: 0, morph: 0, drive: 0, filter: 8000, res: 0.7, mix: 0.5, wave: 0, oct: 2 },
  },
  fs_multiband_comp: {
    name: 'FS-Crush', type: 'fs_multiband_comp',
    params: {
      xf1: 250, xf2: 2500, xf3: 8000,
      loThresh: -20, loRatio: 4, loAtk: 0.01, loRel: 0.15, loGain: 0,
      lmThresh: -20, lmRatio: 4, lmAtk: 0.01, lmRel: 0.15, lmGain: 0,
      hmThresh: -20, hmRatio: 4, hmAtk: 0.01, hmRel: 0.15, hmGain: 0,
      hiThresh: -20, hiRatio: 4, hiAtk: 0.01, hiRel: 0.15, hiGain: 0,
      solo: 0,
    },
  },
  fs_tape_delay: {
    name: 'FS-Reel', type: 'fs_tape_delay',
    params: { wet: 0.35, time: 0.5, feedback: 0.4, saturation: 0.3, flutter: 0.05, tone: 0.6, heads: 1, sync: 0, freeze: 0, speed: 1 },
  },
  fs_vocal_enhance: {
    name: 'FS-Aura', type: 'fs_vocal_enhance',
    params: { air: 0, presence: 0, body: 0, deess: 0, breathe: 0, mix: 1, gender: 1, drive: 0, revMode: 0 },
  },
  fs_dimension: {
    name: 'FS-Dimension', type: 'fs_dimension',
    params: { mode: 0, width: 0.8, rate: 0.5, depth: 0.3, tone: 0.5, mix: 0.5, spread: 1, hpf: 0 },
  },
}

// ── Render switch ─────────────────────────────────────────────────────────────
export function renderFlowstatePlugin(plugin: Plugin, onChange: (p: Record<string, number>) => void) {
  switch (plugin.type) {
    case 'fs_proq':           return <ProQEditor       plugin={plugin} onChange={onChange} />
    case 'fs_resonance':      return <ResonateEditor   plugin={plugin} onChange={onChange} />
    case 'fs_vintage_verb':   return <CosmosEditor     plugin={plugin} onChange={onChange} />
    case 'fs_echo':           return <EchoEditor       plugin={plugin} onChange={onChange} />
    case 'fs_tuner':          return <VoiceEditor      plugin={plugin} onChange={onChange} />
    case 'fs_mastering':      return <MasterEditor     plugin={plugin} onChange={onChange} />
    case 'fs_spacer':         return <SpacerEditor     plugin={plugin} onChange={onChange} />
    case 'fs_peak_limiter':   return <ApexEditor       plugin={plugin} onChange={onChange} />
    case 'fs_alter':          return <MutateEditor     plugin={plugin} onChange={onChange} />
    case 'fs_glitch':         return <GlitchEditor     plugin={plugin} onChange={onChange} />
    case 'fs_wavetable':      return <SpectrumEditor   plugin={plugin} onChange={onChange} />
    case 'fs_multiband_comp': return <CrushEditor      plugin={plugin} onChange={onChange} />
    case 'fs_tape_delay':     return <ReelEditor       plugin={plugin} onChange={onChange} />
    case 'fs_vocal_enhance':  return <AuraEditor       plugin={plugin} onChange={onChange} />
    case 'fs_dimension':      return <DimensionEditor  plugin={plugin} onChange={onChange} />
    default: return null
  }
}
