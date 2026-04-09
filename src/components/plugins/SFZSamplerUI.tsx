import React from 'react'
import { Plugin, useProjectStore } from '../../store/projectStore'
import { loadSFZFile, loadSFZSamples, extractSamplePaths } from '../../utils/sfzLoader'

interface SFZSamplerUIProps {
  trackId: string
  plugin: Plugin
  onParamChange: (pluginId: string, paramKey: string, value: number | string) => void
}

export function SFZSamplerUI({ trackId, plugin, onParamChange }: SFZSamplerUIProps) {
  const sfzPath = plugin.params.sfzPath as string || ''
  const sfzLoaded = !!plugin.params.sfzContent

  const handleLoadClick = async () => {
    try {
      // Load SFZ file
      const sfzData = await loadSFZFile()
      if (!sfzData) return

      console.log('[SFZ] Loaded SFZ file:', sfzData.name)

      // Update the plugin params with SFZ content
      useProjectStore.getState().updatePlugin(trackId, plugin.id, {
        sfzContent: sfzData.content,
        sfzPath: sfzData.path,
      })

      // Prompt for samples folder
      alert(`SFZ file "${sfzData.name}" loaded. Now select the folder containing the samples.`)
      const samples = await loadSFZSamples()

      if (samples.size > 0) {
        const requiredSamples = extractSamplePaths(sfzData.content)
        console.log(`[SFZ] Required samples:`, requiredSamples)
        console.log(`[SFZ] Loaded ${samples.size} sample files`)
        
        alert(`Loaded SFZ "${sfzData.name}" with ${samples.size} samples`)
      }
    } catch (error) {
      console.error('[SFZ] Failed to load:', error)
      alert('Failed to load SFZ file')
    }
  }

  return (
    <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '4px' }}>
      <div style={{ marginBottom: '12px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#fff' }}>
          FS-SFZ Sampler
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
          Professional SFZ sample player
        </p>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <button
          onClick={handleLoadClick}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: sfzLoaded ? '#22c55e' : '#3b82f6',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          {sfzLoaded ? '✓ SFZ Loaded' : 'Load SFZ File...'}
        </button>
      </div>

      {sfzLoaded && sfzPath && (
        <div style={{
          padding: '8px',
          background: '#0a0a0a',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#aaa'
        }}>
          <div style={{ marginBottom: '4px', color: '#666' }}>Loaded:</div>
          <div style={{ color: '#fff', fontFamily: 'monospace' }}>
            {sfzPath.split('/').pop() || sfzPath}
          </div>
        </div>
      )}

      {!sfzLoaded && (
        <div style={{
          padding: '12px',
          background: '#0a0a0a',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#666',
          textAlign: 'center'
        }}>
          No SFZ file loaded.<br />
          Click "Load SFZ File" to get started.
        </div>
      )}
    </div>
  )
}
