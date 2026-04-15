/**
 * FS-AUDIO — Per-Plugin Preset Browser
 * Saves / loads named parameter snapshots for a single plugin instance.
 * Stored in localStorage under 'fs-audio-plugin-params-${pluginType}'.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'

export interface ParamPreset {
  id: string
  name: string
  pluginType: string
  params: Record<string, number | string>
  createdAt: number
}

const STORAGE_KEY = 'fs-audio-param-presets-v2'

function getAllPresets(): ParamPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function setAllPresets(presets: ParamPreset[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)) } catch (_) {}
}

export function saveParamPreset(pluginType: string, name: string, params: Record<string, number | string>): ParamPreset {
  const preset: ParamPreset = {
    id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Preset',
    pluginType,
    params: { ...params },
    createdAt: Date.now(),
  }
  const all = getAllPresets()
  all.push(preset)
  setAllPresets(all)
  return preset
}

export function deleteParamPreset(id: string) {
  setAllPresets(getAllPresets().filter(p => p.id !== id))
}

export function getPresetsForType(pluginType: string): ParamPreset[] {
  return getAllPresets().filter(p => p.pluginType === pluginType)
}

// ── Factory presets per plugin type ──────────────────────────────────────────
const FACTORY_PRESETS: Record<string, { name: string; params: Record<string, number | string> }[]> = {
  eq: [
    { name: 'Vocal Presence', params: { lowGain: -2, lowFreq: 100, midGain: 3, midFreq: 3000, midQ: 1.2, highGain: 2, highFreq: 10000 } },
    { name: 'Bass Boost', params: { lowGain: 4, lowFreq: 80, midGain: 0, midFreq: 1000, midQ: 1, highGain: 0, highFreq: 8000 } },
    { name: 'Air & Clarity', params: { lowGain: 0, lowFreq: 100, midGain: -1, midFreq: 500, midQ: 0.8, highGain: 4, highFreq: 12000 } },
    { name: 'Tighten Low End', params: { lowGain: -4, lowFreq: 60, midGain: 0, midFreq: 1000, midQ: 1, highGain: 0, highFreq: 8000 } },
  ],
  compressor: [
    { name: 'Vocal Glue', params: { threshold: -18, ratio: 3, attack: 10, release: 80, knee: 8, makeupGain: 4 } },
    { name: 'Drum Bus', params: { threshold: -15, ratio: 4, attack: 3, release: 50, knee: 4, makeupGain: 3 } },
    { name: 'Gentle Limiting', params: { threshold: -6, ratio: 8, attack: 1, release: 30, knee: 2, makeupGain: 1 } },
    { name: 'Pumping Sidekick', params: { threshold: -25, ratio: 10, attack: 2, release: 200, knee: 2, makeupGain: 6 } },
  ],
  reverb: [
    { name: 'Small Room', params: { wet: 0.2, size: 0.8, damping: 0.6, predelay: 0.01, irType: 'room' } },
    { name: 'Large Hall', params: { wet: 0.4, size: 3.5, damping: 0.3, predelay: 0.03, irType: 'hall' } },
    { name: 'Cathedral', params: { wet: 0.5, size: 5, damping: 0.15, predelay: 0.06, irType: 'cathedral' } },
    { name: 'Plate Sheen', params: { wet: 0.3, size: 2, damping: 0.4, predelay: 0.015, irType: 'plate' } },
  ],
  delay: [
    { name: '1/4 Note Stereo', params: { wet: 0.3, time: 0.5, feedback: 0.35, stereoSpread: 0.4 } },
    { name: 'Slapback', params: { wet: 0.25, time: 0.08, feedback: 0.05, stereoSpread: 0.1 } },
    { name: 'Tape Echo', params: { wet: 0.35, time: 0.375, feedback: 0.55, stereoSpread: 0.3 } },
    { name: 'Dotted 1/8', params: { wet: 0.28, time: 0.375, feedback: 0.4, stereoSpread: 0.5 } },
  ],
  saturation: [
    { name: 'Tape Warmth', params: { lowDrive: 0.3, midDrive: 0.2, highDrive: 0.1, lowMode: 0, midMode: 0, highMode: 0, mix: 0.6, output: 0 } },
    { name: 'Tube Crunch', params: { lowDrive: 0.5, midDrive: 0.6, highDrive: 0.3, lowMode: 1, midMode: 1, highMode: 1, mix: 0.8, output: -2 } },
    { name: 'Multiband Clip', params: { lowDrive: 0.4, midDrive: 0.7, highDrive: 0.5, lowMode: 2, midMode: 2, highMode: 2, mix: 0.7, output: -3 } },
  ],
  bus_compressor: [
    { name: 'SSL G-Bus', params: { threshold: -12, ratio: 4, attack: 0.001, release: 0.1, makeup: 2, color: 1, mix: 1.0 } },
    { name: 'Neve 33609', params: { threshold: -8, ratio: 3, attack: 0.003, release: 0.3, makeup: 1, color: 1, mix: 1.0 } },
    { name: 'Parallel Crush', params: { threshold: -20, ratio: 10, attack: 0.001, release: 0.05, makeup: 8, color: 1, mix: 0.4 } },
  ],
  limiter: [
    { name: 'Broadcast -1dB', params: { ceiling: -1, threshold: -3, release: 0.05 } },
    { name: 'Streaming -2dB', params: { ceiling: -2, threshold: -4, release: 0.08 } },
    { name: 'Loud Mix', params: { ceiling: -0.3, threshold: -1, release: 0.03 } },
  ],
  spacetime: [
    { name: 'Shimmer Pad', params: { wet: 0.5, size: 3, damping: 0.3, predelay: 0.02, shimmer: 0.6, pitch: 12 } },
    { name: 'Ping-Pong 1/4', params: { wet: 0.35, size: 2, damping: 0.5, predelay: 0.01, shimmer: 0, pitch: 0 } },
    { name: 'Dream Space', params: { wet: 0.6, size: 4.5, damping: 0.2, predelay: 0.04, shimmer: 0.8, pitch: 7 } },
  ],
  transient: [
    { name: 'Punchy Drums', params: { attack: 0.7, sustain: -0.3, gain: 0, sense: 0.5, mode: 0 } },
    { name: 'Acoustic Guitar', params: { attack: 0.4, sustain: 0.2, gain: 0, sense: 0.4, mode: 0 } },
    { name: 'Swell Pads', params: { attack: -0.5, sustain: 0.6, gain: 0, sense: 0.3, mode: 0 } },
  ],
  chorus: [
    { name: 'Classic Chorus', params: { wet: 0.5, rate: 0.8, depth: 0.003, delay: 0.015 } },
    { name: 'Thick Ensemble', params: { wet: 0.7, rate: 0.4, depth: 0.006, delay: 0.025 } },
    { name: 'Subtle Shimmer', params: { wet: 0.25, rate: 1.5, depth: 0.002, delay: 0.01 } },
  ],
}

interface PluginPresetBrowserProps {
  pluginType: string
  currentParams: Record<string, number | string>
  onLoadPreset: (params: Record<string, number | string>) => void
  color?: string
}

export function PluginPresetBrowser({ pluginType, currentParams, onLoadPreset, color = '#a855f7' }: PluginPresetBrowserProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [userPresets, setUserPresets] = useState<ParamPreset[]>([])
  const [saveName, setSaveName] = useState('')
  const [activeTab, setActiveTab] = useState<'factory' | 'user'>('factory')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const factoryPresets = FACTORY_PRESETS[pluginType] ?? []

  const refreshUserPresets = useCallback(() => {
    setUserPresets(getPresetsForType(pluginType))
  }, [pluginType])

  useEffect(() => {
    if (isOpen) refreshUserPresets()
  }, [isOpen, refreshUserPresets])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return
    saveParamPreset(pluginType, saveName, currentParams)
    setSaveName('')
    refreshUserPresets()
    setActiveTab('user')
  }, [saveName, pluginType, currentParams, refreshUserPresets])

  const handleDelete = useCallback((id: string) => {
    deleteParamPreset(id)
    refreshUserPresets()
    setConfirmDeleteId(null)
  }, [refreshUserPresets])

  const colorHex = color

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(o => !o)}
        title="Plugin Presets — Save & load parameter snapshots"
        style={{
          background: isOpen ? `${colorHex}22` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isOpen ? colorHex + '55' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 4, padding: '2px 7px',
          color: isOpen ? colorHex : '#6b7280',
          fontSize: 9, fontWeight: 800, letterSpacing: '0.5px',
          cursor: 'pointer', transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
        onMouseEnter={e => { if (!isOpen) { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' } }}
        onMouseLeave={e => { if (!isOpen) { (e.currentTarget as HTMLElement).style.color = '#6b7280'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' } }}
      >
        <span style={{ fontSize: 10 }}>≡</span> PRESETS
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            width: 240,
            maxHeight: 340,
            background: 'linear-gradient(160deg, #0c0c18 0%, #0f0f1e 100%)',
            border: `1px solid ${colorHex}33`,
            borderRadius: 8,
            boxShadow: `0 12px 36px rgba(0,0,0,0.7), 0 0 0 1px ${colorHex}10`,
            zIndex: 2000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '7px 10px', background: `${colorHex}18`,
            borderBottom: `1px solid ${colorHex}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.6px', color: colorHex }}>PRESETS</span>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 12, cursor: 'pointer', padding: '0 2px' }}
            >×</button>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
            {(['factory', 'user'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  flex: 1, padding: '5px 0', background: 'none', border: 'none',
                  borderBottom: activeTab === t ? `2px solid ${colorHex}` : '2px solid transparent',
                  color: activeTab === t ? colorHex : '#4b5563',
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.5px',
                  cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                {t === 'factory' ? '⚡ Factory' : `★ Saved (${userPresets.length})`}
              </button>
            ))}
          </div>

          {/* Preset list */}
          <div style={{ overflowY: 'auto', flex: 1, maxHeight: 200 }}>
            {activeTab === 'factory' && (
              <>
                {factoryPresets.length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 10, color: '#374151' }}>
                    No factory presets for this plugin.
                  </div>
                ) : (
                  factoryPresets.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => { onLoadPreset(p.params); setIsOpen(false) }}
                      style={{
                        width: '100%', padding: '7px 10px', background: 'none', border: 'none',
                        borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex',
                        alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${colorHex}12` }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                    >
                      <span style={{ fontSize: 9, color: colorHex, opacity: 0.6 }}>▶</span>
                      <span style={{ fontSize: 11, color: '#c4c9d4', fontWeight: 600 }}>{p.name}</span>
                    </button>
                  ))
                )}
              </>
            )}

            {activeTab === 'user' && (
              <>
                {userPresets.length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 10, color: '#374151' }}>
                    No saved presets yet.<br />
                    <span style={{ color: '#4b5563' }}>Save your settings below.</span>
                  </div>
                ) : (
                  userPresets.map(p => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${colorHex}10` }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                    >
                      <button
                        onClick={() => { onLoadPreset(p.params); setIsOpen(false) }}
                        style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <span style={{ fontSize: 9, color: colorHex, opacity: 0.6 }}>▶</span>
                        <span style={{ fontSize: 11, color: '#c4c9d4', fontWeight: 600 }}>{p.name}</span>
                      </button>
                      {confirmDeleteId === p.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => handleDelete(p.id)}
                            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 3, color: '#f87171', fontSize: 9, fontWeight: 700, cursor: 'pointer', padding: '1px 5px' }}
                          >DEL</button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: '#6b7280', fontSize: 9, cursor: 'pointer', padding: '1px 5px' }}
                          >×</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          style={{ background: 'none', border: 'none', color: '#374151', fontSize: 11, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#374151' }}
                        >🗑</button>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          {/* Save current */}
          <div style={{ padding: '8px 10px', borderTop: `1px solid rgba(255,255,255,0.05)`, background: 'rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="Name & save current…"
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`,
                  borderRadius: 4, padding: '4px 8px', color: '#d1d5db', fontSize: 10, outline: 'none',
                }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = `${colorHex}55` }}
                onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                style={{
                  background: saveName.trim() ? `${colorHex}25` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${saveName.trim() ? colorHex + '50' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 4, color: saveName.trim() ? colorHex : '#374151',
                  fontSize: 10, fontWeight: 800, cursor: saveName.trim() ? 'pointer' : 'default',
                  padding: '4px 8px', transition: 'all 0.15s',
                }}
              >SAVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
