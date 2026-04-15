/**
 * FS-AUDIO Live Loops — Ableton Session View
 * Grid-based clip launcher: rows = tracks, columns = scenes.
 * Click a clip to launch it (it queues at next beat), click a scene to launch all.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useProjectStore, Clip, Track } from '../store/projectStore'

interface LaunchClip {
  trackId: string
  trackName: string
  trackColor: string
  sceneIdx: number
  clip: Clip | null  // null = empty slot
  isPlaying: boolean
  isQueued: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onPlayClip: (trackId: string, clip: Clip, fromBeat?: number) => void
  onStopClip: (trackId: string) => void
}

// Generate a grid from timeline clips: scenes correspond to clip groups
function buildGrid(tracks: Track[]): { grid: LaunchClip[][]; sceneCount: number } {
  const nonMaster = tracks.filter(t => t.type !== 'master')
  // Scenes = distinct clip "rows" by startBeat position
  // For session view we create a grid where each column = scene, rows = tracks
  // Collect all startBeat positions as scene boundaries
  const sceneBeatStarts = new Set<number>([0])
  nonMaster.forEach(track => {
    track.clips.forEach(clip => sceneBeatStarts.add(Math.floor(clip.startBeat / 4) * 4))
  })
  const scenes = Array.from(sceneBeatStarts).sort((a,b) => a-b)
  const sceneCount = Math.max(8, scenes.length + 2)

  // Extend scenes array
  while (scenes.length < sceneCount) {
    const last = scenes[scenes.length-1]
    scenes.push(last + 4)  // each scene = 1 bar (4 beats)
  }

  const grid: LaunchClip[][] = nonMaster.map(track => {
    return scenes.map((sceneBeat, si) => {
      // Find a clip near this scene beat
      const clip = track.clips.find(c =>
        c.startBeat >= sceneBeat && c.startBeat < sceneBeat + 4
      ) || null
      return {
        trackId: track.id,
        trackName: track.name,
        trackColor: track.color,
        sceneIdx: si,
        clip,
        isPlaying: false,
        isQueued: false,
      }
    })
  })

  return { grid, sceneCount }
}

const SCENE_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
  '#14b8a6','#84cc16','#fb923c','#a78bfa',
]

function ClipCell({ cell, onLaunch, onStop }: {
  cell: LaunchClip
  onLaunch: (cell: LaunchClip) => void
  onStop: (trackId: string) => void
}) {
  const color = cell.clip?.color || cell.trackColor
  const isEmpty = !cell.clip

  return (
    <div
      onClick={() => {
        if (isEmpty) return
        if (cell.isPlaying) onStop(cell.trackId)
        else onLaunch(cell)
      }}
      style={{
        width: 100, height: 64, borderRadius: 6, cursor: isEmpty ? 'default' : 'pointer',
        border: `1px solid ${cell.isPlaying ? color : cell.isQueued ? '#fff' : isEmpty ? '#1a1a1a' : '#2a2a2a'}`,
        background: isEmpty ? '#0a0a0a'
          : cell.isPlaying ? color + '33'
          : cell.isQueued ? '#ffffff22'
          : '#111',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, transition: 'all 0.1s', position: 'relative',
        boxShadow: cell.isPlaying ? `0 0 10px ${color}44` : 'none',
      }}
      title={cell.clip ? `${cell.clip.name} (${cell.clip.type})` : 'Empty slot'}
    >
      {isEmpty ? (
        <div style={{ color:'#222', fontSize:18 }}>+</div>
      ) : (
        <>
          {/* Play/stop indicator */}
          <div style={{ fontSize: cell.isPlaying ? 14 : 12, color: cell.isPlaying ? color : '#666' }}>
            {cell.isPlaying ? '⏹' : cell.isQueued ? '⏳' : '▶'}
          </div>
          {/* Clip name */}
          <div style={{
            fontSize: 9, color: cell.isPlaying ? '#fff' : '#888',
            textAlign: 'center', padding: '0 4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 90,
          }}>
            {cell.clip.name}
          </div>
          {/* Type badge */}
          <div style={{
            fontSize: 7, padding: '1px 4px', borderRadius: 3,
            background: cell.clip.type === 'midi' ? '#001a33' : '#1a1a00',
            color: cell.clip.type === 'midi' ? '#22d3ee' : '#eab308',
          }}>
            {cell.clip.type.toUpperCase()}
          </div>
          {/* Playing progress bar */}
          {cell.isPlaying && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
              background: color, borderRadius: '0 0 5px 5px',
              animation: 'pulse-bar 2s linear infinite',
            }} />
          )}
        </>
      )}
    </div>
  )
}

export default function LiveLoops({ isOpen, onClose, onPlayClip, onStopClip }: Props) {
  const store = useProjectStore()
  const [playingCells, setPlayingCells] = useState<Set<string>>(new Set())  // "trackId-sceneIdx"
  const [queuedCells, setQueuedCells] = useState<Set<string>>(new Set())
  const [bpm, setBpm] = useState(store.bpm)
  const beatTimerRef = useRef<number | null>(null)
  const queueRef = useRef<LaunchClip[]>([])

  const { grid, sceneCount } = buildGrid(store.tracks)
  const nonMaster = store.tracks.filter(t => t.type !== 'master')
  const scenes = Array.from({ length: sceneCount }, (_, i) => i)

  // Process queued clips on next beat
  useEffect(() => {
    const bpmNow = store.bpm
    const beatMs = 60000 / bpmNow
    const timer = window.setInterval(() => {
      if (queueRef.current.length === 0) return
      const toPlay = [...queueRef.current]
      queueRef.current = []
      toPlay.forEach(cell => {
        if (!cell.clip) return
        const key = `${cell.trackId}-${cell.sceneIdx}`
        setPlayingCells(prev => {
          const next = new Set(prev)
          // Stop any playing clip on this track
          prev.forEach(k => {
            if (k.startsWith(cell.trackId + '-')) next.delete(k)
          })
          next.add(key)
          return next
        })
        setQueuedCells(prev => { const n = new Set(prev); n.delete(key); return n })
        onPlayClip(cell.trackId, cell.clip!, 0)
      })
    }, beatMs)
    return () => clearInterval(timer)
  }, [store.bpm, onPlayClip])

  const handleLaunch = useCallback((cell: LaunchClip) => {
    const key = `${cell.trackId}-${cell.sceneIdx}`
    setQueuedCells(prev => { const n = new Set(prev); n.add(key); return n })
    queueRef.current.push(cell)
  }, [])

  const handleStop = useCallback((trackId: string) => {
    setPlayingCells(prev => {
      const n = new Set(prev)
      prev.forEach(k => { if (k.startsWith(trackId + '-')) n.delete(k) })
      return n
    })
    onStopClip(trackId)
  }, [onStopClip])

  const handleLaunchScene = useCallback((sceneIdx: number) => {
    grid.forEach(row => {
      const cell = row[sceneIdx]
      if (cell && cell.clip) handleLaunch(cell)
    })
  }, [grid, handleLaunch])

  const handleStopAll = useCallback(() => {
    setPlayingCells(new Set())
    setQueuedCells(new Set())
    queueRef.current = []
    nonMaster.forEach(t => onStopClip(t.id))
  }, [nonMaster, onStopClip])

  if (!isOpen) return null

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:2600,
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => { if (e.target===e.currentTarget) onClose() }}>
      <div style={{
        background:'#0a0a0f', border:'1px solid #2a2a3e', borderRadius:14,
        maxWidth:'90vw', maxHeight:'85vh', display:'flex', flexDirection:'column',
        fontFamily:'system-ui,sans-serif', color:'#fff',
        boxShadow:'0 24px 80px rgba(0,0,0,0.9)',
        overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 18px', borderBottom:'1px solid #1e1e2e', flexShrink:0,
          background:'linear-gradient(135deg,#001a00,#0a0a0f)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>🟢</span>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>Live Loops</div>
              <div style={{ color:'#888', fontSize:10 }}>Session View — quantized clip launching</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'#111', borderRadius:6, padding:'4px 10px' }}>
              <span style={{ color:'#888', fontSize:10 }}>BPM</span>
              <input type="number" min={40} max={300} value={bpm}
                onChange={e => { const v = Number(e.target.value); setBpm(v); store.setBpm(v) }}
                style={{ width:40, background:'none', border:'none', color:'#22c55e', fontWeight:700, fontSize:13, textAlign:'center' }} />
            </div>
            <button onClick={handleStopAll} style={{
              padding:'5px 12px', borderRadius:6, border:'1px solid #ef444444',
              background:'#1a0000', color:'#ef4444', cursor:'pointer', fontSize:11, fontWeight:700,
            }}>⏹ Stop All</button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:18 }}>✕</button>
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
          <div style={{ display:'flex', minWidth:'max-content' }}>
            {/* Track labels column */}
            <div style={{ display:'flex', flexDirection:'column', flexShrink:0 }}>
              {/* Top-left corner: scene launch header */}
              <div style={{ height:30, width:120, borderBottom:'1px solid #1a1a1a', borderRight:'1px solid #1a1a1a',
                display:'flex', alignItems:'center', paddingLeft:10, color:'#444', fontSize:9 }}>
                TRACK / SCENE
              </div>
              {nonMaster.map(track => (
                <div key={track.id} style={{
                  height:76, width:120, borderBottom:'1px solid #111', borderRight:'1px solid #1a1a1a',
                  display:'flex', alignItems:'center', padding:'0 10px', gap:8, background:'#0d0d14',
                }}>
                  <div style={{
                    width:6, height:6, borderRadius:3,
                    background: track.color || '#666', flexShrink:0,
                  }} />
                  <div style={{ overflow:'hidden' }}>
                    <div style={{ color:'#ccc', fontSize:10, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {track.name}
                    </div>
                    <div style={{ color:'#555', fontSize:8 }}>{track.type}</div>
                  </div>
                </div>
              ))}
              {/* Stop all track row */}
              <div style={{ height:36, width:120, borderTop:'1px solid #1a1a1a', borderRight:'1px solid #1a1a1a',
                display:'flex', alignItems:'center', paddingLeft:10, background:'#0a0a0a' }}>
                <button onClick={handleStopAll} style={{
                  fontSize:9, padding:'2px 8px', borderRadius:4, border:'1px solid #333',
                  background:'none', color:'#666', cursor:'pointer',
                }}>⏹ Stop All</button>
              </div>
            </div>

            {/* Scene columns */}
            <div style={{ display:'flex', overflowX:'auto' }}>
              {scenes.map(sceneIdx => (
                <div key={sceneIdx} style={{ display:'flex', flexDirection:'column', flexShrink:0 }}>
                  {/* Scene header / launch button */}
                  <div style={{
                    height:30, width:110, borderBottom:'1px solid #1a1a1a', borderRight:'1px solid #111',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <button onClick={() => handleLaunchScene(sceneIdx)} style={{
                      width:20, height:20, borderRadius:4, border:'none',
                      background: SCENE_COLORS[sceneIdx % SCENE_COLORS.length] + '33',
                      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:8, color: SCENE_COLORS[sceneIdx % SCENE_COLORS.length],
                    }} title={`Launch Scene ${sceneIdx+1}`}>▶</button>
                    <span style={{ color:'#444', fontSize:8, marginLeft:4 }}>{sceneIdx+1}</span>
                  </div>

                  {/* Clip cells */}
                  {grid.map((row, trackIdx) => {
                    const cell = row[sceneIdx]
                    const key = `${cell.trackId}-${sceneIdx}`
                    return (
                      <div key={trackIdx} style={{
                        height:76, width:110, borderBottom:'1px solid #0d0d0d', borderRight:'1px solid #111',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        background: sceneIdx % 2 === 0 ? '#0a0a0f' : '#080810',
                      }}>
                        <ClipCell
                          cell={{ ...cell, isPlaying: playingCells.has(key), isQueued: queuedCells.has(key) }}
                          onLaunch={handleLaunch}
                          onStop={handleStop}
                        />
                      </div>
                    )
                  })}

                  {/* Scene stop row */}
                  <div style={{
                    height:36, width:110, borderTop:'1px solid #1a1a1a', borderRight:'1px solid #111',
                    display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0a0a',
                  }}>
                    <button onClick={() => {
                      grid.forEach(row => handleStop(row[sceneIdx].trackId))
                    }} style={{
                      fontSize:9, padding:'2px 8px', borderRadius:4, border:`1px solid ${SCENE_COLORS[sceneIdx%SCENE_COLORS.length]}44`,
                      background:'none', color:SCENE_COLORS[sceneIdx%SCENE_COLORS.length], cursor:'pointer',
                    }}>⏹</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer status */}
        <div style={{
          padding:'6px 18px', borderTop:'1px solid #111', flexShrink:0,
          display:'flex', gap:12, alignItems:'center', background:'#080810',
        }}>
          <div style={{ color:'#555', fontSize:9 }}>
            {playingCells.size > 0
              ? `${playingCells.size} clip${playingCells.size!==1?'s':''} playing`
              : 'No clips playing'}
          </div>
          {queuedCells.size > 0 && (
            <div style={{ color:'#eab308', fontSize:9 }}>
              ⏳ {queuedCells.size} queued (next beat)
            </div>
          )}
          <div style={{ color:'#333', fontSize:9, marginLeft:'auto' }}>
            Click ▶ to launch · Click scene number to launch all tracks · Double-click to queue
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-bar {
          0% { opacity:1 }
          50% { opacity:0.5 }
          100% { opacity:1 }
        }
      `}</style>
    </div>
  )
}
