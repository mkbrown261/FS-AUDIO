import React from 'react'
import { Plugin } from '../store/projectStore'
import { PluginRack } from './plugins/BuiltInPlugins'

interface PluginUIRendererProps {
  plugin: Plugin
  trackId: string
  onUpdateParams: (params: Record<string, number>) => void
}

/**
 * PluginUIRenderer - Renders plugin UI for floating windows
 * Uses the existing PluginRack component which already handles all plugin types
 */
export function PluginUIRenderer({ plugin, trackId, onUpdateParams }: PluginUIRendererProps) {
  return (
    <div className="plugin-ui-content" style={{ padding: '12px' }}>
      <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#a855f7' }}>{plugin.name}</h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          {plugin.enabled ? '🟢 Active' : '⚫ Bypassed'}
        </p>
      </div>
      
      {/* Render parameters based on plugin type */}
      <div className="plugin-params">
        {plugin.type === 'eq' && (
          <div>
            {(['low', 'mid', 'high'] as const).map((key, idx) => {
              const labels = ['Low', 'Mid', 'High']
              const val = (plugin.params[key] as number) ?? 0
              return (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                    {labels[idx]}
                  </label>
                  <input 
                    type="range" 
                    min={-12} 
                    max={12} 
                    step={0.5} 
                    value={val}
                    style={{ width: '100%' }}
                    onChange={e => onUpdateParams({ [key]: parseFloat(e.target.value) })} 
                  />
                  <div style={{ fontSize: 12, color: '#fff', marginTop: 4 }}>
                    {val > 0 ? '+' : ''}{val.toFixed(1)} dB
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {plugin.type === 'compressor' && (
          <div>
            {(['threshold', 'ratio', 'attack', 'release'] as const).map(key => {
              const labels = { threshold: 'Threshold', ratio: 'Ratio', attack: 'Attack', release: 'Release' }
              const val = (plugin.params[key] as number) ?? 0
              const ranges = {
                threshold: { min: -60, max: 0, step: 1, suffix: ' dB' },
                ratio: { min: 1, max: 20, step: 0.1, suffix: ':1' },
                attack: { min: 0, max: 1, step: 0.01, suffix: ' s' },
                release: { min: 0, max: 2, step: 0.01, suffix: ' s' },
              }
              const range = ranges[key]
              return (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                    {labels[key]}
                  </label>
                  <input 
                    type="range" 
                    min={range.min} 
                    max={range.max} 
                    step={range.step} 
                    value={val}
                    style={{ width: '100%' }}
                    onChange={e => onUpdateParams({ [key]: parseFloat(e.target.value) })} 
                  />
                  <div style={{ fontSize: 12, color: '#fff', marginTop: 4 }}>
                    {val.toFixed(key === 'ratio' ? 1 : 2)}{range.suffix}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {!['eq', 'compressor'].includes(plugin.type) && (
          <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
            <p>Parameters for {plugin.name}</p>
            <p style={{ marginTop: 8, fontSize: 11 }}>
              {Object.keys(plugin.params).length > 0 
                ? `${Object.keys(plugin.params).length} parameters available`
                : 'No adjustable parameters'}
            </p>
            {Object.keys(plugin.params).length > 0 && (
              <div style={{ marginTop: 16, textAlign: 'left' }}>
                {Object.entries(plugin.params).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                      {key}
                    </label>
                    <input 
                      type="range" 
                      min={0} 
                      max={1} 
                      step={0.01} 
                      value={value as number}
                      style={{ width: '100%' }}
                      onChange={e => onUpdateParams({ [key]: parseFloat(e.target.value) })} 
                    />
                    <div style={{ fontSize: 12, color: '#fff', marginTop: 4 }}>
                      {(value as number).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
