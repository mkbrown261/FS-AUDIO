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

interface StatusBarProps {
  getMasterLevel?: () => [number, number]
}

// ── Realtime LUFS approximation from RMS window ──────────────────────────────
// A simple but fast K-weighted approximation suitable for a meter display.
// True integrated LUFS requires minutes of audio; we compute 400ms momentary.
function linToLufs(rms: number): number {
  if (rms < 1e-6) return -70
  return -0.691 + 10 * Math.log10(Math.max(1e-10, rms * rms))
}

// ── LUFS Meter component ──────────────────────────────────────────────────────
function LufsMeter({ getMasterLevel }: { getMasterLevel: () => [number, number] }) {
  const [lufs, setLufs] = useState(-70)
  const [peak, setPeak] = useState(-Infinity)
  const [peakHold, setPeakHold] = useState(-Infinity)
  const peakHoldRef = useRef(-Infinity)
  const peakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rmsHistRef = useRef<number[]>([])
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const [lLin, rLin] = getMasterLevel()
      const combined = Math.max(lLin, rLin)

      // Rolling 400ms RMS (assuming ~60fps → 24 frames)
      rmsHistRef.current.push(combined)
      if (rmsHistRef.current.length > 24) rmsHistRef.current.shift()
      const rms = Math.sqrt(rmsHistRef.current.reduce((s, v) => s + v * v, 0) / rmsHistRef.current.length)

      const momentaryLufs = linToLufs(rms)
      setLufs(momentaryLufs)

      // Peak dBFS
      const peakDb = combined > 0 ? 20 * Math.log10(combined) : -70
      setPeak(peakDb)

      // Peak hold for 2s
      if (peakDb > peakHoldRef.current) {
        peakHoldRef.current = peakDb
        setPeakHold(peakDb)
        if (peakTimerRef.current) clearTimeout(peakTimerRef.current)
        peakTimerRef.current = setTimeout(() => {
          peakHoldRef.current = -Infinity
          setPeakHold(-Infinity)
        }, 2000)
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (peakTimerRef.current) clearTimeout(peakTimerRef.current)
    }
  }, [getMasterLevel])

  // Color based on LUFS
  const lufsNorm = Math.max(0, Math.min(1, (lufs + 60) / 60)) // -60..0 → 0..1
  const meterColor = lufs > -3 ? '#ef4444' : lufs > -9 ? '#f59e0b' : lufs > -18 ? '#10b981' : '#3b82f6'
  const peakColor = peakHold > -1 ? '#ef4444' : peakHold > -6 ? '#f59e0b' : '#10b981'

  const fmtLufs = (v: number) => isFinite(v) ? (v > -10 ? v.toFixed(1) : v.toFixed(0)) : '-∞'
  const fmtDb   = (v: number) => isFinite(v) && v > -70 ? (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : '-∞'

  return (
    <div className="status-lufs-wrap" title={`Momentary LUFS: ${fmtLufs(lufs)} | Peak: ${fmtDb(peak)} dBFS | Hold: ${fmtDb(peakHold)} dBFS`}>
      <span className="status-label">LUFS</span>
      {/* Meter bar */}
      <div className="status-lufs-bar-bg">
        <div
          className="status-lufs-bar-fill"
          style={{ width: `${Math.round(lufsNorm * 100)}%`, background: meterColor }}
        />
      </div>
      <span className="status-lufs-val" style={{ color: meterColor }}>{fmtLufs(lufs)}</span>
      <div className="status-divider" />
      <span className="status-label">PK</span>
      <span className="status-lufs-val" style={{ color: peakColor, minWidth: 36 }}>{fmtDb(peakHold)}</span>
    </div>
  )
}

export function StatusBar({ getMasterLevel }: StatusBarProps) {
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

      {/* LUFS Meter — shown when a getMasterLevel function is provided */}
      {getMasterLevel && (
        <>
          <div className="status-divider" />
          <LufsMeter getMasterLevel={getMasterLevel} />
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
