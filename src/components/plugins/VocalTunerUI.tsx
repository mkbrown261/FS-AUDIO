/**
 * FS-AUDIO Vocal Tuner UI
 * Professional pitch correction interface with visual pitch display
 */

import React, { useState, useEffect } from 'react'

interface VocalTunerUIProps {
  plugin: {
    id: string
    params: Record<string, number>
  }
  onParamChange: (pluginId: string, params: Record<string, number>) => void
}

export function VocalTunerUI({ plugin, onParamChange }: VocalTunerUIProps) {
  const [pitchInfo, setPitchInfo] = useState({
    detectedHz: 0,
    detectedNote: 'N/A',
    centsOff: 0,
    targetHz: 0,
    isActive: false
  })
  
  const params = plugin.params
  const retuneSpeed = params.retuneSpeed ?? 50
  const scale = params.scale ?? 0 // 0=chromatic, 1=major, 2=minor, 3=pentatonic
  const key = params.key ?? 0 // 0=C, 1=C#, etc.
  const mix = params.mix ?? 100
  
  const scaleNames = ['Chromatic', 'Major', 'Minor', 'Pentatonic']
  const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  
  // Update parameter
  const updateParam = (param: string, value: number) => {
    onParamChange(plugin.id, {
      ...params,
      [param]: value
    })
  }
  
  // Pitch display colors
  const getPitchColor = () => {
    if (!pitchInfo.isActive) return '#444'
    const cents = Math.abs(pitchInfo.centsOff)
    if (cents < 10) return '#10b981' // Green - in tune
    if (cents < 30) return '#f59e0b' // Orange - slightly off
    return '#ef4444' // Red - out of tune
  }
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      borderRadius: 8,
      padding: '16px',
      color: '#e2e8f0'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16
        }}>
          🎤
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>FS-VocalTune</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Professional Pitch Correction</div>
        </div>
      </div>
      
      {/* Pitch Display */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 6,
        padding: 12,
        marginBottom: 16,
        border: `2px solid ${getPitchColor()}`
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: getPitchColor(), fontFamily: 'monospace' }}>
            {pitchInfo.detectedNote}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            {pitchInfo.isActive ? `${pitchInfo.detectedHz} Hz` : 'No signal'}
          </div>
        </div>
        
        {/* Cents meter */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8
        }}>
          <div style={{ fontSize: 10, color: '#64748b', minWidth: 30 }}>-50¢</div>
          <div style={{
            flex: 1,
            height: 4,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 2,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Center line */}
            <div style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 2,
              background: '#10b981',
              transform: 'translateX(-50%)'
            }} />
            
            {/* Pitch indicator */}
            {pitchInfo.isActive && (
              <div style={{
                position: 'absolute',
                left: `${50 + pitchInfo.centsOff}%`,
                top: '50%',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: getPitchColor(),
                transform: 'translate(-50%, -50%)',
                boxShadow: `0 0 8px ${getPitchColor()}`,
                transition: 'left 0.1s ease'
              }} />
            )}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', minWidth: 30, textAlign: 'right' }}>+50¢</div>
        </div>
        
        <div style={{
          textAlign: 'center',
          fontSize: 11,
          color: '#94a3b8',
          marginTop: 6
        }}>
          {pitchInfo.isActive ? `${pitchInfo.centsOff > 0 ? '+' : ''}${pitchInfo.centsOff}¢` : '---'}
        </div>
      </div>
      
      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Retune Speed */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 11,
            color: '#94a3b8'
          }}>
            <span>Retune Speed</span>
            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{Math.round(retuneSpeed)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={retuneSpeed}
            onChange={e => updateParam('retuneSpeed', parseInt(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#8b5cf6',
              cursor: 'pointer'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginTop: 2 }}>
            <span>Natural</span>
            <span>T-Pain</span>
          </div>
        </div>
        
        {/* Scale Selection */}
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Scale</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {scaleNames.map((name, idx) => (
              <button
                key={idx}
                onClick={() => updateParam('scale', idx)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  border: scale === idx ? '1px solid #8b5cf6' : '1px solid #334155',
                  background: scale === idx ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.2)',
                  color: scale === idx ? '#c4b5fd' : '#94a3b8',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        
        {/* Key Selection */}
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Key</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {keyNames.map((name, idx) => (
              <button
                key={idx}
                onClick={() => updateParam('key', idx)}
                style={{
                  padding: '6px 4px',
                  fontSize: 10,
                  fontWeight: 600,
                  border: key === idx ? '1px solid #8b5cf6' : '1px solid #334155',
                  background: key === idx ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.2)',
                  color: key === idx ? '#c4b5fd' : '#94a3b8',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        
        {/* Mix */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 11,
            color: '#94a3b8'
          }}>
            <span>Dry/Wet Mix</span>
            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{Math.round(mix)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={mix}
            onChange={e => updateParam('mix', parseInt(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#06b6d4',
              cursor: 'pointer'
            }}
          />
        </div>
      </div>
    </div>
  )
}
