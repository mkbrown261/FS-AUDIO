import React, { useState, useEffect, useRef } from 'react'
import { Plugin, useProjectStore } from '../../store/projectStore'
import { loadSFZFile, loadSFZSamples, extractSamplePaths } from '../../utils/sfzLoader'
import { BUILTIN_INSTRUMENTS, BuiltInInstrument } from '../../data/builtinInstruments'
import { DownloadProgress } from '../../audio/SampleCacheManager'

interface SFZSamplerUIProps {
  trackId: string
  plugin: Plugin
  onParamChange: (pluginId: string, paramKey: string, value: number | string) => void
}

const CATEGORY_ICONS: Record<string, string> = {
  piano: '🎹',
  drums: '🥁',
  bass:  '🎸',
  guitar:'🎸',
  synth: '🎛',
  other: '🎵',
}

// Group instruments by category
const GROUPED = BUILTIN_INSTRUMENTS.reduce((acc, inst) => {
  if (!acc[inst.category]) acc[inst.category] = []
  acc[inst.category].push(inst)
  return acc
}, {} as Record<string, BuiltInInstrument[]>)

const CATEGORY_ORDER = ['piano', 'drums', 'bass', 'guitar', 'synth', 'other']

export function SFZSamplerUI({ trackId, plugin, onParamChange }: SFZSamplerUIProps) {
  const [view, setView] = useState<'list' | 'custom'>('list')

  // Per-file download progress  { filename -> pct }
  const [progress, setProgress]   = useState<Record<string, number>>({})
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const sfzPath    = plugin.params.sfzPath    as string || ''
  const sfzLoaded  = !!plugin.params.sfzContent
  const loadedId   = plugin.params.instrumentId as string || ''

  // Subscribe to Electron progress events
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.onSampleProgress) return
    const unsub = api.onSampleProgress((p: DownloadProgress) => {
      setProgress(prev => ({ ...prev, [p.filename]: p.pct }))
    })
    return unsub
  }, [])

  const handleLoadBuiltIn = async (instrument: BuiltInInstrument) => {
    setDownloadError(null)
    try {
      // 1. Fetch the SFZ text (it's small, always served locally)
      const sfzResp = await fetch(instrument.sfzPath)
      if (!sfzResp.ok) throw new Error(`Failed to fetch SFZ: HTTP ${sfzResp.status}`)
      const sfzContent = await sfzResp.text()

      if (instrument.bundled) {
        // Bundled instruments — samples already in /public, no download needed
        useProjectStore.getState().updatePlugin(trackId, plugin.id, {
          sfzContent,
          sfzPath:       instrument.sfzPath,
          samplesBaseUrl: instrument.samplesBaseUrl,
          instrumentId:  instrument.id,
          remoteBaseUrl: '',
        })
        return
      }

      // Real instruments — store metadata; SFZSampler will download + cache samples lazily
      useProjectStore.getState().updatePlugin(trackId, plugin.id, {
        sfzContent,
        sfzPath:       instrument.sfzPath,
        samplesBaseUrl: instrument.samplesBaseUrl,
        instrumentId:  instrument.id,
        remoteBaseUrl: instrument.remoteBaseUrl || '',
      })

    } catch (err) {
      console.error('[SFZ UI] Failed to load instrument:', err)
      setDownloadError(String(err))
    }
  }

  const handleLoadCustom = async () => {
    try {
      const sfzData = await loadSFZFile()
      if (!sfzData) return
      useProjectStore.getState().updatePlugin(trackId, plugin.id, {
        sfzContent:    sfzData.content,
        sfzPath:       sfzData.path,
        samplesBaseUrl:'',
        instrumentId:  sfzData.name,
        remoteBaseUrl: '',
      })
      setView('list')
    } catch (err) {
      setDownloadError(String(err))
    }
  }

  const handleUnload = () => {
    useProjectStore.getState().updatePlugin(trackId, plugin.id, {
      sfzContent: '', sfzPath: '', samplesBaseUrl: '', instrumentId: '', remoteBaseUrl: '',
    })
    setProgress({})
    setDownloadError(null)
    setView('list')
  }

  // ── Compute overall download progress for non-bundled instruments ─────────
  const totalFiles   = Object.keys(progress).length
  const totalPct     = totalFiles > 0
    ? Math.round(Object.values(progress).reduce((s, p) => s + p, 0) / totalFiles)
    : 0
  const allDone      = totalFiles > 0 && Object.values(progress).every(p => p >= 100)

  // ─── Render ───────────────────────────────────────────────────────────────
  if (sfzLoaded) {
    const loadedInst = BUILTIN_INSTRUMENTS.find(i => i.id === loadedId)
    const isRealInst = loadedInst && !loadedInst.bundled

    return (
      <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '4px' }}>
        <div style={{ marginBottom: '10px', fontSize: '13px', color: '#aaa' }}>FS-SFZ Sampler</div>

        {/* Loaded instrument badge */}
        <div style={{
          padding: '8px 10px',
          background: '#0f2a1a',
          border: '1px solid #22c55e44',
          borderRadius: '6px',
          marginBottom: '10px',
        }}>
          <div style={{ color: '#22c55e', fontWeight: 600, fontSize: '13px' }}>
            {CATEGORY_ICONS[loadedInst?.category || 'other']} {loadedInst?.name || sfzPath.split('/').pop()?.replace('.sfz','') || 'Custom SFZ'}
          </div>
          {loadedInst?.description && (
            <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>{loadedInst.description.split('—')[0]}</div>
          )}
        </div>

        {/* Download progress bar (real instruments only) */}
        {isRealInst && (
          <div style={{ marginBottom: '10px' }}>
            {allDone ? (
              <div style={{ fontSize: '11px', color: '#22c55e' }}>✅ All samples cached locally — works offline</div>
            ) : totalFiles > 0 ? (
              <>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
                  Downloading samples… {totalPct}% ({totalFiles} files)
                </div>
                <div style={{ height: '6px', background: '#2a2a2a', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${totalPct}%`,
                    background: '#3b82f6',
                    borderRadius: '3px',
                    transition: 'width 0.2s',
                  }} />
                </div>
              </>
            ) : (
              <div style={{ fontSize: '11px', color: '#888' }}>
                ⬇ Samples will download (~{loadedInst.downloadSizeMb} MB) on first note played
              </div>
            )}
          </div>
        )}

        {downloadError && (
          <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '8px' }}>⚠ {downloadError}</div>
        )}

        <button
          onClick={handleUnload}
          style={{
            width: '100%', padding: '6px',
            background: '#7f1d1d', border: 'none', borderRadius: '4px',
            color: '#fff', fontSize: '12px', cursor: 'pointer',
          }}
        >
          Unload Instrument
        </button>
      </div>
    )
  }

  // ── Instrument browser ────────────────────────────────────────────────────
  return (
    <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '4px' }}>
      <div style={{ marginBottom: '10px', fontSize: '13px', color: '#aaa' }}>FS-SFZ Sampler</div>

      {view === 'custom' ? (
        <>
          <button
            onClick={handleLoadCustom}
            style={{
              width: '100%', padding: '10px',
              background: '#3b82f6', border: 'none', borderRadius: '4px',
              color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              marginBottom: '8px',
            }}
          >
            Browse for .sfz file…
          </button>
          <button
            onClick={() => setView('list')}
            style={{
              width: '100%', padding: '6px',
              background: 'transparent', border: '1px solid #333', borderRadius: '4px',
              color: '#888', fontSize: '12px', cursor: 'pointer',
            }}
          >
            ← Back to instruments
          </button>
        </>
      ) : (
        <>
          {/* Instrument list grouped by category */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '10px' }}>
            {CATEGORY_ORDER.filter(cat => GROUPED[cat]).map(cat => (
              <div key={cat}>
                <div style={{ fontSize: '11px', color: '#555', fontWeight: 600, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {CATEGORY_ICONS[cat]} {cat}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {GROUPED[cat].map(inst => (
                    <button
                      key={inst.id}
                      onClick={() => handleLoadBuiltIn(inst)}
                      style={{
                        padding: '8px 10px',
                        background: '#252525',
                        border: '1px solid #333',
                        borderRadius: '5px',
                        color: '#fff',
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#303030')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#252525')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500 }}>{inst.name}</span>
                        {inst.bundled
                          ? <span style={{ fontSize: '10px', color: '#22c55e', background: '#0f2a1a', padding: '1px 6px', borderRadius: '10px' }}>built-in</span>
                          : <span style={{ fontSize: '10px', color: '#f59e0b', background: '#2a1f00', padding: '1px 6px', borderRadius: '10px' }}>⬇ ~{inst.downloadSizeMb} MB</span>
                        }
                      </div>
                      <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                        {inst.description.split('—')[0].trim()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {downloadError && (
            <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '8px' }}>⚠ {downloadError}</div>
          )}

          <button
            onClick={() => setView('custom')}
            style={{
              width: '100%', padding: '7px',
              background: 'transparent', border: '1px dashed #444', borderRadius: '4px',
              color: '#666', fontSize: '12px', cursor: 'pointer',
            }}
          >
            Load your own .sfz file…
          </button>
        </>
      )}
    </div>
  )
}
