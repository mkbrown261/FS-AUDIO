import React, { useState, useEffect, useRef } from 'react'
import { Plugin, useProjectStore } from '../../store/projectStore'
import { loadSFZFile, loadSFZSamples, extractSamplePaths } from '../../utils/sfzLoader'
import { BUILTIN_INSTRUMENTS, BuiltInInstrument } from '../../data/builtinInstruments'

// Derive the base URL for sample fetching from an SFZ path
function basePath(sfzPath: string) {
  return sfzPath.substring(0, sfzPath.lastIndexOf('/'))
}

interface SFZSamplerUIProps {
  trackId: string
  plugin: Plugin
  onParamChange: (pluginId: string, paramKey: string, value: number | string) => void
}

export function SFZSamplerUI({ trackId, plugin, onParamChange }: SFZSamplerUIProps) {
  const [showBuiltIns, setShowBuiltIns] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [loadingName, setLoadingName] = useState('')

  const sfzPath = plugin.params.sfzPath as string || ''
  const sfzLoaded = !!plugin.params.sfzContent

  // Listen for progress updates broadcast by the audio engine
  useEffect(() => {
    const handler = (e: CustomEvent<{ loaded: number; total: number; instrumentName: string }>) => {
      const { loaded, total, instrumentName } = e.detail
      if (loaded >= total) {
        setLoadingProgress(null)
        setLoadingName('')
      } else {
        setLoadingProgress({ loaded, total })
        setLoadingName(instrumentName)
      }
    }
    window.addEventListener('sfz-load-progress', handler as EventListener)
    return () => window.removeEventListener('sfz-load-progress', handler as EventListener)
  }, [])

  const handleLoadBuiltIn = async (instrument: BuiltInInstrument) => {
    try {
      const response = await fetch(instrument.sfzPath)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const sfzContent = await response.text()

      useProjectStore.getState().updatePlugin(trackId, plugin.id, {
        sfzContent,
        sfzPath: instrument.sfzPath,
        samplesBaseUrl: basePath(instrument.sfzPath),
        instrumentName: instrument.name,
      })

      console.log('[SFZ] Selected built-in instrument:', instrument.name)
      setShowBuiltIns(false)
    } catch (error) {
      console.error('[SFZ] Failed to load built-in instrument:', error)
      alert('Failed to load instrument')
    }
  }

  const handleLoadClick = async () => {
    try {
      const sfzData = await loadSFZFile()
      if (!sfzData) return

      console.log('[SFZ] Loaded SFZ file:', sfzData.name)

      useProjectStore.getState().updatePlugin(trackId, plugin.id, {
        sfzContent: sfzData.content,
        sfzPath: sfzData.path,
        instrumentName: sfzData.name.replace('.sfz', ''),
      })

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

  const instrumentName = (plugin.params.instrumentName as string)
    || sfzPath.split('/').pop()?.replace('.sfz', '')
    || 'Unknown'

  const pct = loadingProgress
    ? Math.round((loadingProgress.loaded / loadingProgress.total) * 100)
    : 0

  return (
    <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '4px' }}>
      <div style={{ marginBottom: '12px' }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#fff' }}>
          FS-SFZ Sampler
        </h3>
        <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>
          Professional SFZ sample player
        </p>
      </div>

      {/* Loading progress bar */}
      {loadingProgress && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
            Loading {loadingName}… {loadingProgress.loaded}/{loadingProgress.total}
          </div>
          <div style={{ height: '4px', background: '#333', borderRadius: '2px' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: '#3b82f6',
              borderRadius: '2px',
              transition: 'width 0.15s ease'
            }} />
          </div>
        </div>
      )}

      {!sfzLoaded && showBuiltIns ? (
        <>
          <div style={{ marginBottom: '6px', fontSize: '11px', color: '#888', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Built-in Instruments
          </div>

          {/* Drums */}
          <div style={{ marginBottom: '4px', fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Drums</div>
          <div style={{ display: 'grid', gap: '4px', marginBottom: '8px' }}>
            {BUILTIN_INSTRUMENTS.filter(i => i.category === 'drums').map(instrument => (
              <InstrumentButton key={instrument.id} instrument={instrument} onLoad={handleLoadBuiltIn} />
            ))}
          </div>

          {/* Keys */}
          <div style={{ marginBottom: '4px', fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Keys</div>
          <div style={{ display: 'grid', gap: '4px', marginBottom: '8px' }}>
            {BUILTIN_INSTRUMENTS.filter(i => i.category === 'piano' || i.category === 'synth').map(instrument => (
              <InstrumentButton key={instrument.id} instrument={instrument} onLoad={handleLoadBuiltIn} />
            ))}
          </div>

          {/* Bass */}
          <div style={{ marginBottom: '4px', fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Bass</div>
          <div style={{ display: 'grid', gap: '4px', marginBottom: '8px' }}>
            {BUILTIN_INSTRUMENTS.filter(i => i.category === 'bass').map(instrument => (
              <InstrumentButton key={instrument.id} instrument={instrument} onLoad={handleLoadBuiltIn} />
            ))}
          </div>

          {/* Guitar */}
          <div style={{ marginBottom: '4px', fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Guitar</div>
          <div style={{ display: 'grid', gap: '4px', marginBottom: '10px' }}>
            {BUILTIN_INSTRUMENTS.filter(i => i.category === 'guitar').map(instrument => (
              <InstrumentButton key={instrument.id} instrument={instrument} onLoad={handleLoadBuiltIn} />
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
              color: '#666',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            Or load your own SFZ file…
          </button>
        </>
      ) : !sfzLoaded ? (
        <>
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
              fontWeight: '500',
              marginBottom: '8px'
            }}
          >
            Load SFZ File…
          </button>
          <button
            onClick={() => setShowBuiltIns(true)}
            style={{
              width: '100%',
              padding: '6px',
              background: 'transparent',
              border: '1px dashed #444',
              borderRadius: '4px',
              color: '#666',
              fontSize: '11px',
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
            background: '#0d0d0d',
            borderRadius: '4px',
            marginBottom: '8px'
          }}>
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '2px' }}>Loaded</div>
            <div style={{ fontSize: '13px', color: '#22c55e', fontWeight: '500' }}>
              {instrumentName}
            </div>
          </div>
          <button
            onClick={() => {
              useProjectStore.getState().updatePlugin(trackId, plugin.id, {
                sfzContent: '',
                sfzPath: '',
                samplesBaseUrl: '',
                instrumentName: '',
              })
              setShowBuiltIns(true)
            }}
            style={{
              width: '100%',
              padding: '6px',
              background: '#7f1d1d',
              border: 'none',
              borderRadius: '4px',
              color: '#fca5a5',
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

function InstrumentButton({
  instrument,
  onLoad,
}: {
  instrument: BuiltInInstrument
  onLoad: (i: BuiltInInstrument) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={() => onLoad(instrument)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '7px 10px',
        background: hover ? '#2d2d2d' : '#1e1e1e',
        border: `1px solid ${hover ? '#4a4a4a' : '#2a2a2a'}`,
        borderRadius: '4px',
        color: '#fff',
        fontSize: '12px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s'
      }}
    >
      <div style={{ fontWeight: '500', lineHeight: 1.2 }}>{instrument.name}</div>
      <div style={{ fontSize: '10px', color: '#666', marginTop: '1px' }}>
        {instrument.description}
      </div>
    </button>
  )
}
