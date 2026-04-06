import React, { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'

export function StatusBar() {
  const { bpm, sampleRate, bitDepth, bufferSize, isPlaying, isRecording, name, isDirty, setSampleRate, setBitDepth } = useProjectStore()
  const [cpu, setCpu] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      // Rough CPU estimate: how far from ideal 16.67ms frame
      const load = Math.min(100, Math.max(0, ((dt - 16.67) / 16.67) * 100 + (isPlaying ? 12 : 2)))
      setCpu(prev => prev * 0.85 + load * 0.15)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying])

  const cpuColor = cpu > 70 ? '#ef4444' : cpu > 45 ? '#f59e0b' : '#10b981'

  return (
    <div className="status-bar">
      <span className="status-project" title={name}>{isDirty ? '● ' : ''}{name}</span>
      <div className="status-divider" />
      <span className="status-label">SR</span>
      <select className="status-select" value={sampleRate} onChange={e => setSampleRate(parseInt(e.target.value) as any)} title="Sample Rate">
        <option value={44100}>44.1kHz</option>
        <option value={48000}>48kHz</option>
        <option value={88200}>88.2kHz</option>
        <option value={96000}>96kHz</option>
      </select>
      <div className="status-divider" />
      <span className="status-label">Bit</span>
      <select className="status-select" value={bitDepth} onChange={e => setBitDepth(parseInt(e.target.value) as any)} title="Bit Depth">
        <option value={16}>16-bit</option>
        <option value={24}>24-bit</option>
        <option value={32}>32-bit float</option>
      </select>
      <div className="status-divider" />
      <span className="status-label">Buffer</span>
      <span className="status-val">{bufferSize}</span>
      <div className="status-divider" />
      <span className="status-label">BPM</span>
      <span className="status-val">{bpm.toFixed(1)}</span>
      <div className="status-divider" />
      {isRecording && (
        <>
          <span style={{ color: '#ef4444', fontWeight: 800, animation: 'pulse 1s infinite' }}>● REC</span>
          <div className="status-divider" />
        </>
      )}
      {isPlaying && !isRecording && (
        <>
          <span style={{ color: '#10b981', fontWeight: 700, letterSpacing: '.04em' }}>PLAYING</span>
          <div className="status-divider" />
        </>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="status-label">CPU</span>
        <div className="cpu-bar-wrap">
          <div className="cpu-bar" style={{ width: `${Math.min(100, cpu)}%`, background: cpuColor }} />
        </div>
        <span className="status-val" style={{ color: cpuColor, minWidth: 32 }}>{cpu.toFixed(0)}%</span>
      </div>
    </div>
  )
}
