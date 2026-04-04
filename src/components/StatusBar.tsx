import React, { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'

export function StatusBar() {
  const { sampleRate, setSampleRate, bitDepth, setBitDepth, bufferSize, name, isDirty, bpm } = useProjectStore()
  const [cpu, setCpu] = useState(0)

  // Simulate CPU meter
  useEffect(() => {
    const id = setInterval(() => {
      setCpu(c => Math.max(5, Math.min(95, c + (Math.random() - 0.5) * 8)))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const cpuColor = cpu > 80 ? '#ef4444' : cpu > 60 ? '#f59e0b' : '#10b981'

  return (
    <div className="status-bar">
      {/* Project name */}
      <span className="status-project">{name}{isDirty ? ' •' : ''}</span>

      <div className="status-divider" />

      {/* Sample rate */}
      <span className="status-label">SR</span>
      <select
        className="status-select"
        value={sampleRate}
        onChange={e => setSampleRate(parseInt(e.target.value) as any)}
      >
        <option value={44100}>44.1 kHz</option>
        <option value={48000}>48 kHz</option>
        <option value={88200}>88.2 kHz</option>
        <option value={96000}>96 kHz</option>
      </select>

      {/* Bit depth */}
      <span className="status-label">Bit</span>
      <select
        className="status-select"
        value={bitDepth}
        onChange={e => setBitDepth(parseInt(e.target.value) as any)}
      >
        <option value={16}>16-bit</option>
        <option value={24}>24-bit</option>
        <option value={32}>32-bit float</option>
      </select>

      {/* Buffer */}
      <span className="status-label">Buffer</span>
      <span className="status-val">{bufferSize} samples</span>

      <div className="status-divider" />

      {/* BPM */}
      <span className="status-label">BPM</span>
      <span className="status-val">{bpm}</span>

      <div className="status-divider" />

      {/* CPU */}
      <span className="status-label">CPU</span>
      <div className="cpu-bar-wrap">
        <div className="cpu-bar" style={{ width: `${cpu}%`, background: cpuColor }} />
      </div>
      <span className="status-val" style={{ color: cpuColor }}>{Math.round(cpu)}%</span>

      {/* Audio engine status */}
      <div className="status-divider" />
      <span className="status-engine">🔊 Web Audio API</span>
    </div>
  )
}
