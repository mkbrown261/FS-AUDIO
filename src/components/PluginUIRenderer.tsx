import React, { useState } from 'react'
import { Plugin } from '../store/projectStore'

interface PluginUIRendererProps {
  plugin: Plugin
  trackId: string
  onUpdateParams: (params: Record<string, number>) => void
}

// Professional Knob Component
function ProfessionalKnob({ 
  label, 
  value, 
  min, 
  max, 
  unit = '', 
  onChange,
  bipolar = false,
  accentColor = '#a855f7'
}: { 
  label: string
  value: number
  min: number
  max: number
  unit?: string
  onChange: (v: number) => void
  bipolar?: boolean
  accentColor?: string
}) {
  const norm = (value - min) / (max - min)
  const angle = -135 + norm * 270
  const size = 60
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 4

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startVal = value

    const move = (me: MouseEvent) => {
      const dy = startY - me.clientY
      const delta = (dy / 100) * (max - min)
      onChange(Math.max(min, Math.min(max, startVal + delta)))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const rad = (angle * Math.PI) / 180
  const tickX = cx + (r - 8) * Math.sin(rad)
  const tickY = cy - (r - 8) * Math.cos(rad)

  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(1)}k`
    if (v % 1 === 0) return v.toString()
    return v.toFixed(2)
  }

  const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, radius, endAngle)
    const end = polarToCartesian(x, y, radius, startAngle)
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
  }

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    }
  }

  const getStrokeColor = () => {
    if (bipolar) return value < 0 ? '#ef4444' : accentColor
    return accentColor
  }

  return (
    <div style={{ 
      display: 'inline-flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      margin: '0 12px 16px'
    }}>
      <svg
        width={size}
        height={size}
        onMouseDown={handleMouseDown}
        style={{ cursor: 'ns-resize', marginBottom: 8 }}
      >
        <defs>
          <filter id={`glow-${label}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="rgba(30, 30, 40, 0.9)"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
        />
        
        <path
          d={describeArc(cx, cy, r, -135, 135)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        
        <path
          d={describeArc(cx, cy, r, -135, angle)}
          fill="none"
          stroke={getStrokeColor()}
          strokeWidth={3}
          strokeLinecap="round"
          filter={`url(#glow-${label})`}
        />
        
        <circle cx={cx} cy={cy} r={3} fill="#fff" opacity={0.9} />
        
        <line
          x1={cx}
          y1={cy}
          x2={tickX}
          y2={tickY}
          stroke="#fff"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
      
      <div style={{ 
        fontSize: 11, 
        fontWeight: 600, 
        color: '#fff', 
        marginBottom: 2,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {label}
      </div>
      
      <div style={{ 
        fontSize: 13, 
        color: accentColor, 
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center',
        textShadow: `0 0 10px ${accentColor}88`
      }}>
        {formatValue(value)}{unit}
      </div>
    </div>
  )
}

// EQ Plugin - Ocean Wave Theme
function EQPluginUI({ params, onUpdate }: { params: Record<string, number>, onUpdate: (p: Record<string, number>) => void }) {
  const low = params.low ?? 0
  const mid = params.mid ?? 0
  const high = params.high ?? 0

  const generateCurve = () => {
    const points: string[] = []
    const width = 400
    const height = 150
    const centerY = height / 2

    for (let x = 0; x <= width; x++) {
      const freq = x / width
      let gain = 0

      if (freq < 0.3) {
        gain += low * (1 - freq / 0.3)
      }

      if (freq >= 0.25 && freq <= 0.75) {
        const midNorm = 1 - Math.abs((freq - 0.5) / 0.25)
        gain += mid * midNorm
      }

      if (freq > 0.7) {
        gain += high * ((freq - 0.7) / 0.3)
      }

      const y = centerY - (gain * 4)
      points.push(`${x},${Math.max(0, Math.min(height, y))}`)
    }

    return points.join(' ')
  }

  return (
    <div style={{ 
      padding: 20,
      background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated wave background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle at 30% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)',
        animation: 'pulse 3s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: 20,
          gap: 12
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
          }}>
            🎚️
          </div>
          <h3 style={{ 
            margin: 0, 
            fontSize: 16, 
            fontWeight: 800, 
            color: '#fff',
            letterSpacing: '1px',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)'
          }}>
            3-BAND PARAMETRIC EQ
          </h3>
        </div>

        <div style={{ 
          background: 'rgba(15, 32, 39, 0.6)', 
          borderRadius: 12, 
          padding: 20,
          marginBottom: 24,
          border: '1px solid rgba(16, 185, 129, 0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)'
        }}>
          <svg width="400" height="150" style={{ display: 'block' }}>
            <defs>
              <linearGradient id="eqGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
              <filter id="eqGlow">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            {[0, 37.5, 75, 112.5, 150].map(y => (
              <line key={y} x1={0} y1={y} x2={400} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
            ))}
            {[0, 100, 200, 300, 400].map(x => (
              <line key={x} x1={x} y1={0} x2={x} y2={150} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
            ))}
            
            <line x1={0} y1={75} x2={400} y2={75} stroke="rgba(16, 185, 129, 0.4)" strokeWidth={1} strokeDasharray="4 4" />
            
            <polygon
              points={`0,150 ${generateCurve()} 400,150`}
              fill="url(#eqGradient)"
            />
            
            <polyline
              points={generateCurve()}
              fill="none"
              stroke="#10b981"
              strokeWidth={3}
              strokeLinejoin="round"
              filter="url(#eqGlow)"
            />
            
            <circle cx={60} cy={75 - low * 4} r={7} fill="#10b981" stroke="#fff" strokeWidth={2.5} filter="url(#eqGlow)" />
            <circle cx={200} cy={75 - mid * 4} r={7} fill="#f59e0b" stroke="#fff" strokeWidth={2.5} filter="url(#eqGlow)" />
            <circle cx={340} cy={75 - high * 4} r={7} fill="#ef4444" stroke="#fff" strokeWidth={2.5} filter="url(#eqGlow)" />
            
            <text x={60} y={168} fill="rgba(255,255,255,0.7)" fontSize={11} textAnchor="middle" fontWeight="600">80Hz</text>
            <text x={200} y={168} fill="rgba(255,255,255,0.7)" fontSize={11} textAnchor="middle" fontWeight="600">1kHz</text>
            <text x={340} y={168} fill="rgba(255,255,255,0.7)" fontSize={11} textAnchor="middle" fontWeight="600">12kHz</text>
          </svg>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            <span>+12dB</span>
            <span>0dB</span>
            <span>-12dB</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
          <ProfessionalKnob
            label="LOW"
            value={low}
            min={-12}
            max={12}
            unit="dB"
            bipolar
            accentColor="#10b981"
            onChange={(v) => onUpdate({ low: v })}
          />
          <ProfessionalKnob
            label="MID"
            value={mid}
            min={-12}
            max={12}
            unit="dB"
            bipolar
            accentColor="#f59e0b"
            onChange={(v) => onUpdate({ mid: v })}
          />
          <ProfessionalKnob
            label="HIGH"
            value={high}
            min={-12}
            max={12}
            unit="dB"
            bipolar
            accentColor="#ef4444"
            onChange={(v) => onUpdate({ high: v })}
          />
        </div>
      </div>
    </div>
  )
}

// Compressor Plugin - Industrial Steel Theme
function CompressorPluginUI({ params, onUpdate }: { params: Record<string, number>, onUpdate: (p: Record<string, number>) => void }) {
  const threshold = params.threshold ?? -20
  const ratio = params.ratio ?? 4
  const attack = params.attack ?? 0.01
  const release = params.release ?? 0.1

  return (
    <div style={{ 
      padding: 20,
      background: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Metallic grid pattern */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          linear-gradient(0deg, rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
        pointerEvents: 'none'
      }} />
      
      {/* Radial glow */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '60%',
        height: '60%',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: 20,
          gap: 12
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: '0 4px 12px rgba(168, 85, 247, 0.4)'
          }}>
            🎛️
          </div>
          <h3 style={{ 
            margin: 0, 
            fontSize: 16, 
            fontWeight: 800, 
            color: '#fff',
            letterSpacing: '1px',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)'
          }}>
            DYNAMICS COMPRESSOR
          </h3>
        </div>

        <div style={{ 
          background: 'rgba(30, 30, 35, 0.7)', 
          borderRadius: 12, 
          padding: 20,
          marginBottom: 24,
          border: '1px solid rgba(168, 85, 247, 0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
          backdropFilter: 'blur(10px)'
        }}>
          <svg width="300" height="300" style={{ display: 'block', margin: '0 auto' }}>
            <defs>
              <pattern id="compGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
              </pattern>
              <filter id="compGlow">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            <rect width="300" height="300" fill="url(#compGrid)" />
            
            <line x1={0} y1={300} x2={300} y2={300} stroke="rgba(255,255,255,0.4)" strokeWidth={2} />
            <line x1={0} y1={0} x2={0} y2={300} stroke="rgba(255,255,255,0.4)" strokeWidth={2} />
            
            <line x1={0} y1={300} x2={300} y2={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 4" />
            
            {(() => {
              const thresholdX = ((threshold + 60) / 60) * 300
              const slope = 1 / ratio
              
              return (
                <>
                  <line 
                    x1={0} 
                    y1={300} 
                    x2={thresholdX} 
                    y2={300 - thresholdX} 
                    stroke="#10b981" 
                    strokeWidth={3.5} 
                    filter="url(#compGlow)"
                  />
                  
                  <line 
                    x1={thresholdX} 
                    y1={300 - thresholdX} 
                    x2={300} 
                    y2={300 - thresholdX - ((300 - thresholdX) * slope)}
                    stroke="#a855f7" 
                    strokeWidth={3.5} 
                    filter="url(#compGlow)"
                  />
                  
                  <line 
                    x1={thresholdX} 
                    y1={0} 
                    x2={thresholdX} 
                    y2={300} 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    strokeDasharray="6 6" 
                    filter="url(#compGlow)"
                  />
                  
                  <circle 
                    cx={thresholdX} 
                    cy={300 - thresholdX} 
                    r={6} 
                    fill="#ef4444" 
                    stroke="#fff" 
                    strokeWidth={2.5}
                    filter="url(#compGlow)"
                  />
                </>
              )
            })()}
            
            <text x={15} y={25} fill="rgba(255,255,255,0.7)" fontSize={12} fontWeight="600">OUTPUT</text>
            <text x={240} y={290} fill="rgba(255,255,255,0.7)" fontSize={12} fontWeight="600">INPUT</text>
          </svg>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 20 }}>
          <ProfessionalKnob
            label="THRESHOLD"
            value={threshold}
            min={-60}
            max={0}
            unit="dB"
            accentColor="#ef4444"
            onChange={(v) => onUpdate({ threshold: v })}
          />
          <ProfessionalKnob
            label="RATIO"
            value={ratio}
            min={1}
            max={20}
            unit=":1"
            accentColor="#a855f7"
            onChange={(v) => onUpdate({ ratio: v })}
          />
          <ProfessionalKnob
            label="ATTACK"
            value={attack * 1000}
            min={0}
            max={100}
            unit="ms"
            accentColor="#3b82f6"
            onChange={(v) => onUpdate({ attack: v / 1000 })}
          />
          <ProfessionalKnob
            label="RELEASE"
            value={release * 1000}
            min={10}
            max={2000}
            unit="ms"
            accentColor="#06b6d4"
            onChange={(v) => onUpdate({ release: v / 1000 })}
          />
        </div>
      </div>
    </div>
  )
}

// Reverb Plugin - Space/Galaxy Theme
function ReverbPluginUI({ plugin, onUpdate }: { plugin: Plugin, onUpdate: (p: Record<string, number>) => void }) {
  return (
    <div style={{ 
      padding: 20,
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1a3e 50%, #2d1b69 100%)',
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Floating stars */}
      {[...Array(20)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: Math.random() * 3 + 1,
          height: Math.random() * 3 + 1,
          borderRadius: '50%',
          background: '#fff',
          top: `${Math.random() * 100}%`,
          left: `${Math.random() * 100}%`,
          opacity: Math.random() * 0.5 + 0.3,
          boxShadow: '0 0 4px #fff',
          animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`
        }} />
      ))}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: 20,
          gap: 12
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.5)'
          }}>
            🌌
          </div>
          <h3 style={{ 
            margin: 0, 
            fontSize: 16, 
            fontWeight: 800, 
            color: '#fff',
            letterSpacing: '1px',
            textShadow: '0 2px 10px rgba(139, 92, 246, 0.8)'
          }}>
            ALGORITHMIC REVERB
          </h3>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, marginTop: 40 }}>
          {Object.entries(plugin.params).map(([key, value]) => (
            <ProfessionalKnob
              key={key}
              label={key.replace(/_/g, ' ')}
              value={value as number}
              min={0}
              max={1}
              accentColor="#8b5cf6"
              onChange={(v) => onUpdate({ [key]: v })}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// Delay Plugin - Neon/Synthwave Theme
function DelayPluginUI({ plugin, onUpdate }: { plugin: Plugin, onUpdate: (p: Record<string, number>) => void }) {
  return (
    <div style={{ 
      padding: 20,
      background: 'linear-gradient(135deg, #1a0033 0%, #2d1b69 50%, #5b21b6 100%)',
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated grid lines */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(236, 72, 153, 0.1) 40px, rgba(236, 72, 153, 0.1) 41px),
          repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(59, 130, 246, 0.1) 40px, rgba(59, 130, 246, 0.1) 41px)
        `,
        transform: 'perspective(500px) rotateX(60deg)',
        transformOrigin: 'center center',
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: 20,
          gap: 12
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #ec4899, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.5), 0 0 20px rgba(59, 130, 246, 0.3)'
          }}>
            ⏱️
          </div>
          <h3 style={{ 
            margin: 0, 
            fontSize: 16, 
            fontWeight: 800, 
            color: '#fff',
            letterSpacing: '1px',
            textShadow: '0 0 20px rgba(236, 72, 153, 0.8)'
          }}>
            STEREO DELAY
          </h3>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, marginTop: 40 }}>
          {Object.entries(plugin.params).map(([key, value]) => (
            <ProfessionalKnob
              key={key}
              label={key.replace(/_/g, ' ')}
              value={value as number}
              min={0}
              max={1}
              accentColor="#ec4899"
              onChange={(v) => onUpdate({ [key]: v })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Distortion Plugin - Fire/Lava Theme
function DistortionPluginUI({ plugin, onUpdate }: { plugin: Plugin, onUpdate: (p: Record<string, number>) => void }) {
  return (
    <div style={{ 
      padding: 20,
      background: 'linear-gradient(135deg, #1a0000 0%, #4a0000 50%, #8b0000 100%)',
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated fire glow */}
      <div style={{
        position: 'absolute',
        top: '60%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80%',
        height: '80%',
        background: 'radial-gradient(ellipse at center, rgba(255, 69, 0, 0.3) 0%, rgba(255, 140, 0, 0.1) 40%, transparent 70%)',
        animation: 'fireGlow 2s ease-in-out infinite alternate',
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: 20,
          gap: 12
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #ff4500, #ff8c00)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: '0 4px 12px rgba(255, 69, 0, 0.6), 0 0 20px rgba(255, 140, 0, 0.4)'
          }}>
            🔥
          </div>
          <h3 style={{ 
            margin: 0, 
            fontSize: 16, 
            fontWeight: 800, 
            color: '#fff',
            letterSpacing: '1px',
            textShadow: '0 0 20px rgba(255, 69, 0, 0.8)'
          }}>
            HARMONIC DISTORTION
          </h3>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, marginTop: 40 }}>
          {Object.entries(plugin.params).map(([key, value]) => (
            <ProfessionalKnob
              key={key}
              label={key.replace(/_/g, ' ')}
              value={value as number}
              min={0}
              max={1}
              accentColor="#ff4500"
              onChange={(v) => onUpdate({ [key]: v })}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fireGlow {
          0% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
        }
      `}</style>
    </div>
  )
}

// Generic Plugin UI with auto-theming
function GenericPluginUI({ plugin, onUpdate }: { plugin: Plugin, onUpdate: (p: Record<string, number>) => void }) {
  const paramCount = Object.keys(plugin.params).length

  // Auto-theme based on plugin type
  const themes: Record<string, { gradient: string, accent: string, icon: string }> = {
    chorus: { gradient: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', accent: '#3b82f6', icon: '🌊' },
    phaser: { gradient: 'linear-gradient(135deg, #581c87 0%, #a855f7 100%)', accent: '#a855f7', icon: '🌀' },
    flanger: { gradient: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)', accent: '#10b981', icon: '〰️' },
    saturation: { gradient: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)', accent: '#dc2626', icon: '⚡' },
    limiter: { gradient: 'linear-gradient(135deg, #18181b 0%, #71717a 100%)', accent: '#71717a', icon: '🛡️' },
  }

  const theme = themes[plugin.type] || { 
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)', 
    accent: '#a855f7',
    icon: '🎵'
  }

  return (
    <div style={{ 
      padding: 20,
      background: theme.gradient,
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '70%',
        height: '70%',
        background: `radial-gradient(circle, ${theme.accent}15 0%, transparent 70%)`,
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: 20,
          gap: 12
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}cc)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: `0 4px 12px ${theme.accent}66`
          }}>
            {theme.icon}
          </div>
          <h3 style={{ 
            margin: 0, 
            fontSize: 16, 
            fontWeight: 800, 
            color: '#fff',
            letterSpacing: '1px',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)'
          }}>
            {plugin.name.toUpperCase()}
          </h3>
        </div>

        {paramCount === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.6)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{theme.icon}</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>This plugin has no adjustable parameters.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, marginTop: 40 }}>
            {Object.entries(plugin.params).map(([key, value]) => (
              <ProfessionalKnob
                key={key}
                label={key.replace(/_/g, ' ')}
                value={value as number}
                min={0}
                max={1}
                accentColor={theme.accent}
                onChange={(v) => onUpdate({ [key]: v })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function PluginUIRenderer({ plugin, trackId, onUpdateParams }: PluginUIRendererProps) {
  if (plugin.type === 'eq') {
    return <EQPluginUI params={plugin.params} onUpdate={onUpdateParams} />
  }

  if (plugin.type === 'compressor') {
    return <CompressorPluginUI params={plugin.params} onUpdate={onUpdateParams} />
  }

  if (plugin.type === 'reverb') {
    return <ReverbPluginUI plugin={plugin} onUpdate={onUpdateParams} />
  }

  if (plugin.type === 'delay') {
    return <DelayPluginUI plugin={plugin} onUpdate={onUpdateParams} />
  }

  if (plugin.type === 'distortion') {
    return <DistortionPluginUI plugin={plugin} onUpdate={onUpdateParams} />
  }

  return <GenericPluginUI plugin={plugin} onUpdate={onUpdateParams} />
}
