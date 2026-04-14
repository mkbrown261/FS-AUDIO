/**
 * FS-FM Synthesizer UI
 * 6-operator FM synth with 8 algorithms, per-operator ADSR, LFO.
 * DX7/Yamaha-inspired interface.
 */

import React, { useState, useCallback, useRef } from 'react'
import { FM_ALGORITHMS } from '../../audio/synths/FMSynth'

// ── Helpers ──────────────────────────────────────────────────────────────────
const pn = (v: string | number | undefined, d: number) => Number(v ?? d) || d

// ── Mini Knob ────────────────────────────────────────────────────────────────
interface KnobProps {
  label: string; value: number; min: number; max: number
  step?: number; unit?: string; size?: number; color?: string
  onChange: (v: number) => void
}
const Knob: React.FC<KnobProps> = ({ label, value, min, max, step = 0.01, unit = '', size = 40, color = '#f59e0b', onChange }) => {
  const dragging = useRef(false)
  const startY = useRef(0)
  const startVal = useRef(0)
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = -140 + norm * 280

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault(); dragging.current = true; startY.current = e.clientY; startVal.current = value
    const move = (me: MouseEvent) => {
      if (!dragging.current) return
      let nv = startVal.current + (startY.current - me.clientY) * ((max - min) / 180)
      nv = Math.max(min, Math.min(max, step >= 1 ? Math.round(nv / step) * step : Math.round(nv / step) * step))
      onChange(nv)
    }
    const up = () => { dragging.current = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  const disp = step >= 1 ? Math.round(value).toString() : value.toFixed(2)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, userSelect: 'none' }}>
      <div onMouseDown={onDown} title={`${label}: ${disp}${unit}`}
        style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${color} 0deg, ${color} ${norm * 280 + 40}deg, rgba(255,255,255,0.07) ${norm * 280 + 40}deg 360deg)`, cursor: 'ns-resize', position: 'relative', boxShadow: `0 0 5px ${color}44` }}>
        <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: '#0d0d1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 2, height: size * 0.28, background: color, borderRadius: 1, transformOrigin: 'bottom center', transform: `rotate(${angle}deg) translateY(-30%)` }} />
        </div>
      </div>
      <div style={{ fontSize: 8, color: '#94a3b8', letterSpacing: '.04em', textAlign: 'center' }}>{label}</div>
      <div style={{ fontSize: 8, color, fontFamily: 'monospace', fontWeight: 700 }}>{disp}{unit}</div>
    </div>
  )
}

// ── Algorithm Visualizer ─────────────────────────────────────────────────────
function AlgorithmDisplay({ algorithmIdx }: { algorithmIdx: number }) {
  const algo = FM_ALGORITHMS[Math.min(algorithmIdx, FM_ALGORITHMS.length - 1)]
  if (!algo) return null
  const opLabels = ['OP1', 'OP2', 'OP3', 'OP4', 'OP5', 'OP6']
  const carriers = algo.carriers ?? []
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {opLabels.map((lbl, i) => {
        const isCarrier = carriers.includes(i)
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ width: 28, height: 20, borderRadius: 3, background: isCarrier ? '#f59e0b' : 'rgba(245,158,11,0.25)', border: `1px solid ${isCarrier ? '#f59e0b' : 'rgba(245,158,11,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: isCarrier ? '#0d0d1a' : '#f59e0b', fontWeight: 700 }}>
              {lbl}
            </div>
            <div style={{ fontSize: 7, color: isCarrier ? '#f59e0b' : '#64748b' }}>{isCarrier ? '▶' : '~'}</div>
          </div>
        )
      })}
      <div style={{ fontSize: 8, color: '#64748b', marginLeft: 4, alignSelf: 'center' }}>{algo.name ?? `ALG ${algorithmIdx + 1}`}</div>
    </div>
  )
}

// ── Operator Strip ───────────────────────────────────────────────────────────
function OperatorStrip({ opIdx, params, color, onChange }: {
  opIdx: number
  params: Record<string, number | string>
  color: string
  onChange: (key: string, v: number) => void
}) {
  const k = `op${opIdx}_`
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 8px', border: `1px solid ${color}22` }}>
      <div style={{ fontSize: 8, color, fontWeight: 700, letterSpacing: '.1em', marginBottom: 6 }}>OP {opIdx + 1}</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Knob label="RATIO"  value={pn(params[`${k}ratio`], 1)}   min={0.5} max={16}  step={0.5}  size={34} color={color} onChange={v => onChange(`${k}ratio`, v)} />
        <Knob label="LEVEL"  value={pn(params[`${k}level`], 0.5)} min={0}   max={1}   step={0.01} size={34} color={color} onChange={v => onChange(`${k}level`, v)} />
        <Knob label="A"      value={pn(params[`${k}attack`], 5)}   min={0}   max={2000} step={1}  unit="ms" size={34} color={color} onChange={v => onChange(`${k}attack`, v)} />
        <Knob label="D"      value={pn(params[`${k}decay`], 200)}  min={0}   max={5000} step={10} unit="ms" size={34} color={color} onChange={v => onChange(`${k}decay`, v)} />
        <Knob label="S"      value={pn(params[`${k}sustain`], 0.7)} min={0}  max={1}   step={0.01} size={34} color={color} onChange={v => onChange(`${k}sustain`, v)} />
        <Knob label="R"      value={pn(params[`${k}release`], 300)} min={0}  max={8000} step={10} unit="ms" size={34} color={color} onChange={v => onChange(`${k}release`, v)} />
        <Knob label="DETUNE" value={pn(params[`${k}detune`], 0)}   min={-100} max={100} step={1} unit="¢" size={34} color={color} onChange={v => onChange(`${k}detune`, v)} />
        <Knob label="FB"     value={pn(params[`${k}feedback`], 0)} min={0}   max={1}   step={0.01} size={34} color={color} onChange={v => onChange(`${k}feedback`, v)} />
      </div>
    </div>
  )
}

// ── Main FMSynthUI ────────────────────────────────────────────────────────────
interface FMSynthUIProps {
  params: Record<string, number | string>
  onUpdate: (params: Record<string, number | string>) => void
}

export function FMSynthUI({ params: raw, onUpdate }: FMSynthUIProps) {
  const [selectedOp, setSelectedOp] = useState(0)
  const set = useCallback((key: string, value: number | string) => {
    onUpdate({ ...raw, [key]: value })
  }, [raw, onUpdate])

  const algorithmIdx = pn(raw.algorithm, 0)

  // 6 operator colors (DX7-style gold/orange tones)
  const OP_COLORS = ['#f59e0b', '#fb923c', '#fbbf24', '#f97316', '#fde68a', '#fed7aa']

  return (
    <div style={{ background: 'linear-gradient(135deg,#1a0f00 0%,#1f1500 100%)', color: '#e2e8f0', borderRadius: 10, padding: 14, fontFamily: 'system-ui,sans-serif', minWidth: 540, maxWidth: 680, fontSize: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#f59e0b,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#1a0f00' }}>FM</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fde68a' }}>FS-FM Synthesizer</div>
          <div style={{ fontSize: 9, color: '#94a3b8' }}>6-Operator FM · 8 Algorithms · DX7-inspired</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Knob label="VOL"    value={pn(raw.outputLevel, 0.7)} min={0} max={1}    step={0.01} size={32} color="#f59e0b" onChange={v => set('outputLevel', v)} />
          <Knob label="DETUNE" value={pn(raw.globalDetune, 0)}  min={-50} max={50} step={1}   unit="¢" size={32} color="#f59e0b" onChange={v => set('globalDetune', v)} />
        </div>
      </div>

      {/* Algorithm selector */}
      <div style={{ background: 'rgba(245,158,11,0.05)', borderRadius: 8, padding: 8, marginBottom: 10, border: '1px solid rgba(245,158,11,0.15)' }}>
        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: '.1em', marginBottom: 6 }}>ALGORITHM</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {FM_ALGORITHMS.map((_, i) => (
            <button key={i} onClick={() => set('algorithm', i)}
              style={{ width: 28, height: 22, borderRadius: 4, background: algorithmIdx === i ? '#f59e0b' : 'rgba(255,255,255,0.05)', border: `1px solid ${algorithmIdx === i ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`, color: algorithmIdx === i ? '#1a0f00' : '#94a3b8', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              {i + 1}
            </button>
          ))}
        </div>
        <AlgorithmDisplay algorithmIdx={algorithmIdx} />
      </div>

      {/* Operator tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <button key={i} onClick={() => setSelectedOp(i)}
            style={{ flex: 1, padding: '4px 0', borderRadius: 4, background: selectedOp === i ? OP_COLORS[i] : 'rgba(255,255,255,0.05)', border: `1px solid ${selectedOp === i ? OP_COLORS[i] : 'rgba(255,255,255,0.08)'}`, color: selectedOp === i ? '#1a0f00' : OP_COLORS[i], fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
            OP{i + 1}
          </button>
        ))}
      </div>

      {/* Selected operator detail */}
      <OperatorStrip opIdx={selectedOp} params={raw} color={OP_COLORS[selectedOp]} onChange={set} />

      {/* LFO */}
      <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: '.1em', marginBottom: 6 }}>LFO</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Knob label="RATE"   value={pn(raw.lfoRate, 5)}   min={0.1} max={20} step={0.1}  unit="Hz" size={40} color="#06b6d4" onChange={v => set('lfoRate', v)} />
          <Knob label="AMOUNT" value={pn(raw.lfoAmount, 0)} min={0}   max={1}  step={0.01}           size={40} color="#06b6d4" onChange={v => set('lfoAmount', v)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>DEST</span>
            <select value={raw.lfoDestination as string || 'pitch'} onChange={e => set('lfoDestination', e.target.value)}
              style={{ background: 'rgba(0,0,0,0.5)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}>
              <option value="pitch">PITCH</option>
              <option value="amplitude">AMPLITUDE</option>
              <option value="filter">FILTER</option>
            </select>
          </div>
        </div>
      </div>

      {/* Pitch EG amount */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Knob label="PITCH EG" value={pn(raw.pitchEGAmount, 0)} min={-1} max={1} step={0.01} size={36} color="#a855f7" onChange={v => set('pitchEGAmount', v)} />
        <div style={{ fontSize: 9, color: '#64748b' }}>Pitch envelope scales all operators proportionally</div>
      </div>
    </div>
  )
}
