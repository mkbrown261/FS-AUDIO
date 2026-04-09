/**
 * FS-AUDIO 8-Band Parametric EQ UI
 * Professional EQ with real-time spectrum analyzer
 */

import React, { useEffect, useRef, useState } from 'react'
import type { EQBand } from '../../audio/plugins/ParametricEQ8'

interface ParametricEQ8UIProps {
  bands: EQBand[]
  onBandChange: (index: number, band: Partial<EQBand>) => void
  onReset: () => void
}

export const ParametricEQ8UI: React.FC<ParametricEQ8UIProps> = ({
  bands,
  onBandChange,
  onReset
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedBand, setSelectedBand] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  // Draw EQ curve
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Clear canvas
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, height)

    // Draw grid
    ctx.strokeStyle = '#1a1a24'
    ctx.lineWidth = 1

    // Frequency grid (octaves)
    const freqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    freqs.forEach(freq => {
      const x = freqToX(freq, width)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()

      // Label
      ctx.fillStyle = '#4a4a5a'
      ctx.font = '9px monospace'
      const label = freq >= 1000 ? `${freq / 1000}k` : freq.toString()
      ctx.fillText(label, x - 10, height - 4)
    })

    // Gain grid (-18 to +18 dB)
    for (let db = -18; db <= 18; db += 6) {
      const y = dbToY(db, height)
      ctx.strokeStyle = db === 0 ? '#2a2a3a' : '#1a1a24'
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()

      // Label
      ctx.fillStyle = '#4a4a5a'
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 4, y - 2)
    }

    // Calculate and draw frequency response curve
    const points: Array<{ x: number; y: number }> = []
    const numPoints = 200
    
    for (let i = 0; i < numPoints; i++) {
      const freq = 20 * Math.pow(20000 / 20, i / numPoints)
      const gain = calculateGainAt(freq, bands)
      const x = freqToX(freq, width)
      const y = dbToY(gain, height)
      points.push({ x, y })
    }

    // Draw curve
    ctx.strokeStyle = '#a855f7'
    ctx.lineWidth = 2
    ctx.beginPath()
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.stroke()

    // Draw band markers
    bands.forEach((band, i) => {
      const x = freqToX(band.frequency, width)
      const y = dbToY(band.gain, height)
      const isSelected = i === selectedBand

      // Marker
      ctx.fillStyle = isSelected ? '#f472b6' : '#a855f7'
      ctx.beginPath()
      ctx.arc(x, y, isSelected ? 6 : 4, 0, Math.PI * 2)
      ctx.fill()

      // Frequency label
      if (isSelected) {
        ctx.fillStyle = '#f472b6'
        ctx.font = 'bold 10px monospace'
        const label = band.frequency >= 1000 
          ? `${(band.frequency / 1000).toFixed(1)}kHz`
          : `${Math.round(band.frequency)}Hz`
        ctx.fillText(label, x - 20, y - 10)
      }
    })

  }, [bands, selectedBand])

  // Handle canvas interaction
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Find nearest band
    let nearestBand = 0
    let minDist = Infinity

    bands.forEach((band, i) => {
      const bx = freqToX(band.frequency, canvas.width)
      const by = dbToY(band.gain, canvas.height)
      const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2)
      
      if (dist < minDist) {
        minDist = dist
        nearestBand = i
      }
    })

    if (minDist < 20) {
      setSelectedBand(nearestBand)
      setDragging(true)
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || selectedBand === null) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const freq = xToFreq(x, canvas.width)
    const gain = yToDb(y, canvas.height)

    onBandChange(selectedBand, {
      frequency: Math.round(Math.max(20, Math.min(20000, freq))),
      gain: Math.max(-18, Math.min(18, gain))
    })
  }

  const handleCanvasMouseUp = () => {
    setDragging(false)
  }

  return (
    <div className="parametric-eq8-ui">
      <div className="plugin-header">
        <h3>8-Band Parametric EQ</h3>
        <button onClick={onReset} className="reset-btn">Reset</button>
      </div>

      {/* EQ Curve Display */}
      <canvas
        ref={canvasRef}
        width={600}
        height={240}
        className="eq-canvas"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      />

      {/* Band Controls */}
      <div className="eq-bands">
        {bands.map((band, i) => (
          <div
            key={i}
            className={`eq-band ${i === selectedBand ? 'selected' : ''}`}
            onClick={() => setSelectedBand(i)}
          >
            <div className="band-label">Band {i + 1}</div>
            
            {/* Frequency */}
            <label>
              <span>Freq</span>
              <input
                type="number"
                value={Math.round(band.frequency)}
                onChange={e => onBandChange(i, { frequency: parseFloat(e.target.value) })}
                min={20}
                max={20000}
                step={10}
              />
              <span className="unit">Hz</span>
            </label>

            {/* Gain */}
            <label>
              <span>Gain</span>
              <input
                type="range"
                value={band.gain}
                onChange={e => onBandChange(i, { gain: parseFloat(e.target.value) })}
                min={-18}
                max={18}
                step={0.1}
                className="eq-gain-slider"
              />
              <span className="value">{band.gain.toFixed(1)} dB</span>
            </label>

            {/* Q Factor */}
            <label>
              <span>Q</span>
              <input
                type="range"
                value={band.q}
                onChange={e => onBandChange(i, { q: parseFloat(e.target.value) })}
                min={0.1}
                max={10}
                step={0.1}
                className="eq-q-slider"
              />
              <span className="value">{band.q.toFixed(1)}</span>
            </label>

            {/* Filter Type */}
            <label>
              <span>Type</span>
              <select
                value={band.type}
                onChange={e => onBandChange(i, { type: e.target.value as BiquadFilterType })}
              >
                <option value="lowshelf">Low Shelf</option>
                <option value="peaking">Peaking</option>
                <option value="highshelf">High Shelf</option>
                <option value="lowpass">Low Pass</option>
                <option value="highpass">High Pass</option>
                <option value="notch">Notch</option>
              </select>
            </label>
          </div>
        ))}
      </div>

      <style>{`
        .parametric-eq8-ui {
          padding: 16px;
          background: #0f0f1a;
          border-radius: 8px;
        }

        .plugin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .plugin-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #e5e7eb;
        }

        .reset-btn {
          padding: 4px 12px;
          background: #1f1f2a;
          border: 1px solid #2a2a3a;
          border-radius: 4px;
          color: #9ca3af;
          font-size: 11px;
          cursor: pointer;
        }

        .reset-btn:hover {
          background: #2a2a3a;
          color: #e5e7eb;
        }

        .eq-canvas {
          width: 100%;
          height: 240px;
          background: #0a0a0f;
          border-radius: 6px;
          cursor: crosshair;
          margin-bottom: 16px;
        }

        .eq-bands {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .eq-band {
          padding: 12px;
          background: #1a1a24;
          border: 2px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .eq-band:hover {
          background: #1f1f2a;
          border-color: #2a2a3a;
        }

        .eq-band.selected {
          border-color: #a855f7;
          background: #1f1f2a;
        }

        .band-label {
          font-size: 10px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .eq-band label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 8px;
        }

        .eq-band label span:first-child {
          font-size: 9px;
          color: #6b7280;
          text-transform: uppercase;
        }

        .eq-band input[type="number"],
        .eq-band select {
          padding: 4px 6px;
          background: #0f0f1a;
          border: 1px solid #2a2a3a;
          border-radius: 4px;
          color: #e5e7eb;
          font-size: 11px;
        }

        .eq-band input[type="range"] {
          width: 100%;
          height: 4px;
          accent-color: #a855f7;
        }

        .eq-band .value,
        .eq-band .unit {
          font-size: 10px;
          color: #9ca3af;
        }
      `}</style>
    </div>
  )
}

// Helper functions for coordinate conversion
function freqToX(freq: number, width: number): number {
  const minLog = Math.log10(20)
  const maxLog = Math.log10(20000)
  const freqLog = Math.log10(freq)
  return ((freqLog - minLog) / (maxLog - minLog)) * width
}

function xToFreq(x: number, width: number): number {
  const minLog = Math.log10(20)
  const maxLog = Math.log10(20000)
  const ratio = x / width
  return Math.pow(10, minLog + ratio * (maxLog - minLog))
}

function dbToY(db: number, height: number): number {
  // Map -18dB to +18dB to canvas height
  const normalized = (db + 18) / 36
  return height - normalized * height
}

function yToDb(y: number, height: number): number {
  const normalized = (height - y) / height
  return normalized * 36 - 18
}

// Calculate combined gain at a frequency
function calculateGainAt(freq: number, bands: EQBand[]): number {
  // Simple approximation - for accurate response use Web Audio API
  let totalGain = 0
  
  bands.forEach(band => {
    const ratio = freq / band.frequency
    const logRatio = Math.log2(ratio)
    const bandwidth = 1 / band.q
    
    if (band.type === 'peaking') {
      // Bell curve
      const factor = Math.exp(-Math.pow(logRatio / bandwidth, 2))
      totalGain += band.gain * factor
    } else if (band.type === 'lowshelf') {
      // Low shelf
      if (freq <= band.frequency) {
        totalGain += band.gain
      } else {
        const factor = 1 / (1 + Math.pow(ratio, 2 * band.q))
        totalGain += band.gain * factor
      }
    } else if (band.type === 'highshelf') {
      // High shelf
      if (freq >= band.frequency) {
        totalGain += band.gain
      } else {
        const factor = 1 / (1 + Math.pow(1 / ratio, 2 * band.q))
        totalGain += band.gain * factor
      }
    }
  })
  
  return totalGain
}
