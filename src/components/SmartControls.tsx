/**
 * FS-AUDIO Smart Controls
 * Logic Pro-style 8-macro knob panel that maps to any plugin parameter.
 * Each knob can be assigned to any parameter on any plugin on the selected track.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useProjectStore, Plugin } from '../store/projectStore'

interface MacroMapping {
  trackId: string
  pluginId: string
  paramKey: string
  paramMin: number
  paramMax: number
  label: string
}

interface Macro {
  id: number
  name: string
  value: number        // 0-1 normalized
  color: string
  mapping: MacroMapping | null
}

const MACRO_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
]

function makeMacro(id: number): Macro {
  return {
    id, name: `Macro ${id+1}`, value: 0.5, color: MACRO_COLORS[id],
    mapping: null,
  }
}

// Known parameter ranges for common plugin types
const PARAM_RANGES: Record<string, Record<string, [number,number]>> = {
  eq:          { low: [20,500], mid: [200,8000], high: [2000,20000], lowGain:[-12,12], midGain:[-12,12], highGain:[-12,12] },
  compressor:  { threshold:[-60,0], ratio:[1,20], attack:[0.001,0.3], release:[0.01,2], makeupGain:[0,24] },
  reverb:      { wet:[0,1], decay:[0.1,10], predelay:[0,0.1] },
  delay:       { wet:[0,1], time:[0.01,2], feedback:[0,0.95] },
  saturation:  { lowDrive:[0,10], midDrive:[0,10], highDrive:[0,10], mix:[0,1] },
  bus_compressor: { threshold:[-40,0], ratio:[1,20], attack:[0.0001,0.3], release:[0.01,1] },
  fs_proq:     { band1Freq:[20,500], band2Freq:[200,8000], band3Freq:[2000,20000], band4Freq:[4000,20000] },
  fs_granular: { grainSize:[10,500], density:[1,100], pitch:[-24,24], mix:[0,1] },
  fs_wavetable:{ filterCutoff:[20,20000], filterReso:[0,20], positionA:[0,1], positionB:[0,1] },
  fs_fm:       { op1Ratio:[0.5,8], op2Ratio:[0.5,8], modIndex:[0,20], feedback:[0,1] },
}

// Get all exposed params for a plugin
function getPluginParams(plugin: Plugin): Array<{ key: string; label: string; min: number; max: number }> {
  const ranges = PARAM_RANGES[plugin.type] || {}
  const params: Array<{ key: string; label: string; min: number; max: number }> = []
  // From known ranges
  Object.entries(ranges).forEach(([key, [min,max]]) => {
    params.push({ key, label: key, min, max })
  })
  // From actual plugin params (infer range)
  Object.entries(plugin.params).forEach(([key, val]) => {
    if (!params.find(p => p.key === key)) {
      const num = Number(val)
      if (!isNaN(num)) {
        params.push({ key, label: key, min: 0, max: num > 1 ? (num > 100 ? 20000 : 10) : 1 })
      }
    }
  })
  return params
}

// Macro knob with drag
function MacroKnob({
  macro, onValueChange, onEdit,
}: {
  macro: Macro
  onValueChange: (id: number, v: number) => void
  onEdit: (id: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)
  const startV = useRef(macro.value)

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    startY.current = e.clientY
    startV.current = macro.value
    e.preventDefault()
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const dy = startY.current - e.clientY
      onValueChange(macro.id, Math.max(0, Math.min(1, startV.current + dy / 100)))
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, macro.id, onValueChange])

  const angle = -135 + macro.value * 270
  const r = 26
  const cx = 32, cy = 32
  const circumference = 2 * Math.PI * r
  // Track arc covers 270° (0.75 of circumference), value arc is proportion of that
  const trackArc = circumference * 0.75
  const dashLen = trackArc * macro.value
  const dashOffset = circumference * 0.375

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, width:72 }}>
      <div
        style={{ cursor:'ns-resize', userSelect:'none', position:'relative' }}
        onMouseDown={onMouseDown}
        onDoubleClick={() => onEdit(macro.id)}
      >
        <svg width={64} height={64}>
          <circle cx={cx} cy={cy} r={r} fill="#0d0d1a" stroke="#222" strokeWidth={2} />
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a2e"
            strokeWidth={6} strokeDasharray={`${circumference*0.75} ${circumference*0.25}`}
            strokeDashoffset={dashOffset} strokeLinecap="round" />
          {/* Value arc */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={macro.color}
            strokeWidth={6} strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={dashOffset} strokeLinecap="round"
            style={{ filter:`drop-shadow(0 0 4px ${macro.color}88)` }} />
          {/* Pointer */}
          <line
            x1={cx} y1={cy}
            x2={cx + 18 * Math.cos((angle-90)*Math.PI/180)}
            y2={cy + 18 * Math.sin((angle-90)*Math.PI/180)}
            stroke="#fff" strokeWidth={2} strokeLinecap="round" />
          {/* Center dot */}
          <circle cx={cx} cy={cy} r={3} fill={macro.color} />
        </svg>
        {macro.mapping && (
          <div style={{
            position:'absolute', top:0, right:0,
            width:8, height:8, borderRadius:4,
            background: macro.color,
            border:'1px solid #000',
          }} title={`Mapped to: ${macro.mapping.label}`} />
        )}
      </div>
      <div style={{ color:'#ccc', fontSize:9, fontWeight:600, textTransform:'uppercase',
        letterSpacing:0.5, textAlign:'center', width:'100%', overflow:'hidden',
        textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {macro.name}
      </div>
      <div style={{ color:'#666', fontSize:9, textAlign:'center' }}>
        {Math.round(macro.value * 100)}%
      </div>
      {macro.mapping && (
        <div style={{ color:'#444', fontSize:8, textAlign:'center', lineHeight:1.2,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%' }}>
          {macro.mapping.label}
        </div>
      )}
    </div>
  )
}

// Mapping editor modal
function MappingEditor({ macro, onSave, onClose }: {
  macro: Macro
  onSave: (m: MacroMapping) => void
  onClose: () => void
}) {
  const store = useProjectStore()
  const [trackId, setTrackId] = useState(macro.mapping?.trackId || '')
  const [pluginId, setPluginId] = useState(macro.mapping?.pluginId || '')
  const [paramKey, setParamKey] = useState(macro.mapping?.paramKey || '')
  const [label, setLabel] = useState(macro.mapping?.label || '')

  const track = store.tracks.find(t => t.id === trackId)
  const plugin = track?.plugins.find(p => p.id === pluginId)
  const params = plugin ? getPluginParams(plugin) : []
  const selectedParam = params.find(p => p.key === paramKey)

  const canSave = trackId && pluginId && paramKey

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2500,
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{
        background:'#111', border:'1px solid #333', borderRadius:12,
        padding:20, width:380, fontFamily:'system-ui,sans-serif', color:'#fff',
        boxShadow:'0 16px 60px rgba(0,0,0,0.9)',
      }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color: macro.color }}>
          ✎ Assign: {macro.name}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={{ color:'#888', fontSize:10, display:'block', marginBottom:4 }}>TRACK</label>
            <select value={trackId} onChange={e => { setTrackId(e.target.value); setPluginId(''); setParamKey('') }} style={{
              width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #333',
              background:'#0d0d1a', color:'#fff', fontSize:11,
            }}>
              <option value="">— Select track —</option>
              {store.tracks.filter(t => t.type !== 'master').map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {track && (
            <div>
              <label style={{ color:'#888', fontSize:10, display:'block', marginBottom:4 }}>PLUGIN</label>
              <select value={pluginId} onChange={e => { setPluginId(e.target.value); setParamKey('') }} style={{
                width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #333',
                background:'#0d0d1a', color:'#fff', fontSize:11,
              }}>
                <option value="">— Select plugin —</option>
                {track.plugins.filter(p => p.enabled).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>
          )}

          {plugin && (
            <div>
              <label style={{ color:'#888', fontSize:10, display:'block', marginBottom:4 }}>PARAMETER</label>
              <select value={paramKey} onChange={e => {
                setParamKey(e.target.value)
                const p = params.find(pp => pp.key === e.target.value)
                if (p) setLabel(p.label)
              }} style={{
                width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #333',
                background:'#0d0d1a', color:'#fff', fontSize:11,
              }}>
                <option value="">— Select parameter —</option>
                {params.map(p => (
                  <option key={p.key} value={p.key}>{p.key} ({p.min}–{p.max})</option>
                ))}
              </select>
            </div>
          )}

          {selectedParam && (
            <div>
              <label style={{ color:'#888', fontSize:10, display:'block', marginBottom:4 }}>DISPLAY LABEL</label>
              <input value={label} onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Filter Cutoff"
                style={{
                  width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #333',
                  background:'#0d0d1a', color:'#fff', fontSize:11, boxSizing:'border-box',
                }} />
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:6 }}>
            <button onClick={onClose} style={{
              flex:1, padding:'8px 0', borderRadius:6, border:'1px solid #333',
              background:'#111', color:'#888', cursor:'pointer', fontSize:12,
            }}>Cancel</button>
            <button onClick={() => {
              if (!canSave || !selectedParam) return
              onSave({
                trackId, pluginId, paramKey,
                paramMin: selectedParam.min, paramMax: selectedParam.max,
                label: label || paramKey,
              })
            }} disabled={!canSave} style={{
              flex:1, padding:'8px 0', borderRadius:6, border:'none',
              background: canSave ? macro.color : '#222',
              color: canSave ? '#fff' : '#555',
              cursor: canSave ? 'pointer' : 'default', fontSize:12, fontWeight:700,
            }}>Assign</button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SmartControlsProps {
  isOpen: boolean
  onClose: () => void
  onUpdatePlugin: (trackId: string, pluginId: string, params: Record<string,number|string>) => void
}

export default function SmartControls({ isOpen, onClose, onUpdatePlugin }: SmartControlsProps) {
  const [macros, setMacros] = useState<Macro[]>(() => Array.from({ length:8 }, (_, i) => makeMacro(i)))
  const [editingMacroId, setEditingMacroId] = useState<number | null>(null)

  const handleValueChange = useCallback((id: number, v: number) => {
    setMacros(prev => {
      const next = prev.map(m => m.id === id ? { ...m, value: v } : m)
      // Apply mapping
      const macro = next.find(m => m.id === id)
      if (macro?.mapping) {
        const { trackId, pluginId, paramKey, paramMin, paramMax } = macro.mapping
        const mapped = paramMin + v * (paramMax - paramMin)
        onUpdatePlugin(trackId, pluginId, { [paramKey]: mapped })
      }
      return next
    })
  }, [onUpdatePlugin])

  const handleSaveMapping = useCallback((macroId: number, mapping: MacroMapping) => {
    setMacros(prev => prev.map(m => m.id === macroId ? { ...m, mapping } : m))
    setEditingMacroId(null)
  }, [])

  const handleClearMapping = useCallback((id: number) => {
    setMacros(prev => prev.map(m => m.id === id ? { ...m, mapping: null } : m))
  }, [])

  const handleRename = useCallback((id: number) => {
    const macro = macros.find(m => m.id === id)
    if (!macro) return
    const name = prompt('Macro name:', macro.name)
    if (name) setMacros(prev => prev.map(m => m.id === id ? { ...m, name } : m))
  }, [macros])

  if (!isOpen) return null

  const editingMacro = editingMacroId !== null ? macros.find(m => m.id === editingMacroId) : null

  return (
    <>
      <div style={{
        position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)',
        background:'#0d0d1a', border:'1px solid #2a2a3e', borderRadius:'14px 14px 0 0',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.8)',
        fontFamily:'system-ui,sans-serif', zIndex:1800, minWidth:620,
      }}>
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px', borderBottom:'1px solid #1e1e2e',
          background:'linear-gradient(135deg,#0a001a,#0d0d1a)',
          borderRadius:'14px 14px 0 0',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>🎛</span>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:'#fff' }}>Smart Controls</div>
              <div style={{ color:'#666', fontSize:9 }}>Double-click knob to assign · Drag to control</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        {/* Macros */}
        <div style={{ display:'flex', justifyContent:'space-around', padding:'16px 12px', gap:4 }}>
          {macros.map(macro => (
            <div key={macro.id} style={{ position:'relative' }}
              onContextMenu={e => {
                e.preventDefault()
                const action = window.confirm(`Clear mapping for "${macro.name}"?`)
                if (action) handleClearMapping(macro.id)
              }}>
              <MacroKnob
                macro={macro}
                onValueChange={handleValueChange}
                onEdit={id => setEditingMacroId(id)}
              />
            </div>
          ))}
        </div>

        {/* Mapping summary */}
        <div style={{
          padding:'6px 16px 10px', display:'flex', gap:4, flexWrap:'wrap',
        }}>
          {macros.filter(m => m.mapping).map(m => (
            <div key={m.id} style={{
              fontSize:8, padding:'2px 6px', borderRadius:10,
              background: m.color + '22', border:`1px solid ${m.color}44`,
              color: m.color, display:'flex', gap:4, alignItems:'center',
            }}>
              {m.name}: {m.mapping!.label}
              <button onClick={() => handleClearMapping(m.id)} style={{
                background:'none', border:'none', color:m.color, cursor:'pointer', fontSize:9, padding:0,
              }}>✕</button>
            </div>
          ))}
          {macros.every(m => !m.mapping) && (
            <div style={{ color:'#333', fontSize:9 }}>
              Double-click any knob to assign it to a plugin parameter
            </div>
          )}
        </div>
      </div>

      {editingMacro && (
        <MappingEditor
          macro={editingMacro}
          onSave={m => handleSaveMapping(editingMacro.id, m)}
          onClose={() => setEditingMacroId(null)}
        />
      )}
    </>
  )
}
