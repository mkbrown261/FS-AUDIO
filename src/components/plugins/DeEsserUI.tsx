/**
 * FS-AUDIO De-Esser UI
 * Sibilance reduction with frequency display
 */

import React, { useRef, useEffect } from 'react'

interface DeEsserUIProps {
  plugin: {
    id: string
    params: Record<string, number>
  }
  onParamChange: (pluginId: string, params: Record<string, number>) => void
}

export function DeEsserUI({ plugin, onParamChange }: DeEsserUIProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const params = plugin.params
  const threshold = params.threshold ?? -30
  const ratio = params.ratio ?? 6
  const frequency = params.frequency ?? 7000
  const bandwidth = params.bandwidth ?? 1.0
  const attack = params.attack ?? 0.003
  const release = params.release ?? 0.1
  const mix = params.mix ?? 100
  
  const updateParam = (param: string, value: number) => {
    onParamChange(plugin.id, {
      ...params,
      [param]: value
    })
  }
  
  // Mock reduction value (would come from audio engine)
  const reduction = Math.random() * 12
  
  // Draw frequency response
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const width = canvas.width
    const height = canvas.height
    
    // Clear
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, height)
    
    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    
    // Draw frequency response curve
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.beginPath()
    
    const q = 1 / (2 * Math.sinh(Math.LN2 / 2 * bandwidth))
    
    for (let x = 0; x < width; x++) {
      const freqRatio = x / width
      const freq = 20 * Math.pow(1000, freqRatio) // 20Hz to 20kHz
      
      // Calculate bell curve response
      const ratio_log = Math.log2(freq / frequency)
      const width_octaves = 1 / q
      const response = 1 / (1 + Math.pow(ratio_log / width_octaves, 2))
      
      // Boost in detection range
      const gain = 12 * response
      
      const y = height - (gain / 18) * height
      
      if (x === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    
    ctx.stroke()
    
    // Draw center frequency marker
    const centerX = Math.log(frequency / 20) / Math.log(1000) * width
    
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(centerX, height / 2, 6, 0, Math.PI * 2)
    ctx.fill()
    
    // Draw frequency labels
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    
    const labels = [
      { freq: 2000, label: '2k' },
      { freq: 5000, label: '5k' },
      { freq: 10000, label: '10k' }
    ]
    
    labels.forEach(({ freq, label }) => {
      const x = Math.log(freq / 20) / Math.log(1000) * width
      ctx.fillText(label, x, height - 4)
    })
    
  }, [frequency, bandwidth])
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)',
      borderRadius: 8,
      padding: 16,
      color: '#e2e8f0'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16
        }}>
          🎙️
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>FS-DeEsser</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Sibilance Reduction</div>
        </div>
      </div>
      
      {/* Reduction Meter */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 6,
        padding: 12,
        marginBottom: 16
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Gain Reduction</span>
          <span style={{
            fontSize: 16,
            fontWeight: 900,
            color: reduction > 6 ? '#ef4444' : reduction > 3 ? '#f59e0b' : '#10b981',
            fontFamily: 'monospace'
          }}>
            -{reduction.toFixed(1)} dB
          </span>
        </div>
        
        <div style={{
          height: 8,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${(reduction / 24) * 100}%`,
            background: 'linear-gradient(90deg, #10b981, #f59e0b, #ef4444)',
            transition: 'width 0.1s ease'
          }} />
        </div>
      </div>
      
      {/* Frequency Display */}
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        style={{
          width: '100%',
          height: 120,
          background: '#0a0a0f',
          borderRadius: 6,
          marginBottom: 16
        }}
      />
      
      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Frequency */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 10,
            color: '#94a3b8'
          }}>
            <span>Frequency</span>
            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>
              {frequency >= 1000 ? `${(frequency / 1000).toFixed(1)}k` : `${frequency}`} Hz
            </span>
          </div>
          <input
            type="range"
            min={4000}
            max={10000}
            step={100}
            value={frequency}
            onChange={e => updateParam('frequency', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#ef4444', cursor: 'pointer' }}
          />
        </div>
        
        {/* Bandwidth */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 10,
            color: '#94a3b8'
          }}>
            <span>Bandwidth</span>
            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{bandwidth.toFixed(2)} oct</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={bandwidth}
            onChange={e => updateParam('bandwidth', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
          />
        </div>
        
        {/* Threshold */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 10,
            color: '#94a3b8'
          }}>
            <span>Threshold</span>
            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{threshold.toFixed(1)} dB</span>
          </div>
          <input
            type="range"
            min={-60}
            max={0}
            step={1}
            value={threshold}
            onChange={e => updateParam('threshold', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#ef4444', cursor: 'pointer' }}
          />
        </div>
        
        {/* Ratio */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 10,
            color: '#94a3b8'
          }}>
            <span>Ratio</span>
            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{ratio.toFixed(1)}:1</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={ratio}
            onChange={e => updateParam('ratio', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#ef4444', cursor: 'pointer' }}
          />
        </div>
        
        {/* Attack/Release */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 4,
              fontSize: 10,
              color: '#94a3b8'
            }}>
              <span>Attack</span>
              <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{(attack * 1000).toFixed(1)}ms</span>
            </div>
            <input
              type="range"
              min={0.001}
              max={0.01}
              step={0.001}
              value={attack}
              onChange={e => updateParam('attack', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer' }}
            />
          </div>
          
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 4,
              fontSize: 10,
              color: '#94a3b8'
            }}>
              <span>Release</span>
              <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{(release * 1000).toFixed(0)}ms</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.2}
              step={0.01}
              value={release}
              onChange={e => updateParam('release', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer' }}
            />
          </div>
        </div>
        
        {/* Mix */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 10,
            color: '#94a3b8'
          }}>
            <span>Mix</span>
            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{Math.round(mix)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={mix}
            onChange={e => updateParam('mix', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
  )
}
