import React, { useState } from 'react'
import { Plugin, useProjectStore } from '../../store/projectStore'
import { loadSFZFile, loadSFZSamples, extractSamplePaths } from '../../utils/sfzLoader'
import { BUILTIN_INSTRUMENTS, BuiltInInstrument } from '../../data/builtinInstruments'

interface SFZSamplerUIProps {
  trackId: string
  plugin: Plugin
  onParamChange: (pluginId: string, paramKey: string, value: number | string) => void
}

export function SFZSamplerUI({ trackId, plugin, onParamChange }: SFZSamplerUIProps) {
  const [showBuiltIns, setShowBuiltIns] = useState(true)
  const sfzPath = plugin.params.sfzPath as string || ''
  const sfzLoaded = !!plugin.params.sfzContent

  const handleLoadBuiltIn = async (instrument: BuiltInInstrument) => {
    try {
      // Load built-in SFZ file
      const response = await fetch(instrument.sfzPath)
      const sfzContent = await response.text()

      // Extract sample paths from SFZ content
      const samplePaths = extractSamplePaths(sfzContent)
      console.log('[SFZ] Required samples:', samplePaths)

      // Load all sample files
      const samples = new Map<string, ArrayBuffer>()
      const basePath = instrument.sfzPath.substring(0, instrument.sfzPath.lastIndexOf('/'))
      
      for (const samplePath of samplePaths) {
        try {
          const sampleUrl = `${basePath}/${samplePath}`
          console.log('[SFZ] Loading sample:', sampleUrl)
          const sampleResponse = await fetch(sampleUrl)
          if (!sampleResponse.ok) {
            console.warn(`[SFZ] Failed to load sample ${sampleUrl}: ${sampleResponse.status}`)
            continue
          }
          const arrayBuffer = await sampleResponse.arrayBuffer()
          // Store with just the filename (matching SFZ reference)
          const filename = samplePath.split('/').pop() || samplePath
          samples.set(filename, arrayBuffer)
          console.log(`[SFZ] Loaded sample: ${filename}`)
        } catch (err) {
          console.error(`[SFZ] Error loading sample ${samplePath}:`, err)
        }
      }

      console.log(`[SFZ] Loaded ${samples.size} of ${samplePaths.length} samples`)

      // Update plugin params with both SFZ content and samples
      useProjectStore.getState().updatePlugin(trackId, plugin.id, {
        sfzContent,
        sfzPath: instrument.sfzPath,
        samples: Array.from(samples.entries()).map(([name, buffer]) => ({
          name,
          buffer
        }))
      })

      console.log('[SFZ] Loaded built-in instrument:', instrument.name)
      setShowBuiltIns(false)
    } catch (error) {
      console.error('[SFZ] Failed to load built-in instrument:', error)
      alert('Failed to load instrument')
    }
  }

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

      {!sfzLoaded && showBuiltIns ? (
        <>
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#aaa', fontWeight: '500' }}>
            Built-in Instruments:
          </div>
          <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
            {BUILTIN_INSTRUMENTS.map(instrument => (
              <button
                key={instrument.id}
                onClick={() => handleLoadBuiltIn(instrument)}
                style={{
                  padding: '8px 12px',
                  background: '#2a2a2a',
                  border: '1px solid #3a3a3a',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#3a3a3a'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#2a2a2a'}
              >
                <div style={{ fontWeight: '500' }}>{instrument.name}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                  {instrument.description}
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowBuiltIns(false)}
            style={{
              width: '100%',
              padding: '6px',
              background: 'transparent',
              border: '1px dashed #444',
              borderRadius: '4px',
              color: '#888',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Or load your own SFZ file...
          </button>
        </>
      ) : !sfzLoaded ? (
        <>
          <div style={{ marginBottom: '12px' }}>
            <button
              onClick={handleLoadClick}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#3b82f6',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Load SFZ File...
            </button>
          </div>
          <button
            onClick={() => setShowBuiltIns(true)}
            style={{
              width: '100%',
              padding: '6px',
              background: 'transparent',
              border: '1px dashed #444',
              borderRadius: '4px',
              color: '#888',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            ← Back to built-in instruments
          </button>
        </>
      ) : (
        <>
          <div style={{
            padding: '8px',
            background: '#0a0a0a',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#aaa',
            marginBottom: '8px'
          }}>
            <div style={{ marginBottom: '4px', color: '#666' }}>Loaded:</div>
            <div style={{ color: '#22c55e', fontWeight: '500' }}>
              {sfzPath.split('/').pop()?.replace('.sfz', '') || sfzPath}
            </div>
          </div>
          <button
            onClick={() => {
              useProjectStore.getState().updatePlugin(trackId, plugin.id, {
                sfzContent: '',
                sfzPath: '',
              })
              setShowBuiltIns(true)
            }}
            style={{
              width: '100%',
              padding: '6px',
              background: '#dc2626',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Unload Instrument
          </button>
        </>
      )}
    </div>
  )
}
