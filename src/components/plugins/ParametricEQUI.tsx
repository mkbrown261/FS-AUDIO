import React, { useState, useRef, useEffect } from 'react'
import { EQBand, FilterType } from '../../audio/plugins/ParametricEQ'

interface ParametricEQUIProps {
  params: Record<string, number | string>
  onUpdate: (params: Record<string, number | string>) => void
}

// Parse bands from flat params
const parseBands = (params: Record<string, number | string>): EQBand[] => {
  const bands: EQBand[] = []
  for (let i = 0; i < 8; i++) {
    bands.push({
      id: i,
      enabled: Boolean(params[`band${i}_enabled`]),
      type: (params[`band${i}_type`] as FilterType) || 'bell',
      frequency: Number(params[`band${i}_frequency`]) || 1000,
      gain: Number(params[`band${i}_gain`]) || 0,
      q: Number(params[`band${i}_q`]) || 1.0
    })
  }
  return bands
}

// Update flat params from band
const updateBandParam = (params: Record<string, number | string>, band: EQBand): Record<string, number | string> => {
  return {
    ...params,
    [`band${band.id}_enabled`]: band.enabled ? 1 : 0,
    [`band${band.id}_type`]: band.type,
    [`band${band.id}_frequency`]: band.frequency,
    [`band${band.id}_gain`]: band.gain,
    [`band${band.id}_q`]: band.q
  }
}

const FrequencyResponseCurve: React.FC<{ bands: EQBand[], width: number, height: number }> = ({ bands, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    drawFrequencyResponse(ctx, bands, width, height)
  }, [bands, width, height])
  
  const drawFrequencyResponse = (ctx: CanvasRenderingContext2D, bands: EQBand[], width: number, height: number) => {
    // Clear
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, height)
    
    // Draw grid
    drawGrid(ctx, width, height)
    
    // Calculate frequency response
    const numPoints = 200
    const minFreq = 20
    const maxFreq = 20000
    const points: { x: number, y: number }[] = []
    
    for (let i = 0; i < numPoints; i++) {
      const normalized = i / (numPoints - 1)
      const freq = minFreq * Math.pow(maxFreq / minFreq, normalized)
      
      // Calculate total gain at this frequency (sum of all enabled bands)
      let totalGainDB = 0
      
      bands.forEach(band => {
        if (band.enabled) {
          const gain = calculateBandGain(freq, band)
          totalGainDB += gain
        }
      })
      
      // Convert to screen coordinates
      const x = normalized * width
      const y = height / 2 - (totalGainDB / 24) * (height / 2) // ±24dB range
      
      points.push({ x, y: Math.max(0, Math.min(height, y)) })
    }
    
    // Draw response curve
    ctx.strokeStyle = '#10b981'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = '#10b981'
    ctx.shadowBlur = 10
    
    ctx.beginPath()
    points.forEach((point, i) => {
      if (i === 0) {
        ctx.moveTo(point.x, point.y)
      } else {
        ctx.lineTo(point.x, point.y)
      }
    })
    ctx.stroke()
    
    ctx.shadowBlur = 0
    
    // Draw band markers
    bands.forEach((band, index) => {
      if (band.enabled) {
        const normalized = Math.log10(band.frequency / minFreq) / Math.log10(maxFreq / minFreq)
        const x = normalized * width
        const y = height / 2 - (band.gain / 24) * (height / 2)
        
        const colors = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316']
        
        // Draw marker
        ctx.fillStyle = colors[index]
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.strokeStyle = colors[index]
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, 10, 0, Math.PI * 2)
        ctx.stroke()
        
        // Label
        ctx.fillStyle = colors[index]
        ctx.font = 'bold 10px monospace'
        ctx.fillText(`${index + 1}`, x - 3, y + 25)
      }
    })
  }
  
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    
    // Horizontal lines (gain)
    const gains = [-24, -12, 0, 12, 24]
    gains.forEach(gain => {
      const y = height / 2 - (gain / 24) * (height / 2)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
      
      // Label
      ctx.fillStyle = gain === 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.3)'
      ctx.font = '10px monospace'
      ctx.fillText(`${gain > 0 ? '+' : ''}${gain}dB`, 5, y - 2)
    })
    
    // Vertical lines (frequency)
    const freqs = [100, 1000, 10000]
    freqs.forEach(freq => {
      const normalized = Math.log10(freq / 20) / Math.log10(20000 / 20)
      const x = normalized * width
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
      
      // Label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.textAlign = 'center'
      ctx.fillText(freq >= 1000 ? `${freq/1000}k` : `${freq}`, x, height - 5)
    })
  }
  
  const calculateBandGain = (freq: number, band: EQBand): number => {
    // Simplified filter response calculation
    const ratio = freq / band.frequency
    const logRatio = Math.log(ratio) / Math.LN2
    
    switch (band.type) {
      case 'bell':
        return band.gain / (1 + Math.pow(logRatio * band.q * 2, 2))
      case 'lowshelf':
        return freq < band.frequency ? band.gain / (1 + Math.pow(logRatio * 2, 2)) : 0
      case 'highshelf':
        return freq > band.frequency ? band.gain / (1 + Math.pow(logRatio * 2, 2)) : 0
      default:
        return 0
    }
  }
  
  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block', borderRadius: '8px' }} />
}

export const ParametricEQUI: React.FC<ParametricEQUIProps> = ({ params, onUpdate }) => {
  const bands = parseBands(params)
  const [selectedBand, setSelectedBand] = useState(0)
  
  const band = bands[selectedBand]
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316']
  
  const updateBand = (updates: Partial<EQBand>) => {
    const updatedBand = { ...band, ...updates }
    onUpdate(updateBandParam(params, updatedBand))
  }
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
      padding: '24px',
      borderRadius: '12px',
      minHeight: '600px'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', marginBottom: '4px' }}>
          🎚️ FS-PARAMETRIC EQ
        </div>
        <div style={{ fontSize: '12px', color: '#6ee7b7' }}>
          8-BAND PROFESSIONAL EQUALIZER
        </div>
      </div>

      {/* Frequency Response Curve */}
      <div style={{ marginBottom: '20px' }}>
        <FrequencyResponseCurve bands={bands} width={700} height={250} />
      </div>

      {/* Band Selector */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', justifyContent: 'center' }}>
        {bands.map((b, i) => (
          <button
            key={i}
            onClick={() => setSelectedBand(i)}
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '8px',
              border: selectedBand === i ? `3px solid ${colors[i]}` : '1px solid rgba(255,255,255,0.2)',
              background: b.enabled ? `${colors[i]}33` : '#1a1a2e',
              color: colors[i],
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Band Controls */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '12px',
        padding: '20px',
        border: `2px solid ${colors[selectedBand]}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: colors[selectedBand] }}>
            BAND {selectedBand + 1}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={band.enabled}
              onChange={e => updateBand({ enabled: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: 600 }}>ENABLED</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
          {/* Type */}
          <div>
            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '8px' }}>TYPE</div>
            <select
              value={band.type}
              onChange={e => updateBand({ type: e.target.value as FilterType })}
              style={{
                width: '100%',
                padding: '8px',
                background: '#1a1a2e',
                border: '1px solid #3a3a4e',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px'
              }}
            >
              <option value="bell">Bell</option>
              <option value="lowshelf">Low Shelf</option>
              <option value="highshelf">High Shelf</option>
              <option value="lowpass">Low Pass</option>
              <option value="highpass">High Pass</option>
              <option value="notch">Notch</option>
            </select>
          </div>

          {/* Frequency */}
          <div>
            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '8px' }}>FREQUENCY</div>
            <input
              type="range"
              min={20}
              max={20000}
              step={1}
              value={band.frequency}
              onChange={e => updateBand({ frequency: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '14px', fontWeight: 700, color: colors[selectedBand], textAlign: 'center' }}>
              {band.frequency >= 1000 ? `${(band.frequency/1000).toFixed(1)}k` : band.frequency} Hz
            </div>
          </div>

          {/* Gain */}
          <div>
            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '8px' }}>GAIN</div>
            <input
              type="range"
              min={-24}
              max={24}
              step={0.5}
              value={band.gain}
              onChange={e => updateBand({ gain: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '14px', fontWeight: 700, color: colors[selectedBand], textAlign: 'center' }}>
              {band.gain > 0 ? '+' : ''}{band.gain} dB
            </div>
          </div>

          {/* Q */}
          <div>
            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '8px' }}>Q FACTOR</div>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={band.q}
              onChange={e => updateBand({ q: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '14px', fontWeight: 700, color: colors[selectedBand], textAlign: 'center' }}>
              {band.q.toFixed(1)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
