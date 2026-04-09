/**
 * FS-AUDIO Multiband Compressor UI
 * 3-band dynamics control with visual gain reduction
 */

import React, { useState } from 'react'

interface MultibandCompressorUIProps {
  plugin: {
    id: string
    params: Record<string, number>
  }
  onParamChange: (pluginId: string, params: Record<string, number>) => void
}

export function MultibandCompressorUI({ plugin, onParamChange }: MultibandCompressorUIProps) {
  const [selectedBand, setSelectedBand] = useState<'low' | 'mid' | 'high'>('mid')
  
  const params = plugin.params
  
  // Extract band parameters
  const getBandParam = (band: string, param: string) => {
    return params[`${band}${param}`] ?? (param === 'threshold' ? -20 : param === 'ratio' ? 4 : param === 'attack' ? 0.01 : param === 'release' ? 0.1 : 0)
  }
  
  const threshold = getBandParam(selectedBand, 'Threshold')
  const ratio = getBandParam(selectedBand, 'Ratio')
  const attack = getBandParam(selectedBand, 'Attack')
  const release = getBandParam(selectedBand, 'Release')
  const gain = getBandParam(selectedBand, 'Gain')
  
  const lowMidCrossover = params.lowMidCrossover ?? 250
  const midHighCrossover = params.midHighCrossover ?? 2000
  const mix = params.mix ?? 100
  
  const updateParam = (param: string, value: number) => {
    onParamChange(plugin.id, {
      ...params,
      [`${selectedBand}${param}`]: value
    })
  }
  
  const updateGlobalParam = (param: string, value: number) => {
    onParamChange(plugin.id, {
      ...params,
      [param]: value
    })
  }
  
  // Mock gain reduction values (would come from audio engine in real implementation)
  const getReduction = (band: string) => {
    return Math.random() * -12 // Placeholder
  }
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
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
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16
        }}>
          ⚡
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>FS-MultiBand</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>3-Band Dynamics Processor</div>
        </div>
      </div>
      
      {/* Gain Reduction Meters */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        marginBottom: 16
      }}>
        {['low', 'mid', 'high'].map(band => {
          const reduction = Math.abs(getReduction(band))
          const bandNames = { low: 'Low', mid: 'Mid', high: 'High' }
          const colors = { low: '#ef4444', mid: '#f59e0b', high: '#06b6d4' }
          
          return (
            <div
              key={band}
              style={{
                background: selectedBand === band ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)',
                borderRadius: 6,
                padding: 8,
                cursor: 'pointer',
                border: selectedBand === band ? `1px solid ${colors[band]}` : '1px solid transparent',
                transition: 'all 0.15s'
              }}
              onClick={() => setSelectedBand(band as any)}
            >
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
                {bandNames[band]}
              </div>
              <div style={{
                height: 60,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 4,
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${(reduction / 24) * 100}%`,
                  background: colors[band],
                  transition: 'height 0.1s ease'
                }} />
              </div>
              <div style={{
                fontSize: 11,
                color: colors[band],
                fontWeight: 700,
                textAlign: 'center',
                marginTop: 4,
                fontFamily: 'monospace'
              }}>
                {reduction.toFixed(1)} dB
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Band Selection */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
          Editing: {selectedBand.toUpperCase()} Band
        </div>
      </div>
      
      {/* Controls for Selected Band */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            step={0.5}
            value={threshold}
            onChange={e => updateParam('Threshold', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
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
            max={20}
            step={0.5}
            value={ratio}
            onChange={e => updateParam('Ratio', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
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
              max={0.1}
              step={0.001}
              value={attack}
              onChange={e => updateParam('Attack', parseFloat(e.target.value))}
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
              min={0.01}
              max={1}
              step={0.01}
              value={release}
              onChange={e => updateParam('Release', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer' }}
            />
          </div>
        </div>
        
        {/* Makeup Gain */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 10,
            color: '#94a3b8'
          }}>
            <span>Makeup Gain</span>
            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>
              {gain > 0 ? '+' : ''}{gain.toFixed(1)} dB
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={24}
            step={0.5}
            value={gain}
            onChange={e => updateParam('Gain', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
          />
        </div>
        
        {/* Crossover Frequencies */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: 12,
          marginTop: 4
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
            Crossover Frequencies
          </div>
          
          <div style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 4,
              fontSize: 10,
              color: '#94a3b8'
            }}>
              <span>Low/Mid</span>
              <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{lowMidCrossover} Hz</span>
            </div>
            <input
              type="range"
              min={50}
              max={1000}
              step={10}
              value={lowMidCrossover}
              onChange={e => updateGlobalParam('lowMidCrossover', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
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
              <span>Mid/High</span>
              <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{midHighCrossover} Hz</span>
            </div>
            <input
              type="range"
              min={1000}
              max={8000}
              step={100}
              value={midHighCrossover}
              onChange={e => updateGlobalParam('midHighCrossover', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
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
            onChange={e => updateGlobalParam('mix', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
  )
}
