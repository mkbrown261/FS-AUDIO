import React, { useState, useEffect } from 'react'

interface VocalTunerUIProps {
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
}> = ({ label, value, min, max, step = 1, unit = '', size = 50, color = '#10b981', onChange }) => {
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
    newValue = Math.round(newValue / step) * step
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>
        {label}
      </div>
      <svg width={size} height={size} onMouseDown={handleMouseDown} style={{ cursor: 'ns-resize' }}>
        <circle cx={size/2} cy={size/2} r={size/2-2} fill="#1a1a2e" stroke="#3a3a4e" strokeWidth="1" />
        <circle
          cx={size/2}
          cy={size/2}
          r={size/2-3}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${normalized * 200} 200`}
          transform={`rotate(-135 ${size/2} ${size/2})`}
        />
        <line
          x1={size/2}
          y1={size/2}
          x2={size/2}
          y2={size/2 - size/3}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${angle} ${size/2} ${size/2})`}
        />
      </svg>
      <div style={{ fontSize: 11, fontWeight: 700, color: color, fontFamily: 'monospace' }}>
        {value}{unit}
      </div>
    </div>
  )
}

export const VocalTunerUI: React.FC<VocalTunerUIProps> = ({ params, onUpdate }) => {
  const [pitchDisplay, setPitchDisplay] = useState({ detected: 0, target: 0, note: 'N/A' })
  
  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
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
        background: 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.2) 0%, transparent 70%)',
        animation: 'pulse 3s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', marginBottom: '4px' }}>
            🎤 FS-VOCAL TUNER
          </div>
          <div style={{ fontSize: '12px', color: '#6ee7b7', letterSpacing: '1px' }}>
            PROFESSIONAL AUTO-TUNE STYLE PITCH CORRECTION
          </div>
        </div>

        {/* Pitch Display */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6ee7b7', marginBottom: '12px', textAlign: 'center' }}>
            PITCH MONITOR
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: '4px' }}>DETECTED</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fbbf24', fontFamily: 'monospace' }}>
                {pitchDisplay.detected} Hz
              </div>
              <div style={{ fontSize: 14, color: '#6ee7b7', marginTop: '4px' }}>
                {pitchDisplay.note}
              </div>
            </div>
            
            <div style={{
              width: 2,
              background: 'linear-gradient(to bottom, transparent, rgba(16, 185, 129, 0.5), transparent)',
              justifySelf: 'center'
            }} />
            
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: '4px' }}>TARGET</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>
                {pitchDisplay.target} Hz
              </div>
              <div style={{ fontSize: 12, color: '#6ee7b7', marginTop: '8px' }}>
                ⚡ {Math.abs(pitchDisplay.target - pitchDisplay.detected).toFixed(1)} cents
              </div>
            </div>
          </div>
        </div>

        {/* Key and Scale */}
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: '12px', textAlign: 'center' }}>
            KEY & SCALE
          </div>
          
          {/* Key Selector */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: '8px' }}>KEY</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px' }}>
              {keys.map(key => (
                <button
                  key={key}
                  onClick={() => onUpdate({ ...params, key })}
                  style={{
                    padding: '8px 4px',
                    border: params.key === key ? '2px solid #10b981' : '1px solid #3a3a4e',
                    background: params.key === key ? 'rgba(16, 185, 129, 0.3)' : '#1a1a2e',
                    color: params.key === key ? '#10b981' : '#6b7280',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
          
          {/* Scale Selector */}
          <div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: '8px' }}>SCALE</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['chromatic', 'major', 'minor'].map(scale => (
                <button
                  key={scale}
                  onClick={() => onUpdate({ ...params, scale })}
                  style={{
                    flex: 1,
                    padding: '10px',
                    border: params.scale === scale ? '2px solid #10b981' : '1px solid #3a3a4e',
                    background: params.scale === scale ? 'rgba(16, 185, 129, 0.3)' : '#1a1a2e',
                    color: params.scale === scale ? '#10b981' : '#6b7280',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s'
                  }}
                >
                  {scale}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '16px' }}>
          <Knob
            label="RETUNE SPEED"
            value={Number(params.retuneSpeed) || 10}
            min={0}
            max={100}
            step={1}
            color="#10b981"
            size={60}
            onChange={v => onUpdate({ ...params, retuneSpeed: v })}
          />
          
          <Knob
            label="HUMANIZE"
            value={Number(params.humanize) || 0.3}
            min={0}
            max={1}
            step={0.01}
            color="#6ee7b7"
            size={60}
            onChange={v => onUpdate({ ...params, humanize: v })}
          />
          
          <Knob
            label="MIX"
            value={Number(params.mix) || 1}
            min={0}
            max={1}
            step={0.01}
            unit="%"
            color="#34d399"
            size={60}
            onChange={v => onUpdate({ ...params, mix: v })}
          />
        </div>
        
        {/* Info */}
        <div style={{
          marginTop: '20px',
          padding: '12px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '8px',
          fontSize: '10px',
          color: '#9ca3af',
          textAlign: 'center'
        }}>
          💡 <strong>Retune Speed:</strong> 0 = Instant (T-Pain effect) • 10-30 = Natural correction • 100 = Off
        </div>
      </div>
    </div>
  )
}
