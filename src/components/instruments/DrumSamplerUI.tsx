import React, { useState } from 'react'

interface DrumSamplerUIProps {
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
}> = ({ label, value, min, max, step = 0.01, unit = '', size = 45, color = '#06b6d4', onChange }) => {
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
    const sensitivity = range / 150
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: `${size + 10}px` }}>
      <div style={{ fontSize: 8, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
        
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="url(#knobGrad-${label})" stroke="#3a3a4e" strokeWidth="1" />
        
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 3}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${normalized * 180} 180`}
          transform={`rotate(-135 ${size / 2} ${size / 2})`}
          style={{ filter: `url(#glow-${label})`, opacity: 0.8 }}
        />
        
        <circle cx={size / 2} cy={size / 2} r={2} fill="#4a4a5e" />
        
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
      <div style={{ fontSize: 9, fontWeight: 700, color: color, fontFamily: 'monospace' }}>
        {formatValue(value)}{unit}
      </div>
    </div>
  )
}

export const DrumSamplerUI: React.FC<DrumSamplerUIProps> = ({ params, onUpdate }) => {
  const [selectedPad, setSelectedPad] = useState(0)
  
  // Parse pad parameters (stored as flat params with pad0_volume, pad0_pitch, etc.)
  const getPadParam = (padId: number, param: string): number => {
    const key = `pad${padId}_${param}`
    return Number(params[key] || 0)
  }
  
  const setPadParam = (padId: number, param: string, value: number) => {
    onUpdate({ ...params, [`pad${padId}_${param}`]: value })
  }
  
  const getMasterParam = (param: string): number => {
    return Number(params[param] || 0)
  }
  
  const setMasterParam = (param: string, value: number) => {
    onUpdate({ ...params, [param]: value })
  }
  
  // Pad names from params or defaults
  const getPadName = (padId: number): string => {
    return String(params[`pad${padId}_name`] || `Pad ${padId + 1}`)
  }
  
  const hasSample = (padId: number): boolean => {
    return !!params[`pad${padId}_loaded`]
  }
  
  // Color scheme for pads
  const padColors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
  ]
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 50%, #1e1e2e 100%)',
      padding: '20px',
      borderRadius: '12px',
      minHeight: '550px',
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
        background: 'radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.1) 0%, transparent 60%)',
        animation: 'pulse 4s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        @keyframes padHit {
          0% { transform: scale(1); }
          50% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
      `}</style>
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#06b6d4', marginBottom: '4px' }}>
            🥁 FS-SAMPLER
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', letterSpacing: '1px' }}>
            16-PAD DRUM MACHINE & SAMPLER
          </div>
        </div>

        {/* 16-Pad Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginBottom: '20px'
        }}>
          {Array.from({ length: 16 }).map((_, i) => {
            const isSelected = selectedPad === i
            const hasLoaded = hasSample(i)
            const padName = getPadName(i)
            
            return (
              <button
                key={i}
                onClick={() => setSelectedPad(i)}
                style={{
                  height: '80px',
                  border: isSelected ? `3px solid ${padColors[i]}` : '2px solid rgba(255,255,255,0.1)',
                  background: hasLoaded 
                    ? `linear-gradient(135deg, ${padColors[i]}33, ${padColors[i]}11)`
                    : 'rgba(30, 30, 40, 0.5)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = `0 4px 12px ${padColors[i]}66`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Pad number */}
                <div style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: hasLoaded ? padColors[i] : '#4a4a5e',
                  textShadow: hasLoaded ? `0 0 8px ${padColors[i]}` : 'none'
                }}>
                  {i + 1}
                </div>
                
                {/* Pad name or empty indicator */}
                <div style={{
                  fontSize: '8px',
                  color: hasLoaded ? '#fff' : '#6b7280',
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  padding: '0 4px'
                }}>
                  {hasLoaded ? padName : 'Empty'}
                </div>
                
                {/* Selection indicator */}
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: padColors[i],
                    boxShadow: `0 0 8px ${padColors[i]}`
                  }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Pad Controls */}
        <div style={{
          background: 'rgba(30, 30, 40, 0.8)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '6px',
                background: `linear-gradient(135deg, ${padColors[selectedPad]}, ${padColors[selectedPad]}cc)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 'bold',
                color: '#fff',
                boxShadow: `0 2px 8px ${padColors[selectedPad]}66`
              }}>
                {selectedPad + 1}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                  {getPadName(selectedPad)}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>
                  {hasSample(selectedPad) ? 'Sample Loaded' : 'No Sample Loaded'}
                </div>
              </div>
            </div>
            
            <button
              style={{
                padding: '6px 12px',
                background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => {
                // TODO: Open file picker
                alert('Sample loading will be implemented with file picker')
              }}
            >
              📂 LOAD SAMPLE
            </button>
          </div>
          
          {/* Pad Parameters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(50px, 1fr))', gap: '12px' }}>
            <Knob
              label="VOLUME"
              value={getPadParam(selectedPad, 'volume')}
              min={0}
              max={1}
              step={0.01}
              color={padColors[selectedPad]}
              onChange={v => setPadParam(selectedPad, 'volume', v)}
            />
            <Knob
              label="PAN"
              value={getPadParam(selectedPad, 'pan')}
              min={-1}
              max={1}
              step={0.01}
              color={padColors[selectedPad]}
              onChange={v => setPadParam(selectedPad, 'pan', v)}
            />
            <Knob
              label="PITCH"
              value={getPadParam(selectedPad, 'pitch')}
              min={-24}
              max={24}
              step={1}
              unit="st"
              color={padColors[selectedPad]}
              onChange={v => setPadParam(selectedPad, 'pitch', v)}
            />
            <Knob
              label="ATTACK"
              value={getPadParam(selectedPad, 'attack')}
              min={0}
              max={1}
              step={0.01}
              unit="s"
              color="#10b981"
              onChange={v => setPadParam(selectedPad, 'attack', v)}
            />
            <Knob
              label="DECAY"
              value={getPadParam(selectedPad, 'decay')}
              min={0}
              max={1}
              step={0.01}
              unit="s"
              color="#10b981"
              onChange={v => setPadParam(selectedPad, 'decay', v)}
            />
            <Knob
              label="SUSTAIN"
              value={getPadParam(selectedPad, 'sustain')}
              min={0}
              max={1}
              step={0.01}
              color="#10b981"
              onChange={v => setPadParam(selectedPad, 'sustain', v)}
            />
            <Knob
              label="RELEASE"
              value={getPadParam(selectedPad, 'release')}
              min={0}
              max={2}
              step={0.01}
              unit="s"
              color="#10b981"
              onChange={v => setPadParam(selectedPad, 'release', v)}
            />
          </div>
        </div>

        {/* Master Controls */}
        <div style={{
          background: 'rgba(168, 85, 247, 0.1)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          borderRadius: '12px',
          padding: '16px'
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#a855f7', marginBottom: '12px', textAlign: 'center' }}>
            MASTER CONTROLS
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <Knob
              label="MASTER VOL"
              value={getMasterParam('masterVolume')}
              min={0}
              max={1}
              step={0.01}
              size={50}
              color="#a855f7"
              onChange={v => setMasterParam('masterVolume', v)}
            />
            <Knob
              label="MASTER PITCH"
              value={getMasterParam('masterPitch')}
              min={-12}
              max={12}
              step={1}
              unit="st"
              size={50}
              color="#a855f7"
              onChange={v => setMasterParam('masterPitch', v)}
            />
          </div>
        </div>
        
        {/* Info Footer */}
        <div style={{
          marginTop: '16px',
          textAlign: 'center',
          fontSize: '10px',
          color: '#6b7280'
        }}>
          Click pads to select • Adjust parameters per pad • MIDI notes C4-D#5 (60-75) trigger pads 1-16
        </div>
      </div>
    </div>
  )
}
