/**
 * FS-AUDIO Wavetable Synthesizer UI
 * Serum / Vital-style interface with wavetable morphing, filter, envelopes, and LFO.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { WavetableSynthParams, WAVETABLES } from '../../audio/synths/WavetableSynth'

// ── Default params ──────────────────────────────────────────────────────────
export const WAVETABLE_DEFAULT_PARAMS: WavetableSynthParams = {
  wavetableA: 0,
  wavetableB: 1,
  positionA: 0,
  positionB: 0,
  mix: 0,
  octave: 0,
  semitone: 0,
  detune: 0,
  unison: 1,
  unisonDetune: 10,
  unisonSpread: 0.5,
  filterType: 'lowpass',
  filterCutoff: 8000,
  filterResonance: 0,
  filterEnvAmount: 0,
  ampAttack: 0.005,
  ampDecay: 0.3,
  ampSustain: 0.7,
  ampRelease: 0.4,
  filterAttack: 0.01,
  filterDecay: 0.3,
  filterSustain: 0.5,
  filterRelease: 0.3,
  lfoRate: 3,
  lfoAmount: 0,
  lfoDestination: 'position',
  distortion: 0,
  bitcrush: 16,
  volume: 0.8,
}

// ── Knob component ─────────────────────────────────────────────────────────
interface KnobProps {
  label: string; value: number; min: number; max: number
  step?: number; unit?: string; size?: number; color?: string
  onChange: (v: number) => void
}
const Knob: React.FC<KnobProps> = ({ label, value, min, max, step = 0.01, unit = '', size = 46, color = '#a855f7', onChange }) => {
  const dragging = useRef(false)
  const startY = useRef(0)
  const startVal = useRef(0)

  const norm = (max === min) ? 0 : (value - min) / (max - min)
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
      if (step >= 1) nv = Math.round(nv / step) * step
      else nv = Math.round(nv / step) * step
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
        style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${color} 0deg, ${color} ${(norm * 280 + 40)}deg, rgba(255,255,255,0.07) ${(norm * 280 + 40)}deg 360deg)`, cursor: 'ns-resize', position: 'relative', boxShadow: `0 0 ${dragging.current ? 10 : 4}px ${color}55` }}
      >
        <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 2, height: size * 0.3, background: color, borderRadius: 1, transformOrigin: 'bottom center', transform: `rotate(${angle}deg) translateY(-30%)` }} />
        </div>
      </div>
      <div style={{ fontSize: 9, color: '#94a3b8', letterSpacing: '.04em', textAlign: 'center', lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 9, color: color, fontFamily: 'monospace', fontWeight: 700 }}>{dispVal}{unit}</div>
    </div>
  )
}

// ── Wavetable visualizer ───────────────────────────────────────────────────
function WaveVisualizer({ frames, position, color }: { frames: Float32Array[]; position: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !frames.length) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Draw ghost frames behind
    const frameIdx = Math.floor(position * (frames.length - 1))
    const frame = frames[Math.min(frameIdx, frames.length - 1)]

    ctx.strokeStyle = color + '99'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const mid = height / 2
    for (let i = 0; i < frame.length; i += 4) {
      const x = (i / frame.length) * width
      const y = mid - frame[i] * mid * 0.85
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Bright leading sample
    const bright = frames[Math.min(frameIdx + 1, frames.length - 1)]
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.shadowBlur = 6
    ctx.shadowColor = color
    ctx.beginPath()
    for (let i = 0; i < bright.length; i += 4) {
      const x = (i / bright.length) * width
      const y = mid - bright[i] * mid * 0.85
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }, [frames, position, color])

  return (
    <canvas ref={canvasRef} width={120} height={50}
      style={{ width: '100%', height: 50, borderRadius: 4, background: 'rgba(0,0,0,0.3)' }} />
  )
}

// ── Envelope editor ────────────────────────────────────────────────────────
function EnvSection({ label, a, d, s, r, color, onA, onD, onS, onR }: {
  label: string; a: number; d: number; s: number; r: number; color: string
  onA: (v: number) => void; onD: (v: number) => void; onS: (v: number) => void; onR: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 9, color, fontWeight: 700, textAlign: 'center', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        <Knob label="A" value={a} min={0.001} max={5} step={0.001} unit="s" size={36} color={color} onChange={onA} />
        <Knob label="D" value={d} min={0.001} max={5} step={0.001} unit="s" size={36} color={color} onChange={onD} />
        <Knob label="S" value={s} min={0}     max={1} step={0.01}  unit=""  size={36} color={color} onChange={onS} />
        <Knob label="R" value={r} min={0.001} max={8} step={0.001} unit="s" size={36} color={color} onChange={onR} />
      </div>
    </div>
  )
}

// ── Section label ──────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 3, marginBottom: 6 }}>
      {children}
    </div>
  )
}

// ── Main WavetableSynthUI ─────────────────────────────────────────────────
interface WavetableSynthUIProps {
  params: Record<string, number | string>
  onUpdate: (params: Record<string, number | string>) => void
}

export function WavetableSynthUI({ params: rawParams, onUpdate }: WavetableSynthUIProps) {
  // Merge with defaults to ensure all params exist
  const p: WavetableSynthParams = { ...WAVETABLE_DEFAULT_PARAMS, ...rawParams } as any

  const set = useCallback((key: keyof WavetableSynthParams, value: number | string) => {
    onUpdate({ ...rawParams, [key]: value })
  }, [rawParams, onUpdate])

  const tableA = WAVETABLES[Math.min(Number(p.wavetableA), WAVETABLES.length - 1)]
  const tableB = WAVETABLES[Math.min(Number(p.wavetableB), WAVETABLES.length - 1)]

  const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'peaking', 'lowshelf', 'highshelf']

  return (
    <div style={{ background: 'linear-gradient(135deg,#0d0d1f 0%,#1a0a2e 100%)', color: '#e2e8f0', borderRadius: 10, padding: 14, fontFamily: 'system-ui,sans-serif', minWidth: 520, maxWidth: 640, fontSize: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#a855f7,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>〜</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>FS-Wavetable</div>
          <div style={{ fontSize: 9, color: '#94a3b8' }}>Serum-style wavetable synthesis</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#64748b' }}>VOL</span>
          <Knob label="" value={Number(p.volume)} min={0} max={1} step={0.01} size={32} color="#a855f7" onChange={v => set('volume', v)} />
        </div>
      </div>

      {/* Oscillator section — two wavetables side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, marginBottom: 12 }}>

        {/* Wavetable A */}
        <div style={{ background: 'rgba(168,85,247,0.07)', borderRadius: 8, padding: 8, border: '1px solid rgba(168,85,247,0.2)' }}>
          <SectionLabel>Wavetable A</SectionLabel>
          <select
            value={Number(p.wavetableA)}
            onChange={e => set('wavetableA', Number(e.target.value))}
            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 4px', fontSize: 10, marginBottom: 6, cursor: 'pointer' }}
          >
            {WAVETABLES.map((wt, i) => <option key={i} value={i}>{wt.name}</option>)}
          </select>
          {tableA && <WaveVisualizer frames={tableA.frames} position={Number(p.positionA)} color="#a855f7" />}
          <div style={{ marginTop: 6 }}>
            <Knob label="POSITION" value={Number(p.positionA)} min={0} max={1} step={0.001} size={40} color="#a855f7" onChange={v => set('positionA', v)} />
          </div>
        </div>

        {/* Mix control in centre */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Knob label="A↔B MIX" value={Number(p.mix)} min={0} max={1} step={0.01} size={44} color="#06b6d4" onChange={v => set('mix', v)} />
        </div>

        {/* Wavetable B */}
        <div style={{ background: 'rgba(99,102,241,0.07)', borderRadius: 8, padding: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
          <SectionLabel>Wavetable B</SectionLabel>
          <select
            value={Number(p.wavetableB)}
            onChange={e => set('wavetableB', Number(e.target.value))}
            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 4px', fontSize: 10, marginBottom: 6, cursor: 'pointer' }}
          >
            {WAVETABLES.map((wt, i) => <option key={i} value={i}>{wt.name}</option>)}
          </select>
          {tableB && <WaveVisualizer frames={tableB.frames} position={Number(p.positionB)} color="#6366f1" />}
          <div style={{ marginTop: 6 }}>
            <Knob label="POSITION" value={Number(p.positionB)} min={0} max={1} step={0.001} size={40} color="#6366f1" onChange={v => set('positionB', v)} />
          </div>
        </div>
      </div>

      {/* Pitch / Unison row */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, marginBottom: 10 }}>
        <SectionLabel>Oscillator</SectionLabel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Knob label="OCTAVE"   value={Number(p.octave)}       min={-2}  max={2}   step={1}    size={40} color="#f59e0b" onChange={v => set('octave', v)} />
          <Knob label="SEMI"     value={Number(p.semitone)}     min={-12} max={12}  step={1}    size={40} color="#f59e0b" onChange={v => set('semitone', v)} />
          <Knob label="DETUNE"   value={Number(p.detune)}       min={-100} max={100} step={1}   size={40} color="#f59e0b" onChange={v => set('detune', v)} />
          <Knob label="UNISON"   value={Number(p.unison)}       min={1}   max={8}   step={1}    size={40} color="#10b981" onChange={v => set('unison', v)} />
          <Knob label="UNI DET"  value={Number(p.unisonDetune)} min={0}   max={50}  step={0.5}  size={40} color="#10b981" onChange={v => set('unisonDetune', v)} />
          <Knob label="SPREAD"   value={Number(p.unisonSpread)} min={0}   max={1}   step={0.01} size={40} color="#10b981" onChange={v => set('unisonSpread', v)} />
        </div>
      </div>

      {/* Filter row */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, marginBottom: 10 }}>
        <SectionLabel>Filter</SectionLabel>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>TYPE</span>
            <select
              value={p.filterType as string}
              onChange={e => set('filterType', e.target.value)}
              style={{ background: 'rgba(0,0,0,0.4)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
            >
              {FILTER_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
          </div>
          <Knob label="CUTOFF"   value={Number(p.filterCutoff)}     min={20}  max={20000} step={1}    size={44} color="#ef4444" onChange={v => set('filterCutoff', v)} />
          <Knob label="RESO"     value={Number(p.filterResonance)}  min={0}   max={20}   step={0.1}  size={44} color="#ef4444" onChange={v => set('filterResonance', v)} />
          <Knob label="ENV AMT"  value={Number(p.filterEnvAmount)}  min={-1}  max={1}    step={0.01} size={44} color="#ef4444" onChange={v => set('filterEnvAmount', v)} />
        </div>
      </div>

      {/* Envelopes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
          <EnvSection
            label="AMP ENV" color="#a855f7"
            a={Number(p.ampAttack)} d={Number(p.ampDecay)} s={Number(p.ampSustain)} r={Number(p.ampRelease)}
            onA={v => set('ampAttack', v)} onD={v => set('ampDecay', v)} onS={v => set('ampSustain', v)} onR={v => set('ampRelease', v)}
          />
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
          <EnvSection
            label="FILTER ENV" color="#ef4444"
            a={Number(p.filterAttack)} d={Number(p.filterDecay)} s={Number(p.filterSustain)} r={Number(p.filterRelease)}
            onA={v => set('filterAttack', v)} onD={v => set('filterDecay', v)} onS={v => set('filterSustain', v)} onR={v => set('filterRelease', v)}
          />
        </div>
      </div>

      {/* LFO + FX */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
          <SectionLabel>LFO</SectionLabel>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Knob label="RATE"   value={Number(p.lfoRate)}   min={0.1}  max={20} step={0.1}  size={40} color="#06b6d4" onChange={v => set('lfoRate', v)} />
            <Knob label="AMOUNT" value={Number(p.lfoAmount)} min={0}    max={1}  step={0.01} size={40} color="#06b6d4" onChange={v => set('lfoAmount', v)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>DEST</span>
              <select
                value={p.lfoDestination as string}
                onChange={e => set('lfoDestination', e.target.value)}
                style={{ background: 'rgba(0,0,0,0.4)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 4px', fontSize: 10, cursor: 'pointer' }}
              >
                <option value="position">POSITION</option>
                <option value="cutoff">CUTOFF</option>
                <option value="pitch">PITCH</option>
              </select>
            </div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
          <SectionLabel>FX</SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <Knob label="DISTORT"   value={Number(p.distortion)} min={0}  max={1}  step={0.01} size={40} color="#f59e0b" onChange={v => set('distortion', v)} />
            <Knob label="BITCRUSH"  value={Number(p.bitcrush)}   min={1}  max={16} step={1}    size={40} color="#f59e0b" onChange={v => set('bitcrush', v)} />
          </div>
        </div>
      </div>
    </div>
  )
}
