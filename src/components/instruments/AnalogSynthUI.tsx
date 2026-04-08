import React, { useState } from 'react'
import { AnalogSynthParams, OscillatorType, FilterType } from '../../audio/instruments/AnalogSynth'

interface AnalogSynthUIProps {
  params: Record<string, number | string>
  onUpdate: (params: Record<string, number | string>) => void
}

const Knob: React.FC<{
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  size?: number
  color?: string
  onChange: (v: number) => void
}> = ({ label, value, min, max, step = 0.01, unit = '', size = 50, color = '#a855f7', onChange }) => {
  const [dragging, setDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [startValue, setStartValue] = useState(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    setStartY(e.clientY)
    setStartValue(value)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging) return
    const deltaY = startY - e.clientY
    const range = max - min
    const sensitivity = range / 200
    let newValue = startValue + deltaY * sensitivity
    newValue = Math.max(min, Math.min(max, newValue))
    
    if (step >= 1) {
      newValue = Math.round(newValue / step) * step
    } else {
      newValue = Math.round(newValue / step) * step
    }
    
    onChange(newValue)
  }

  const handleMouseUp = () => {
    setDragging(false)
  }

  React.useEffect(() => {
    if (dragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, startY, startValue])

  const normalized = (value - min) / (max - min)
  const angle = -135 + normalized * 270

  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
    if (step >= 1) return v.toFixed(0)
    if (step >= 0.1) return v.toFixed(1)
    return v.toFixed(2)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: `${size + 20}px` }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <svg
        width={size}
        height={size}
        onMouseDown={handleMouseDown}
        style={{ cursor: 'ns-resize', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
      >
        <defs>
          <linearGradient id={`knobGrad-${label}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2a2a3e" />
            <stop offset="100%" stopColor="#1a1a2e" />
          </linearGradient>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Outer ring */}
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="url(#knobGrad-${label})" stroke="#3a3a4e" strokeWidth="1" />
        
        {/* Value arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 4}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${normalized * 220} 220`}
          transform={`rotate(-135 ${size / 2} ${size / 2})`}
          style={{ filter: `url(#glow-${label})`, opacity: 0.8 }}
        />
        
        {/* Center dot */}
        <circle cx={size / 2} cy={size / 2} r={3} fill="#4a4a5e" />
        
        {/* Indicator line */}
        <line
          x1={size / 2}
          y1={size / 2}
          x2={size / 2}
          y2={size / 2 - size / 3}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${angle} ${size / 2} ${size / 2})`}
          style={{ filter: `url(#glow-${label})` }}
        />
      </svg>
      <div style={{ fontSize: '11px', fontWeight: 700, color: color, fontFamily: 'monospace' }}>
        {formatValue(value)}{unit}
      </div>
    </div>
  )
}

const WaveSelector: React.FC<{
  label: string
  value: OscillatorType
  onChange: (v: OscillatorType) => void
}> = ({ label, value, onChange }) => {
  const waves: OscillatorType[] = ['sine', 'triangle', 'sawtooth', 'square', 'noise']
  
  const waveIcon = (type: OscillatorType) => {
    switch (type) {
      case 'sine': return '~'
      case 'triangle': return '△'
      case 'sawtooth': return '⟋'
      case 'square': return '⎕'
      case 'noise': return '⚡'
    }
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {waves.map(wave => (
          <button
            key={wave}
            onClick={() => onChange(wave)}
            style={{
              width: '36px',
              height: '36px',
              border: value === wave ? '2px solid #a855f7' : '1px solid #3a3a4e',
              background: value === wave ? 'rgba(168, 85, 247, 0.2)' : '#1a1a2e',
              color: value === wave ? '#a855f7' : '#6b7280',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              fontWeight: 'bold'
            }}
            onMouseEnter={e => {
              if (value !== wave) {
                e.currentTarget.style.borderColor = '#6b7280'
                e.currentTarget.style.background = '#242438'
              }
            }}
            onMouseLeave={e => {
              if (value !== wave) {
                e.currentTarget.style.borderColor = '#3a3a4e'
                e.currentTarget.style.background = '#1a1a2e'
              }
            }}
            title={wave}
          >
            {waveIcon(wave)}
          </button>
        ))}
      </div>
    </div>
  )
}

const FilterTypeSelector: React.FC<{
  value: FilterType
  onChange: (v: FilterType) => void
}> = ({ value, onChange }) => {
  const types: { type: FilterType, label: string }[] = [
    { type: 'lowpass', label: 'LP' },
    { type: 'highpass', label: 'HP' },
    { type: 'bandpass', label: 'BP' }
  ]
  
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {types.map(({ type, label }) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          style={{
            padding: '6px 12px',
            border: value === type ? '2px solid #06b6d4' : '1px solid #3a3a4e',
            background: value === type ? 'rgba(6, 182, 212, 0.2)' : '#1a1a2e',
            color: value === type ? '#06b6d4' : '#6b7280',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 700,
            transition: 'all 0.2s'
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export const AnalogSynthUI: React.FC<AnalogSynthUIProps> = ({ params, onUpdate }) => {
  const updateParam = (key: string, value: number | string) => {
    onUpdate({ ...params, [key]: value })
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e1e3f 0%, #2a1e4a 50%, #1e1e3f 100%)',
      padding: '24px',
      borderRadius: '12px',
      minHeight: '500px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle at 30% 50%, rgba(168, 85, 247, 0.1) 0%, transparent 50%)',
        animation: 'pulse 4s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
      `}</style>
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#a855f7', marginBottom: '4px' }}>
            🎹 FS-ANALOG
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', letterSpacing: '1px' }}>
            PROFESSIONAL ANALOG SYNTHESIZER
          </div>
        </div>

        {/* Oscillator Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          {/* Oscillator 1 */}
          <div style={{
            background: 'rgba(168, 85, 247, 0.05)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#a855f7', marginBottom: '16px', textAlign: 'center' }}>
              OSCILLATOR 1
            </div>
            
            <WaveSelector
              label="WAVEFORM"
              value={(params.osc1_type as OscillatorType) || 'sawtooth'}
              onChange={v => updateParam('osc1_type', v)}
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '16px' }}>
              <Knob
                label="LEVEL"
                value={Number(params.osc1_level) || 0.7}
                min={0}
                max={1}
                step={0.01}
                color="#a855f7"
                onChange={v => updateParam('osc1_level', v)}
              />
              <Knob
                label="OCTAVE"
                value={Number(params.osc1_octave) || 0}
                min={-2}
                max={2}
                step={1}
                color="#a855f7"
                onChange={v => updateParam('osc1_octave', v)}
              />
              <Knob
                label="DETUNE"
                value={Number(params.osc1_detune) || 0}
                min={-100}
                max={100}
                step={1}
                unit="¢"
                color="#a855f7"
                onChange={v => updateParam('osc1_detune', v)}
              />
            </div>
          </div>

          {/* Oscillator 2 */}
          <div style={{
            background: 'rgba(168, 85, 247, 0.05)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#a855f7', marginBottom: '16px', textAlign: 'center' }}>
              OSCILLATOR 2
            </div>
            
            <WaveSelector
              label="WAVEFORM"
              value={(params.osc2_type as OscillatorType) || 'square'}
              onChange={v => updateParam('osc2_type', v)}
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '16px' }}>
              <Knob
                label="LEVEL"
                value={Number(params.osc2_level) || 0.3}
                min={0}
                max={1}
                step={0.01}
                color="#a855f7"
                onChange={v => updateParam('osc2_level', v)}
              />
              <Knob
                label="OCTAVE"
                value={Number(params.osc2_octave) || -1}
                min={-2}
                max={2}
                step={1}
                color="#a855f7"
                onChange={v => updateParam('osc2_octave', v)}
              />
              <Knob
                label="DETUNE"
                value={Number(params.osc2_detune) || 5}
                min={-100}
                max={100}
                step={1}
                unit="¢"
                color="#a855f7"
                onChange={v => updateParam('osc2_detune', v)}
              />
            </div>
          </div>
        </div>

        {/* Filter Section */}
        <div style={{
          background: 'rgba(6, 182, 212, 0.05)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#06b6d4', marginBottom: '16px', textAlign: 'center' }}>
            FILTER
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <FilterTypeSelector
              value={(params.filter_type as FilterType) || 'lowpass'}
              onChange={v => updateParam('filter_type', v)}
            />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <Knob
              label="CUTOFF"
              value={Number(params.filter_cutoff) || 2000}
              min={20}
              max={20000}
              step={10}
              unit="Hz"
              color="#06b6d4"
              onChange={v => updateParam('filter_cutoff', v)}
            />
            <Knob
              label="RESONANCE"
              value={Number(params.filter_resonance) || 5}
              min={0}
              max={20}
              step={0.1}
              color="#06b6d4"
              onChange={v => updateParam('filter_resonance', v)}
            />
            <Knob
              label="ENV AMOUNT"
              value={Number(params.filter_env_amount) || 0.5}
              min={-1}
              max={1}
              step={0.01}
              color="#06b6d4"
              onChange={v => updateParam('filter_env_amount', v)}
            />
          </div>
        </div>

        {/* Envelope & LFO */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }}>
          {/* Envelope */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', marginBottom: '16px', textAlign: 'center' }}>
              ENVELOPE (ADSR)
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <Knob
                label="ATTACK"
                value={Number(params.env_attack) || 0.01}
                min={0}
                max={2}
                step={0.01}
                unit="s"
                color="#10b981"
                onChange={v => updateParam('env_attack', v)}
              />
              <Knob
                label="DECAY"
                value={Number(params.env_decay) || 0.2}
                min={0}
                max={2}
                step={0.01}
                unit="s"
                color="#10b981"
                onChange={v => updateParam('env_decay', v)}
              />
              <Knob
                label="SUSTAIN"
                value={Number(params.env_sustain) || 0.6}
                min={0}
                max={1}
                step={0.01}
                color="#10b981"
                onChange={v => updateParam('env_sustain', v)}
              />
              <Knob
                label="RELEASE"
                value={Number(params.env_release) || 0.3}
                min={0}
                max={3}
                step={0.01}
                unit="s"
                color="#10b981"
                onChange={v => updateParam('env_release', v)}
              />
            </div>
          </div>

          {/* LFO */}
          <div style={{
            background: 'rgba(236, 72, 153, 0.05)',
            border: '1px solid rgba(236, 72, 153, 0.2)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#ec4899', marginBottom: '16px', textAlign: 'center' }}>
              LFO
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
              <Knob
                label="RATE"
                value={Number(params.lfo_rate) || 5}
                min={0.1}
                max={20}
                step={0.1}
                unit="Hz"
                size={45}
                color="#ec4899"
                onChange={v => updateParam('lfo_rate', v)}
              />
              <Knob
                label="AMOUNT"
                value={Number(params.lfo_amount) || 0.2}
                min={0}
                max={1}
                step={0.01}
                size={45}
                color="#ec4899"
                onChange={v => updateParam('lfo_amount', v)}
              />
            </div>
          </div>
        </div>

        {/* Unison & Master */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <Knob
            label="UNISON"
            value={Number(params.unison_voices) || 2}
            min={1}
            max={8}
            step={1}
            size={55}
            color="#f59e0b"
            onChange={v => updateParam('unison_voices', v)}
          />
          <Knob
            label="DETUNE"
            value={Number(params.unison_detune) || 10}
            min={0}
            max={100}
            step={1}
            unit="¢"
            size={55}
            color="#f59e0b"
            onChange={v => updateParam('unison_detune', v)}
          />
          <Knob
            label="MASTER"
            value={Number(params.master_volume) || 0.7}
            min={0}
            max={1}
            step={0.01}
            size={60}
            color="#ef4444"
            onChange={v => updateParam('master_volume', v)}
          />
        </div>
      </div>
    </div>
  )
}
