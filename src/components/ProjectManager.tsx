/**
 * FS-AUDIO — Project Manager Panel
 * Provides save, load, export JSON, import JSON, autosave status, and project browser.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useProjectStore } from '../store/projectStore'

interface ProjectManagerProps {
  onClose: () => void
  showToast?: (msg: string, kind?: 'info' | 'ok' | 'warn' | 'error') => void
}

export function ProjectManager({ onClose, showToast }: ProjectManagerProps) {
  const store = useProjectStore()
  const [tab, setTab] = useState<'save' | 'load' | 'recent'>('save')
  const [projectName, setProjectName] = useState(store.name || 'Untitled Project')
  const [savedNames, setSavedNames] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Load saved project names
  const refreshNames = useCallback(() => {
    setSavedNames(store.getSavedProjectNames())
  }, [store])

  useEffect(() => {
    refreshNames()
  }, [refreshNames])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleSave = useCallback(() => {
    if (!projectName.trim()) return
    // Update project name in store, then save
    store.updateTrack // touch store
    const snapshot = (store as any)._buildSnapshot()
    const key = `fs-audio-project-${projectName.trim()}`
    try {
      localStorage.setItem(key, JSON.stringify({ ...snapshot, name: projectName.trim() }))
      localStorage.setItem('fs-audio-last-project', key)
      localStorage.setItem('fs-audio-autosave-time', Date.now().toString())
      // Also update isDirty
      useProjectStore.setState({ name: projectName.trim(), isDirty: false })
      showToast?.(`Saved "${projectName.trim()}"`, 'ok')
      refreshNames()
    } catch (err) {
      showToast?.('Save failed — storage may be full', 'error')
    }
  }, [projectName, store, showToast, refreshNames])

  const handleExportJSON = useCallback(() => {
    store.exportProjectJSON()
    showToast?.('Project exported as .fsap file', 'ok')
    onClose()
  }, [store, showToast, onClose])

  const handleImportJSON = useCallback(() => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = '.fsap,.json'
    inp.onchange = async () => {
      if (inp.files?.[0]) {
        await store.importProjectJSON(inp.files[0])
        showToast?.(`Imported "${inp.files[0].name}"`, 'ok')
        onClose()
      }
    }
    inp.click()
  }, [store, showToast, onClose])

  const handleLoad = useCallback((name: string) => {
    store.loadProjectByName(name)
    showToast?.(`Loaded "${name}"`, 'ok')
    onClose()
  }, [store, showToast, onClose])

  const handleDelete = useCallback((name: string) => {
    store.deleteProjectByName(name)
    refreshNames()
    setConfirmDelete(null)
    showToast?.(`Deleted "${name}"`, 'warn')
  }, [store, refreshNames, showToast])

  const lastAutosaveTime = localStorage.getItem('fs-audio-autosave-time')
  const lastAutosaveStr = lastAutosaveTime
    ? new Date(parseInt(lastAutosaveTime)).toLocaleTimeString()
    : 'Never'

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 50,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 420,
        maxHeight: '80vh',
        background: 'linear-gradient(160deg, #0e0e1a 0%, #111124 100%)',
        border: '1px solid rgba(168,85,247,0.3)',
        borderRadius: 10,
        boxShadow: '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(168,85,247,0.08)',
        zIndex: 3000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: 'linear-gradient(135deg, rgba(168,85,247,0.2) 0%, rgba(99,102,241,0.15) 100%)',
        borderBottom: '1px solid rgba(168,85,247,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>💾</span>
          <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.8px', color: '#c084fc' }}>PROJECT MANAGER</span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >×</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
        {(['save','load','recent'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '7px 0', background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid #a855f7' : '2px solid transparent',
              color: tab === t ? '#a855f7' : '#6b7280',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.6px',
              cursor: 'pointer', textTransform: 'uppercase', transition: 'color 0.15s',
            }}
          >
            {t === 'save' ? '💾 Save' : t === 'load' ? '📂 Load' : '🕐 Recent'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
        {tab === 'save' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'block', marginBottom: 5 }}>Project Name</label>
              <input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="My Project"
                style={{
                  width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(168,85,247,0.25)', borderRadius: 6, color: '#e2e8f0',
                  fontSize: 13, fontWeight: 600, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSave}
                style={{
                  flex: 1, padding: '9px 0', background: 'rgba(168,85,247,0.2)',
                  border: '1px solid rgba(168,85,247,0.4)', borderRadius: 6,
                  color: '#c084fc', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.4px', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.35)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.2)' }}
              >💾 SAVE TO BROWSER</button>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleExportJSON}
                style={{
                  flex: 1, padding: '8px 0', background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6,
                  color: '#10b981', fontSize: 10, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.4px',
                }}
              >📤 EXPORT .FSAP FILE</button>
              <button
                onClick={handleImportJSON}
                style={{
                  flex: 1, padding: '8px 0', background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6,
                  color: '#60a5fa', fontSize: 10, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.4px',
                }}
              >📥 IMPORT .FSAP FILE</button>
            </div>

            <div style={{ fontSize: 10, color: '#374151', textAlign: 'center', paddingTop: 4 }}>
              Last autosave: <span style={{ color: '#6b7280' }}>{lastAutosaveStr}</span>
            </div>
          </div>
        )}

        {tab === 'load' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <button
                onClick={handleImportJSON}
                style={{
                  flex: 1, padding: '8px 0', background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6,
                  color: '#60a5fa', fontSize: 10, fontWeight: 800, cursor: 'pointer',
                }}
              >📥 OPEN FROM FILE (.FSAP)</button>
            </div>

            {savedNames.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#374151', fontSize: 11 }}>
                No saved projects found.<br />
                <span style={{ color: '#4b5563', fontSize: 10 }}>Save a project first using the Save tab.</span>
              </div>
            ) : (
              savedNames.map(name => (
                <div
                  key={name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 12px', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,0.2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)' }}
                  onClick={() => handleLoad(name)}
                >
                  <span style={{ fontSize: 14 }}>🎵</span>
                  <span style={{ flex: 1, fontSize: 12, color: '#d1d5db', fontWeight: 600 }}>{name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(name) }}
                    style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 12, cursor: 'pointer', padding: '2px 4px', borderRadius: 3 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4b5563' }}
                    title="Delete saved project"
                  >🗑</button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'recent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700, marginBottom: 4 }}>
              Browser-Saved Projects
            </div>
            {savedNames.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#374151', fontSize: 11 }}>
                No recent projects.
              </div>
            ) : (
              savedNames.map(name => (
                <div
                  key={name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 12px', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,0.2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)' }}
                  onClick={() => handleLoad(name)}
                >
                  <span style={{ fontSize: 14 }}>🎵</span>
                  <span style={{ flex: 1, fontSize: 12, color: '#d1d5db', fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: 9, color: '#4b5563' }}>OPEN →</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 10,
        }}>
          <div style={{
            background: '#111124', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 8, padding: 20, maxWidth: 280, textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 6, fontWeight: 600 }}>Delete Project?</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>"{confirmDelete}" will be permanently deleted.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleDelete(confirmDelete)}
                style={{ flex: 1, padding: '7px 0', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5, color: '#f87171', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >DELETE</button>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#9ca3af', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
