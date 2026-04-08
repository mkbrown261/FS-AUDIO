import React from 'react'
import { Plugin } from '../store/projectStore'
import { AnalogSynthUI } from './instruments/AnalogSynthUI'

interface PluginUIRendererProps {
  plugin: Plugin
  trackId: string
  onUpdateParams: (params: Record<string, number | string>) => void
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
      margin: '0 8px 12px'
    }}>
      <svg
        width={size}
        height={size}
        onMouseDown={handleMouseDown}
        style={{ cursor: 'ns-resize', marginBottom: 6 }}
      >
        <defs>
          <filter id={`glow-${label}-${Math.random()}`} x="-50%" y="-50%" width="200%" height="200%">
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
        fontSize: 9, 
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
        fontSize: 11, 
        color: accentColor, 
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center'
      }}>
        {formatValue(value)}{unit}
      </div>
    </div>
  )
}

// Theme wrapper component
function ThemedPluginWrapper({ 
  plugin,
  gradient,
  accentColor,
  icon,
  children,
  backgroundEffect
}: {
  plugin: Plugin
  gradient: string
  accentColor: string
  icon: string
  children: React.ReactNode
  backgroundEffect?: React.ReactNode
}) {
  return (
    <div style={{ 
      padding: 20,
      background: gradient,
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {backgroundEffect}
      
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
            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: `0 4px 12px ${accentColor}66`
          }}>
            {icon}
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

        {children}
      </div>
    </div>
  )
}

// Get theme based on plugin type or name
function getPluginTheme(plugin: Plugin): { gradient: string, accent: string, icon: string, effect?: React.ReactNode } {
  const type = plugin.type.toLowerCase()
  const name = plugin.name.toLowerCase()

  // EQ Plugins - Ocean Wave Theme
  if (type.includes('eq') || name.includes('eq') || name.includes('proq')) {
    return {
      gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
      accent: '#10b981',
      icon: '🎚️',
      effect: (
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
      )
    }
  }

  // Compressor/Dynamics - Industrial Steel
  if (type.includes('comp') || type.includes('pressure') || type.includes('forge') || name.includes('comp')) {
    return {
      gradient: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
      accent: '#a855f7',
      icon: '🎛️',
      effect: (
        <>
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
        </>
      )
    }
  }

  // Reverb/Space - Galaxy Theme
  if (type.includes('reverb') || type.includes('verb') || type.includes('cosmos') || name.includes('reverb')) {
    return {
      gradient: 'linear-gradient(135deg, #0a0e27 0%, #1a1a3e 50%, #2d1b69 100%)',
      accent: '#8b5cf6',
      icon: '🌌',
      effect: (
        <>
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
          <style>{`
            @keyframes twinkle {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 1; }
            }
          `}</style>
        </>
      )
    }
  }

  // Delay - Synthwave Theme
  if (type.includes('delay') || name.includes('delay')) {
    return {
      gradient: 'linear-gradient(135deg, #1a0033 0%, #2d1b69 50%, #5b21b6 100%)',
      accent: '#ec4899',
      icon: '⏱️',
      effect: (
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
      )
    }
  }

  // Distortion/Saturation - Fire Theme
  if (type.includes('distort') || type.includes('saturn') || type.includes('oxide') || name.includes('distort') || name.includes('satur')) {
    return {
      gradient: 'linear-gradient(135deg, #1a0000 0%, #4a0000 50%, #8b0000 100%)',
      accent: '#ff4500',
      icon: '🔥',
      effect: (
        <>
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
          <style>{`
            @keyframes fireGlow {
              0% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
              100% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
            }
          `}</style>
        </>
      )
    }
  }

  // Transient/Attack - Lightning Theme
  if (type.includes('transient') || name.includes('transient')) {
    return {
      gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
      accent: '#facc15',
      icon: '⚡',
      effect: (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '70%',
          height: '70%',
          background: 'radial-gradient(circle, rgba(250, 204, 21, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
      )
    }
  }

  // Pitch/Harmony - Crystal Theme
  if (type.includes('pitch') || type.includes('flux') || type.includes('crystal') || name.includes('pitch')) {
    return {
      gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0e7490 50%, #06b6d4 100%)',
      accent: '#06b6d4',
      icon: '💎',
      effect: (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.1) 0%, transparent 60%)',
          pointerEvents: 'none'
        }} />
      )
    }
  }

  // Spatial/Width - Prism Theme
  if (type.includes('stereo') || type.includes('space') || type.includes('prism') || type.includes('phase') || name.includes('stereo') || name.includes('width')) {
    return {
      gradient: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #a78bfa 100%)',
      accent: '#c084fc',
      icon: '🌈',
      effect: (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          height: '80%',
          background: 'conic-gradient(from 0deg, rgba(192, 132, 252, 0.1), rgba(124, 58, 237, 0.1), rgba(76, 29, 149, 0.1), rgba(192, 132, 252, 0.1))',
          borderRadius: '50%',
          pointerEvents: 'none'
        }} />
      )
    }
  }

  // Gate/Shield - Protection Theme
  if (type.includes('gate') || type.includes('shield') || type.includes('nova') || name.includes('gate')) {
    return {
      gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)',
      accent: '#94a3b8',
      icon: '🛡️',
      effect: (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '60%',
          height: '60%',
          background: 'radial-gradient(circle, rgba(148, 163, 184, 0.1) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
      )
    }
  }

  // AI Plugins - Neon Cyber Theme
  if (type.includes('ai_') || name.includes('claw') || name.includes('ember') || name.includes('nexus') || name.includes('zephyr')) {
    return {
      gradient: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
      accent: '#22d3ee',
      icon: '🤖',
      effect: (
        <>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `
              linear-gradient(90deg, rgba(34, 211, 238, 0.05) 1px, transparent 1px),
              linear-gradient(0deg, rgba(34, 211, 238, 0.05) 1px, transparent 1px)
            `,
            backgroundSize: '30px 30px',
            pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '70%',
            height: '70%',
            background: 'radial-gradient(circle, rgba(34, 211, 238, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />
        </>
      )
    }
  }

  // Enhancer/Vibe - Groove Theme
  if (type.includes('enhance') || type.includes('exciter') || type.includes('vibe') || type.includes('hades') || name.includes('enhance')) {
    return {
      gradient: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #16a34a 100%)',
      accent: '#22c55e',
      icon: '✨',
      effect: (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '70%',
          height: '70%',
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
      )
    }
  }

  // Chorus/Modulation - Wave Theme
  if (type.includes('chorus') || type.includes('flanger') || type.includes('phaser') || name.includes('chorus')) {
    return {
      gradient: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
      accent: '#3b82f6',
      icon: '🌊',
      effect: (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '70%',
          height: '70%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
      )
    }
  }

  // Limiter - Brick Wall Theme
  if (type.includes('limit') || name.includes('limit')) {
    return {
      gradient: 'linear-gradient(135deg, #18181b 0%, #3f3f46 50%, #71717a 100%)',
      accent: '#71717a',
      icon: '🧱',
      effect: (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `
            linear-gradient(0deg, rgba(255,255,255,0.02) 2px, transparent 2px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 2px, transparent 2px)
          `,
          backgroundSize: '30px 30px',
          pointerEvents: 'none'
        }} />
      )
    }
  }

  // Default Theme
  return {
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)',
    accent: '#a855f7',
    icon: '🎵',
    effect: (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '70%',
        height: '70%',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />
    )
  }
}

// Generic plugin UI that works for ALL plugins
export function PluginUIRenderer({ plugin, trackId, onUpdateParams }: PluginUIRendererProps) {
  // Custom UI for instrument plugins
  if (plugin.type === 'fs_analog') {
    return <AnalogSynthUI params={plugin.params} onUpdate={onUpdateParams} />
  }
  
  const theme = getPluginTheme(plugin)
  const paramCount = Object.keys(plugin.params).length

  return (
    <ThemedPluginWrapper
      plugin={plugin}
      gradient={theme.gradient}
      accentColor={theme.accent}
      icon={theme.icon}
      backgroundEffect={theme.effect}
    >
      {paramCount === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.6)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{theme.icon}</div>
          <p style={{ fontSize: 14, fontWeight: 600 }}>This plugin has no adjustable parameters.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8, marginTop: 20 }}>
          {Object.entries(plugin.params).map(([key, value]) => {
            // Smart parameter detection
            let label = key.toUpperCase()
            let min = 0
            let max = 1
            let unit = ''
            let bipolar = false

            // Frequency parameters
            if (key.includes('freq') || key.includes('f') && !key.includes('feedback')) {
              min = 20
              max = 20000
              unit = 'Hz'
              label = key.replace(/[bf]\d*/, 'FREQ').replace(/_/g, ' ')
            }
            // Gain/Level parameters
            else if (key.includes('gain') || key.includes('g') || key.includes('level')) {
              min = -24
              max = 24
              unit = 'dB'
              bipolar = true
              label = key.replace(/[bg]\d*/, 'GAIN').replace(/_/g, ' ')
            }
            // Q/Resonance
            else if (key.includes('q') || key.includes('res')) {
              min = 0.1
              max = 10
              label = key.replace(/q\d*/, 'Q').replace(/_/g, ' ')
            }
            // Time-based (attack, release, delay)
            else if (key.includes('time') || key.includes('attack') || key.includes('release') || key.includes('delay')) {
              min = 0
              max = 2
              unit = 's'
            }
            // Threshold
            else if (key.includes('thresh')) {
              min = -60
              max = 0
              unit = 'dB'
            }
            // Ratio
            else if (key.includes('ratio')) {
              min = 1
              max = 20
              unit = ':1'
            }
            // Generic 0-1 parameters
            else {
              label = key.replace(/_/g, ' ')
            }

            return (
              <ProfessionalKnob
                key={key}
                label={label}
                value={value as number}
                min={min}
                max={max}
                unit={unit}
                bipolar={bipolar}
                accentColor={theme.accent}
                onChange={(v) => onUpdateParams({ [key]: v })}
              />
            )
          })}
        </div>
      )}
    </ThemedPluginWrapper>
  )
}
