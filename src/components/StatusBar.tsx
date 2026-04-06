import React, { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { CustomSelect } from './CustomSelect'

const SR_OPTIONS = [
  { value: '44100', label: '44.1kHz' },
  { value: '48000', label: '48kHz' },
  { value: '88200', label: '88.2kHz' },
  { value: '96000', label: '96kHz' },
]

const BIT_OPTIONS = [
  { value: '16', label: '16-bit' },
  { value: '24', label: '24-bit' },
  { value: '32', label: '32-bit float' },
]

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
      <CustomSelect
        value={String(sampleRate)}
        options={SR_OPTIONS}
        onChange={v => setSampleRate(parseInt(v) as 44100 | 48000 | 88200 | 96000)}
        width={80}
      />
      <div className="status-divider" />
      <span className="status-label">Bit</span>
      <CustomSelect
        value={String(bitDepth)}
        options={BIT_OPTIONS}
        onChange={v => setBitDepth(parseInt(v) as 16 | 24 | 32)}
        width={90}
      />
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
