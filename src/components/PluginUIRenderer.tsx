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
  bipolar = false 
}: { 
  label: string
  value: number
  min: number
  max: number
  unit?: string
  onChange: (v: number) => void
  bipolar?: boolean
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

  // Format value display
  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(1)}k`
    if (v % 1 === 0) return v.toString()
    return v.toFixed(2)
  }

  // Arc path generator
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
        {/* Background circle */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="rgba(30, 30, 40, 0.8)"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
        
        {/* Track arc */}
        <path
          d={describeArc(cx, cy, r, -135, 135)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        
        {/* Value arc */}
        <path
          d={describeArc(cx, cy, r, -135, angle)}
          fill="none"
          stroke={bipolar && value < 0 ? '#ef4444' : '#a855f7'}
          strokeWidth={3}
          strokeLinecap="round"
        />
        
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={3} fill="#fff" />
        
        {/* Pointer line */}
        <line
          x1={cx}
          y1={cy}
          x2={tickX}
          y2={tickY}
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      
      <div style={{ 
        fontSize: 11, 
        fontWeight: 600, 
        color: '#fff', 
        marginBottom: 2,
        textAlign: 'center'
      }}>
        {label}
      </div>
      
      <div style={{ 
        fontSize: 13, 
        color: '#a855f7', 
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center'
      }}>
        {formatValue(value)}{unit}
      </div>
    </div>
  )
}

// Professional EQ UI with visual graph
function EQPluginUI({ params, onUpdate }: { params: Record<string, number>, onUpdate: (p: Record<string, number>) => void }) {
  const low = params.low ?? 0
  const mid = params.mid ?? 0
  const high = params.high ?? 0

  // Generate EQ curve visualization
  const generateCurve = () => {
    const points: string[] = []
    const width = 400
    const height = 150
    const centerY = height / 2

    for (let x = 0; x <= width; x++) {
      const freq = x / width
      let gain = 0

      // Low shelf influence (0-0.3)
      if (freq < 0.3) {
        gain += low * (1 - freq / 0.3)
      }

      // Mid peak (0.3-0.7)
      if (freq >= 0.25 && freq <= 0.75) {
        const midNorm = 1 - Math.abs((freq - 0.5) / 0.25)
        gain += mid * midNorm
      }

      // High shelf (0.7-1.0)
      if (freq > 0.7) {
        gain += high * ((freq - 0.7) / 0.3)
      }

      const y = centerY - (gain * 4) // Scale gain for visualization
      points.push(`${x},${Math.max(0, Math.min(height, y))}`)
    }

    return points.join(' ')
  }

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700, color: '#a855f7' }}>
        3-BAND PARAMETRIC EQ
      </h3>

      {/* EQ Graph */}
      <div style={{ 
        background: 'rgba(20, 20, 30, 0.8)', 
        borderRadius: 8, 
        padding: 16,
        marginBottom: 24,
        border: '1px solid rgba(168, 85, 247, 0.2)'
      }}>
        <svg width="400" height="150" style={{ display: 'block' }}>
          {/* Grid lines */}
          {[0, 37.5, 75, 112.5, 150].map(y => (
            <line key={y} x1={0} y1={y} x2={400} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          ))}
          {[0, 100, 200, 300, 400].map(x => (
            <line key={x} x1={x} y1={0} x2={x} y2={150} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          ))}
          
          {/* Center line (0dB) */}
          <line x1={0} y1={75} x2={400} y2={75} stroke="rgba(168, 85, 247, 0.3)" strokeWidth={1} strokeDasharray="4 4" />
          
          {/* EQ Curve */}
          <polyline
            points={generateCurve()}
            fill="none"
            stroke="#a855f7"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          
          {/* Band markers */}
          <circle cx={60} cy={75 - low * 4} r={6} fill="#10b981" stroke="#fff" strokeWidth={2} />
          <circle cx={200} cy={75 - mid * 4} r={6} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
          <circle cx={340} cy={75 - high * 4} r={6} fill="#ef4444" stroke="#fff" strokeWidth={2} />
          
          {/* Frequency labels */}
          <text x={60} y={165} fill="rgba(255,255,255,0.5)" fontSize={10} textAnchor="middle">80Hz</text>
          <text x={200} y={165} fill="rgba(255,255,255,0.5)" fontSize={10} textAnchor="middle">1kHz</text>
          <text x={340} y={165} fill="rgba(255,255,255,0.5)" fontSize={10} textAnchor="middle">12kHz</text>
        </svg>
        
        {/* dB scale */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
          <span>+12dB</span>
          <span>0dB</span>
          <span>-12dB</span>
        </div>
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
        <ProfessionalKnob
          label="LOW"
          value={low}
          min={-12}
          max={12}
          unit="dB"
          bipolar
          onChange={(v) => onUpdate({ low: v })}
        />
        <ProfessionalKnob
          label="MID"
          value={mid}
          min={-12}
          max={12}
          unit="dB"
          bipolar
          onChange={(v) => onUpdate({ mid: v })}
        />
        <ProfessionalKnob
          label="HIGH"
          value={high}
          min={-12}
          max={12}
          unit="dB"
          bipolar
          onChange={(v) => onUpdate({ high: v })}
        />
      </div>
    </div>
  )
}

// Professional Compressor UI
function CompressorPluginUI({ params, onUpdate }: { params: Record<string, number>, onUpdate: (p: Record<string, number>) => void }) {
  const threshold = params.threshold ?? -20
  const ratio = params.ratio ?? 4
  const attack = params.attack ?? 0.01
  const release = params.release ?? 0.1

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700, color: '#a855f7' }}>
        DYNAMICS COMPRESSOR
      </h3>

      {/* Compression curve visualization */}
      <div style={{ 
        background: 'rgba(20, 20, 30, 0.8)', 
        borderRadius: 8, 
        padding: 16,
        marginBottom: 24,
        border: '1px solid rgba(168, 85, 247, 0.2)'
      }}>
        <svg width="300" height="300" style={{ display: 'block', margin: '0 auto' }}>
          {/* Grid */}
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="300" height="300" fill="url(#grid)" />
          
          {/* Axes */}
          <line x1={0} y1={300} x2={300} y2={300} stroke="rgba(255,255,255,0.3)" strokeWidth={2} />
          <line x1={0} y1={0} x2={0} y2={300} stroke="rgba(255,255,255,0.3)" strokeWidth={2} />
          
          {/* Diagonal (1:1 line) */}
          <line x1={0} y1={300} x2={300} y2={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 4" />
          
          {/* Compression curve */}
          {(() => {
            const thresholdX = ((threshold + 60) / 60) * 300
            const slope = 1 / ratio
            
            return (
              <>
                {/* Below threshold (1:1) */}
                <line x1={0} y1={300} x2={thresholdX} y2={300 - thresholdX} stroke="#10b981" strokeWidth={3} />
                
                {/* Above threshold (compressed) */}
                <line 
                  x1={thresholdX} 
                  y1={300 - thresholdX} 
                  x2={300} 
                  y2={300 - thresholdX - ((300 - thresholdX) * slope)}
                  stroke="#a855f7" 
                  strokeWidth={3} 
                />
                
                {/* Threshold marker */}
                <line 
                  x1={thresholdX} 
                  y1={0} 
                  x2={thresholdX} 
                  y2={300} 
                  stroke="#ef4444" 
                  strokeWidth={2} 
                  strokeDasharray="4 4" 
                />
                <circle cx={thresholdX} cy={300 - thresholdX} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
              </>
            )
          })()}
          
          {/* Labels */}
          <text x={10} y={20} fill="rgba(255,255,255,0.5)" fontSize={11}>Output</text>
          <text x={250} y={295} fill="rgba(255,255,255,0.5)" fontSize={11}>Input</text>
        </svg>
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 20 }}>
        <ProfessionalKnob
          label="THRESHOLD"
          value={threshold}
          min={-60}
          max={0}
          unit="dB"
          onChange={(v) => onUpdate({ threshold: v })}
        />
        <ProfessionalKnob
          label="RATIO"
          value={ratio}
          min={1}
          max={20}
          unit=":1"
          onChange={(v) => onUpdate({ ratio: v })}
        />
        <ProfessionalKnob
          label="ATTACK"
          value={attack * 1000}
          min={0}
          max={100}
          unit="ms"
          onChange={(v) => onUpdate({ attack: v / 1000 })}
        />
        <ProfessionalKnob
          label="RELEASE"
          value={release * 1000}
          min={10}
          max={2000}
          unit="ms"
          onChange={(v) => onUpdate({ release: v / 1000 })}
        />
      </div>
    </div>
  )
}

// Generic Plugin UI for other types
function GenericPluginUI({ plugin, onUpdate }: { plugin: Plugin, onUpdate: (p: Record<string, number>) => void }) {
  const paramCount = Object.keys(plugin.params).length

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700, color: '#a855f7' }}>
        {plugin.name.toUpperCase()}
      </h3>

      {paramCount === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
          <p>This plugin has no adjustable parameters.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20 }}>
          {Object.entries(plugin.params).map(([key, value]) => (
            <ProfessionalKnob
              key={key}
              label={key.toUpperCase()}
              value={value as number}
              min={0}
              max={1}
              onChange={(v) => onUpdate({ [key]: v })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PluginUIRenderer({ plugin, trackId, onUpdateParams }: PluginUIRendererProps) {
  // Route to appropriate UI based on plugin type
  if (plugin.type === 'eq') {
    return <EQPluginUI params={plugin.params} onUpdate={onUpdateParams} />
  }

  if (plugin.type === 'compressor') {
    return <CompressorPluginUI params={plugin.params} onUpdate={onUpdateParams} />
  }

  return <GenericPluginUI plugin={plugin} onUpdate={onUpdateParams} />
}
