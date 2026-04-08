/**
 * FS-AUDIO Built-In Plugin Rack — Elite Edition
 * All plugins are implemented 100% with Web Audio API — no external dependencies.
 * Plugin architecture is WAM2-compatible (Web Audio Modules 2.0 design patterns).
 *
 * Classic plugins:
 *  1. FS-EQ3        — 3-band parametric EQ
 *  2. FS-Comp       — Dynamics compressor
 *  3. FS-Limiter    — Brick-wall limiter
 *  4. FS-Reverb     — Algorithmic plate reverb (synthetic IR)
 *  5. FS-Delay      — Stereo delay with feedback
 *  6. FS-Chorus     — Modulated delay chorus
 *  7. FS-Bitcrusher — Lo-fi bit depth reducer
 *
 * Elite Plugin Suite (new):
 *  8. FS-Saturn     — Multiband harmonic saturation (FabFilter Saturn inspired)
 *  9. FS-Pressure   — Vintage bus compressor, SSL G-Bus / Neve 33609 character
 * 10. FS-Spacetime  — Shimmer reverb + tempo-sync ping-pong delay (Valhalla/Echoboy)
 * 11. FS-Transient  — Attack/sustain transient designer (SPL Transient Designer)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useProjectStore, Track, Plugin } from '../../store/projectStore'
import { FLOWSTATE_PRO_DEFAULTS, renderFlowstatePlugin } from './FlowstatePro'
import { AI_PLUGIN_DEFAULTS, renderAiPlugin } from './AiPlugins'

// ── Knob Component ────────────────────────────────────────────────────────────
interface KnobProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
  size?: number
}

function Knob({ label, value, min, max, step = 0.01, unit = '', onChange, size = 36 }: KnobProps) {
  const norm = (value - min) / (max - min)
  const angle = -135 + norm * 270 // -135° to +135°
  const cx = size / 2, cy = size / 2, r = size / 2 - 3

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startVal = value
    const range = max - min

    const move = (me: MouseEvent) => {
      const dy = startY - me.clientY // drag up = increase
      const delta = (dy / 120) * range
      const newVal = Math.max(min, Math.min(max, startVal + delta))
      const snapped = step ? Math.round(newVal / step) * step : newVal
      onChange(Math.round(snapped * 1000) / 1000)
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [value, min, max, step, onChange])

  const rad = (angle * Math.PI) / 180
  const tickX = cx + r * Math.sin(rad)
  const tickY = cy - r * Math.cos(rad)
  const innerX = cx + (r - 6) * Math.sin(rad)
  const innerY = cy - (r - 6) * Math.cos(rad)

  const formatVal = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(1)}k`
    if (Math.abs(v) < 10 && v % 1 !== 0) return v.toFixed(1)
    return Math.round(v).toString()
  }

  return (
    <div className="knob-wrap" style={{ width: size + 16 }}>
      <svg
        width={size} height={size}
        className="knob-svg"
        onMouseDown={handleMouseDown}
        style={{ cursor: 'ns-resize', userSelect: 'none' }}
        aria-label={`${label}: ${formatVal(value)}${unit}`}
      >
        {/* Track arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={3} />
        {/* Value arc */}
        <path
          d={describeArc(cx, cy, r, -135, -135 + norm * 270)}
          fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round"
        />
        {/* Dot */}
        <circle cx={cx} cy={cy} r={r - 8} fill="rgba(255,255,255,0.05)" />
        {/* Pointer */}
        <line x1={innerX} y1={innerY} x2={tickX} y2={tickY} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 9, color: 'var(--text-m)', textAlign: 'center', lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 9, color: 'var(--text-s)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
        {formatVal(value)}{unit}
      </div>
    </div>
  )
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startRad = (startAngle * Math.PI) / 180
  const endRad = (endAngle * Math.PI) / 180
  const x1 = cx + r * Math.sin(startRad)
  const y1 = cy - r * Math.cos(startRad)
  const x2 = cx + r * Math.sin(endRad)
  const y2 = cy - r * Math.cos(endRad)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

// ── Plugin Default Params ─────────────────────────────────────────────────────
export const PLUGIN_DEFAULTS: Record<string, { params: Record<string, number | string>; name: string; type: Plugin['type'] }> = {
  eq: {
    name: 'FS-EQ3',
    type: 'eq',
    params: {
      lowGain: 0, lowFreq: 100,
      midGain: 0, midFreq: 1000, midQ: 1,
      highGain: 0, highFreq: 8000,
    },
  },
  compressor: {
    name: 'FS-Comp',
    type: 'compressor',
    params: { threshold: -18, ratio: 4, attack: 0.01, release: 0.1, knee: 6, makeupGain: 0 },
  },
  limiter: {
    name: 'FS-Limiter',
    type: 'limiter',
    params: { threshold: -1, release: 0.05, ceiling: -0.1 },
  },
  reverb: {
    name: 'FS-Reverb',
    type: 'reverb',
    params: { wet: 0.3, size: 2.5, damping: 0.5, predelay: 0.02 },
  },
  delay: {
    name: 'FS-Delay',
    type: 'delay',
    params: { wet: 0.25, time: 0.375, feedback: 0.35, stereoSpread: 0.3 },
  },
  chorus: {
    name: 'FS-Chorus',
    type: 'chorus',
    params: { wet: 0.5, rate: 0.8, depth: 0.003, delay: 0.015 },
  },
  distortion: {
    name: 'FS-Bitcrusher',
    type: 'distortion',
    params: { bits: 16, downsample: 1, wet: 0.5 },
  },

  // ── Elite Plugin Suite ──────────────────────────────────────────────────────
  saturation: {
    name: 'FS-Saturn',
    type: 'saturation',
    params: {
      // Low band
      lowDrive: 0, lowFreq: 250, lowMode: 0,   // mode: 0=tape, 1=tube, 2=clip, 3=fuzz
      // Mid band
      midDrive: 0, midFreq: 3000, midMode: 1,
      // High band
      highDrive: 0, highMode: 2,
      // Global
      mix: 0.5, output: 0,
    },
  },

  bus_compressor: {
    name: 'FS-Pressure',
    type: 'bus_compressor',
    params: {
      threshold: -12,
      ratio: 4,         // 1.5 / 2 / 4 / 10 discrete steps mapped 0-3
      attack: 0.001,    // 0.001 / 0.003 / 0.01 / 0.03 / 0.1 / 0.3 ms → mapped
      release: 0.1,     // auto = -1
      makeup: 0,
      // Color: 0 = clean, 1 = SSL (punchy), 2 = Neve (warm)
      color: 1,
      mix: 1.0,         // parallel mix (NY compression)
      autoGain: 1,      // auto makeup
    },
  },

  spacetime: {
    name: 'FS-Spacetime',
    type: 'spacetime',
    params: {
      // Shimmer Reverb
      revWet: 0.3,
      revSize: 3.5,
      revDamping: 0.4,
      revPredelay: 0.02,
      shimmer: 0.3,     // shimmer pitch-up amount (0-1)
      shimmerPitch: 12, // semitones (octave up by default)
      // Ping-Pong Delay
      dlyWet: 0.2,
      dlyTime: 0.375,   // quarter note at 120bpm = 0.5s
      dlyFeedback: 0.4,
      dlySpread: 0.8,   // ping-pong width
      // BPM sync: 0=free, 1=1/4, 2=1/8, 3=1/2, 4=1/16
      dlySync: 1,
    },
  },

  transient: {
    name: 'FS-Transient',
    type: 'transient',
    params: {
      attack: 0, sustain: 0, gain: 0, mode: 1, sensitivity: 0.5, clipProtect: 1,
    },
  },

  // ── 10 New Elite Plugins ────────────────────────────────────────────────────

  expander: {
    name: 'FS-Nova',
    type: 'expander',
    params: {
      threshold: -50,   // dBFS below which expansion/gating occurs
      ratio: 10,        // expansion ratio (2–20)
      attack: 0.001,    // attack time (s)
      release: 0.1,     // release time (s)
      range: 40,        // max attenuation dB before full gate
      makeup: 0,        // makeup gain dB
      // Band selector: 0=full, 1=lo, 2=mid, 3=hi
      band: 0,
      lookahead: 0,     // lookahead ms (0=off)
    },
  },

  exciter: {
    name: 'FS-Prism',
    type: 'exciter',
    params: {
      freq: 3000,       // exciter frequency crossover Hz
      q: 0.7,           // HP filter Q
      drive: 0.3,       // harmonic drive amount (0-1)
      mix: 0.3,         // blend of harmonics into output
      // Mode: 0=Air, 1=Presence, 2=Warmth
      mode: 0,
      oddOnly: 0,       // prefer odd harmonics (1=on, tube-like)
      color: 0,         // 0=bright (4k), 1=upper-mid (2k), 2=air (8k)
    },
  },

  vibrato: {
    name: 'FS-Vibe',
    type: 'vibrato',
    params: {
      rate: 5,          // LFO rate Hz (0.1–20)
      depth: 0.003,     // pitch depth in seconds (±0–15ms)
      mix: 0.5,         // wet/dry
      // Waveform: 0=sine, 1=triangle, 2=random (wow)
      waveform: 0,
      stereo: 0.5,      // stereo offset (L vs R phase)
      // Mode: 0=Vibrato, 1=Chorus-Pitch, 2=Wow (tape)
      mode: 0,
    },
  },

  stereo_width: {
    name: 'FS-Phase',
    type: 'stereo_width',
    params: {
      width: 1.0,       // 0=mono, 1=normal, 2=extra wide
      // Balance: -1 to +1 (L→R pan)
      balance: 0,
      // MS Mode: 0=width only, 1=M/S EQ
      msMode: 0,
      midGain: 0,       // M channel gain dB
      sideGain: 0,      // S channel gain dB
      output: 0,        // output trim dB
      bassMonoFreq: 120,// below this freq collapse to mono (0=off)
    },
  },

  tape: {
    name: 'FS-Oxide',
    type: 'tape',
    params: {
      saturation: 0.3,  // tape saturation amount (0-1)
      brightness: 16000,// HF rolloff frequency (3k-20k)
      bass: 30,         // HPF frequency (20-200 Hz)
      mix: 0.6,         // wet/dry blend
      // Tape speed: 0=7.5ips, 1=15ips, 2=30ips (affects tone)
      speed: 1,
      noise: 0,         // tape hiss amount (0-1)
      age: 0.2,         // tape age: increases distortion + flutter (0-1)
    },
  },

  sub_enhancer: {
    name: 'FS-Hades',
    type: 'sub_enhancer',
    params: {
      freq: 80,         // sub frequency center Hz (30-200)
      amount: 0.4,      // sub harmonic generation amount (0-1)
      // Mode: 0=Sub Octave (octave below), 1=Harmonic Bass (2nd har), 2=Deep (both)
      mode: 1,
      attack: 0.005,    // envelope follower attack
      release: 0.1,     // envelope follower release
      output: 0,        // output trim dB
      sidechain: 0,     // sidechain HP filter (0=off, 1=on)
    },
  },

  noise_gate: {
    name: 'FS-Shield',
    type: 'noise_gate',
    params: {
      threshold: -60,   // gate threshold dBFS
      attack: 0.001,    // open time (s)
      release: 0.2,     // close time (s)
      hysteresis: 3,    // hysteresis dB (prevents chatter)
      hold: 0.05,       // hold time after signal drops below threshold (s)
      makeup: 0,        // makeup gain dB
      // Mode: 0=Gate, 1=Expander (soft), 2=Duck
      mode: 0,
      flip: 0,          // 1=invert (keep quiet, cut signal)
    },
  },

  pitch_correct: {
    name: 'FS-Flux',
    type: 'pitch_correct',
    params: {
      speed: 0.5,       // correction speed (0=slow natural, 1=hard tune)
      amount: 0.8,      // correction amount (0-1)
      // Key: 0=C, 1=Db, 2=D ... 11=B
      key: 0,
      // Scale: 0=Chromatic, 1=Major, 2=Minor, 3=Pentatonic
      scale: 1,
      formant: 0,       // formant preservation (-1 to +1 shift)
      detune: 0,        // fine detune cents (-50 to +50)
      bypass: 0,        // hard bypass
    },
  },

  parallel_comp: {
    name: 'FS-Forge',
    type: 'parallel_comp',
    params: {
      threshold: -20,   // compressor threshold dB
      ratio: 6,         // compression ratio
      attack: 0.005,    // attack s
      release: 0.2,     // release s
      knee: 10,         // knee dB
      makeup: 3,        // makeup gain dB
      blend: 0.5,       // parallel blend (0=dry, 1=crushed)
      // Color: 0=Clean, 1=Vintage, 2=Punchy
      color: 1,
      // Band: 0=Wideband, 1=Low only, 2=Mid only, 3=High only
      band: 0,
    },
  },

  granular: {
    name: 'FS-Crystal',
    type: 'granular',
    params: {
      mix: 0.3,         // freeze/reverb blend
      size: 4,          // freeze cloud size (0.5–12s)
      decay: 0.7,       // decay / freeze flatness (0=decay, 1=freeze)
      pitch: 0,         // pitch shift of frozen signal (semitones -12 to +12)
      scatter: 0.3,     // granular scatter/randomness
      // Mode: 0=Freeze, 1=Shimmer, 2=Stutter
      mode: 0,
      reverse: 0,       // play grains in reverse
      density: 0.8,     // grain density (0-1)
    },
  },

  // ── Instrument Plugins ────────────────────────────────────────────────────────
  fs_analog: {
    name: 'FS-Analog',
    type: 'fs_analog',
    params: {
      osc1_type: 'sawtooth',
      osc1_level: 0.7,
      osc1_octave: 0,
      osc1_detune: 0,
      osc2_type: 'square',
      osc2_level: 0.3,
      osc2_octave: -1,
      osc2_detune: 5,
      filter_type: 'lowpass',
      filter_cutoff: 2000,
      filter_resonance: 5,
      filter_env_amount: 0.5,
      env_attack: 0.01,
      env_decay: 0.2,
      env_sustain: 0.6,
      env_release: 0.3,
      lfo_rate: 5,
      lfo_amount: 0.2,
      lfo_destination: 'filter',
      unison_voices: 2,
      unison_detune: 10,
      master_volume: 0.7,
    },
  },
}

// ── Per-plugin UI ─────────────────────────────────────────────────────────────
interface PluginEditorProps {
  plugin: Plugin
  onChange: (params: Record<string, number>) => void
}

function EQEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="LO GAIN" value={p.lowGain ?? 0} min={-18} max={18} unit=" dB" onChange={v => onChange({ ...p, lowGain: v })} />
      <Knob label="LO Hz" value={p.lowFreq ?? 100} min={20} max={500} step={1} unit=" Hz" onChange={v => onChange({ ...p, lowFreq: v })} />
      <Knob label="MID GAIN" value={p.midGain ?? 0} min={-18} max={18} unit=" dB" onChange={v => onChange({ ...p, midGain: v })} />
      <Knob label="MID Hz" value={p.midFreq ?? 1000} min={200} max={8000} step={10} unit=" Hz" onChange={v => onChange({ ...p, midFreq: v })} />
      <Knob label="MID Q" value={p.midQ ?? 1} min={0.1} max={10} step={0.1} onChange={v => onChange({ ...p, midQ: v })} />
      <Knob label="HI GAIN" value={p.highGain ?? 0} min={-18} max={18} unit=" dB" onChange={v => onChange({ ...p, highGain: v })} />
      <Knob label="HI Hz" value={p.highFreq ?? 8000} min={2000} max={20000} step={100} unit=" Hz" onChange={v => onChange({ ...p, highFreq: v })} />
    </div>
  )
}

function CompressorEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="THRESH" value={p.threshold ?? -18} min={-60} max={0} unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
      <Knob label="RATIO" value={p.ratio ?? 4} min={1} max={20} step={0.1} unit=":1" onChange={v => onChange({ ...p, ratio: v })} />
      <Knob label="ATTACK" value={(p.attack ?? 0.01) * 1000} min={0.1} max={200} step={0.1} unit=" ms" onChange={v => onChange({ ...p, attack: v / 1000 })} />
      <Knob label="RELEASE" value={(p.release ?? 0.1) * 1000} min={10} max={2000} step={10} unit=" ms" onChange={v => onChange({ ...p, release: v / 1000 })} />
      <Knob label="KNEE" value={p.knee ?? 6} min={0} max={40} unit=" dB" onChange={v => onChange({ ...p, knee: v })} />
      <Knob label="MAKEUP" value={p.makeupGain ?? 0} min={0} max={24} unit=" dB" onChange={v => onChange({ ...p, makeupGain: v })} />
    </div>
  )
}

function LimiterEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="CEILING" value={p.ceiling ?? -0.1} min={-12} max={0} step={0.1} unit=" dB" onChange={v => onChange({ ...p, ceiling: v })} />
      <Knob label="THRESH" value={p.threshold ?? -1} min={-20} max={0} step={0.1} unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
      <Knob label="RELEASE" value={(p.release ?? 0.05) * 1000} min={1} max={500} step={1} unit=" ms" onChange={v => onChange({ ...p, release: v / 1000 })} />
    </div>
  )
}

function ReverbEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="WET" value={p.wet ?? 0.3} min={0} max={1} unit="" onChange={v => onChange({ ...p, wet: v })} />
      <Knob label="SIZE" value={p.size ?? 2.5} min={0.1} max={10} step={0.1} unit=" s" onChange={v => onChange({ ...p, size: v })} />
      <Knob label="DAMP" value={p.damping ?? 0.5} min={0} max={1} onChange={v => onChange({ ...p, damping: v })} />
      <Knob label="PRE-DLY" value={(p.predelay ?? 0.02) * 1000} min={0} max={100} step={1} unit=" ms" onChange={v => onChange({ ...p, predelay: v / 1000 })} />
    </div>
  )
}

function DelayEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="WET" value={p.wet ?? 0.25} min={0} max={1} onChange={v => onChange({ ...p, wet: v })} />
      <Knob label="TIME" value={(p.time ?? 0.375) * 1000} min={1} max={2000} step={1} unit=" ms" onChange={v => onChange({ ...p, time: v / 1000 })} />
      <Knob label="FDBK" value={p.feedback ?? 0.35} min={0} max={0.98} step={0.01} onChange={v => onChange({ ...p, feedback: v })} />
      <Knob label="SPREAD" value={p.stereoSpread ?? 0.3} min={0} max={1} onChange={v => onChange({ ...p, stereoSpread: v })} />
    </div>
  )
}

function ChorusEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="WET" value={p.wet ?? 0.5} min={0} max={1} onChange={v => onChange({ ...p, wet: v })} />
      <Knob label="RATE" value={p.rate ?? 0.8} min={0.05} max={8} step={0.05} unit=" Hz" onChange={v => onChange({ ...p, rate: v })} />
      <Knob label="DEPTH" value={(p.depth ?? 0.003) * 1000} min={0.1} max={20} step={0.1} unit=" ms" onChange={v => onChange({ ...p, depth: v / 1000 })} />
      <Knob label="DELAY" value={(p.delay ?? 0.015) * 1000} min={1} max={50} step={1} unit=" ms" onChange={v => onChange({ ...p, delay: v / 1000 })} />
    </div>
  )
}

function DistortionEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-knobs-row">
      <Knob label="BITS" value={p.bits ?? 16} min={2} max={16} step={1} onChange={v => onChange({ ...p, bits: v })} />
      <Knob label="RATE ÷" value={p.downsample ?? 1} min={1} max={32} step={1} onChange={v => onChange({ ...p, downsample: v })} />
      <Knob label="WET" value={p.wet ?? 0.5} min={0} max={1} onChange={v => onChange({ ...p, wet: v })} />
    </div>
  )
}

// ── FS-Saturn — Multiband Harmonic Saturation ─────────────────────────────────
const SAT_MODES = ['TAPE', 'TUBE', 'CLIP', 'FUZZ']

function SaturnEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const modeBtn = (band: string, modeKey: string) => (
    <div className="plugin-mode-group">
      {SAT_MODES.map((m, i) => (
        <button
          key={m}
          className={`plugin-mode-btn ${Math.round(p[modeKey] ?? 0) === i ? 'active' : ''}`}
          onClick={() => onChange({ ...p, [modeKey]: i })}
        >{m}</button>
      ))}
      <span className="plugin-mode-label">{band}</span>
    </div>
  )
  return (
    <div className="plugin-saturn-wrap">
      <div className="plugin-saturn-band">
        <div className="plugin-saturn-band-label" style={{ color: '#f59e0b' }}>LOW</div>
        <div className="plugin-knobs-row">
          <Knob label="DRIVE" value={p.lowDrive ?? 0} min={0} max={10} step={0.1} onChange={v => onChange({ ...p, lowDrive: v })} />
          <Knob label="FREQ" value={p.lowFreq ?? 250} min={50} max={800} step={10} unit=" Hz" onChange={v => onChange({ ...p, lowFreq: v })} />
        </div>
        {modeBtn('MODE', 'lowMode')}
      </div>
      <div className="plugin-saturn-divider" />
      <div className="plugin-saturn-band">
        <div className="plugin-saturn-band-label" style={{ color: '#10b981' }}>MID</div>
        <div className="plugin-knobs-row">
          <Knob label="DRIVE" value={p.midDrive ?? 0} min={0} max={10} step={0.1} onChange={v => onChange({ ...p, midDrive: v })} />
          <Knob label="FREQ" value={p.midFreq ?? 3000} min={800} max={8000} step={100} unit=" Hz" onChange={v => onChange({ ...p, midFreq: v })} />
        </div>
        {modeBtn('MODE', 'midMode')}
      </div>
      <div className="plugin-saturn-divider" />
      <div className="plugin-saturn-band">
        <div className="plugin-saturn-band-label" style={{ color: '#06b6d4' }}>HIGH</div>
        <div className="plugin-knobs-row">
          <Knob label="DRIVE" value={p.highDrive ?? 0} min={0} max={10} step={0.1} onChange={v => onChange({ ...p, highDrive: v })} />
        </div>
        {modeBtn('MODE', 'highMode')}
      </div>
      <div className="plugin-saturn-divider" />
      <div className="plugin-knobs-row">
        <Knob label="MIX" value={p.mix ?? 0.5} min={0} max={1} onChange={v => onChange({ ...p, mix: v })} />
        <Knob label="OUTPUT" value={p.output ?? 0} min={-12} max={12} unit=" dB" onChange={v => onChange({ ...p, output: v })} />
      </div>
    </div>
  )
}

// ── FS-Pressure — Vintage Bus Compressor ──────────────────────────────────────
const PRESSURE_RATIOS  = ['1.5', '2', '4', '10']
const PRESSURE_ATTACKS = ['0.1', '0.3', '1', '3', '10', '30']
const PRESSURE_COLORS  = ['CLEAN', 'SSL', 'NEVE']

function PressureEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-pressure-wrap">
      <div className="plugin-knobs-row">
        <Knob label="THRESH"  value={p.threshold ?? -12} min={-40} max={0}   unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
        <Knob label="MAKEUP"  value={p.makeup ?? 0}      min={0}   max={20}  unit=" dB" onChange={v => onChange({ ...p, makeup: v })} />
        <Knob label="MIX"     value={p.mix ?? 1}         min={0}   max={1}   onChange={v => onChange({ ...p, mix: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">RATIO</span>
          {PRESSURE_RATIOS.map((r, i) => (
            <button key={r} className={`plugin-step-btn ${Math.round(p.ratio ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, ratio: i })}>{r}:1</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">ATTACK ms</span>
          {PRESSURE_ATTACKS.map((a, i) => (
            <button key={a} className={`plugin-step-btn ${Math.round((p.attack ?? 2) * 10) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, attack: i / 10 })}>{a}</button>
          ))}
        </div>
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">RELEASE</span>
          <Knob label="ms" value={(p.release ?? 0.1) * 1000} min={50} max={1200} step={10} unit=" ms"
            onChange={v => onChange({ ...p, release: v / 1000 })} />
          <button
            className={`plugin-step-btn ${p.release === -1 ? 'active' : ''}`}
            onClick={() => onChange({ ...p, release: -1 })}>AUTO</button>
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">COLOR</span>
          {PRESSURE_COLORS.map((c, i) => (
            <button key={c}
              className={`plugin-step-btn ${Math.round(p.color ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, color: i })}>{c}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">AUTO-GAIN</span>
          <button
            className={`plugin-step-btn ${p.autoGain ? 'active' : ''}`}
            onClick={() => onChange({ ...p, autoGain: p.autoGain ? 0 : 1 })}>
            {p.autoGain ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── FS-Spacetime — Shimmer Reverb + Ping-Pong Delay ───────────────────────────
const SYNC_LABELS = ['FREE', '1/4', '1/8', '1/2', '1/16']

function SpacetimeEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-spacetime-wrap">
      {/* Shimmer Reverb section */}
      <div className="plugin-section-title" style={{ color: '#a855f7' }}>✦ SHIMMER REVERB</div>
      <div className="plugin-knobs-row">
        <Knob label="WET"      value={p.revWet ?? 0.3}       min={0}   max={1}   onChange={v => onChange({ ...p, revWet: v })} />
        <Knob label="SIZE"     value={p.revSize ?? 3.5}       min={0.1} max={12}  step={0.1} unit=" s" onChange={v => onChange({ ...p, revSize: v })} />
        <Knob label="DAMP"     value={p.revDamping ?? 0.4}    min={0}   max={1}   onChange={v => onChange({ ...p, revDamping: v })} />
        <Knob label="PRE-DLY"  value={(p.revPredelay ?? 0.02) * 1000} min={0} max={100} step={1} unit=" ms" onChange={v => onChange({ ...p, revPredelay: v / 1000 })} />
        <Knob label="SHIMMER"  value={p.shimmer ?? 0.3}       min={0}   max={1}   onChange={v => onChange({ ...p, shimmer: v })} />
        <Knob label="SHIM +st" value={p.shimmerPitch ?? 12}   min={1}   max={24}  step={1}  onChange={v => onChange({ ...p, shimmerPitch: v })} />
      </div>
      {/* Ping-Pong Delay section */}
      <div className="plugin-section-title" style={{ color: '#3b82f6', marginTop: 8 }}>⬡ PING-PONG DELAY</div>
      <div className="plugin-knobs-row">
        <Knob label="WET"    value={p.dlyWet ?? 0.2}      min={0}    max={1}    onChange={v => onChange({ ...p, dlyWet: v })} />
        <Knob label="TIME"   value={(p.dlyTime ?? 0.375) * 1000} min={10} max={2000} step={1} unit=" ms" onChange={v => onChange({ ...p, dlyTime: v / 1000 })} />
        <Knob label="FDBK"   value={p.dlyFeedback ?? 0.4} min={0}    max={0.95} step={0.01} onChange={v => onChange({ ...p, dlyFeedback: v })} />
        <Knob label="SPREAD" value={p.dlySpread ?? 0.8}   min={0}    max={1}    onChange={v => onChange({ ...p, dlySpread: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">BPM SYNC</span>
          {SYNC_LABELS.map((s, i) => (
            <button key={s} className={`plugin-step-btn ${Math.round(p.dlySync ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, dlySync: i })}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── FS-Transient — Attack/Sustain Transient Designer ──────────────────────────
const TRANSIENT_MODES = ['DRUM', 'GENERAL', 'SMOOTH']

function TransientEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-transient-wrap">
      <div className="plugin-knobs-row">
        <Knob label="ATTACK"  value={p.attack ?? 0}       min={-24} max={24} unit=" dB" onChange={v => onChange({ ...p, attack: v })} />
        <Knob label="SUSTAIN" value={p.sustain ?? 0}      min={-24} max={24} unit=" dB" onChange={v => onChange({ ...p, sustain: v })} />
        <Knob label="GAIN"    value={p.gain ?? 0}         min={-12} max={12} unit=" dB" onChange={v => onChange({ ...p, gain: v })} />
        <Knob label="SENSE"   value={p.sensitivity ?? 0.5} min={0}  max={1}  onChange={v => onChange({ ...p, sensitivity: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">MODE</span>
          {TRANSIENT_MODES.map((m, i) => (
            <button key={m} className={`plugin-step-btn ${Math.round(p.mode ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, mode: i })}>{m}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">CLIP PROTECT</span>
          <button
            className={`plugin-step-btn ${p.clipProtect ? 'active' : ''}`}
            onClick={() => onChange({ ...p, clipProtect: p.clipProtect ? 0 : 1 })}>
            {p.clipProtect ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── FS-Nova — Multiband Expander / Gate ──────────────────────────────────────
const NOVA_BANDS  = ['FULL', 'LOW', 'MID', 'HIGH']

function NovaEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-nova-wrap">
      <div className="plugin-knobs-row">
        <Knob label="THRESH"  value={p.threshold ?? -50} min={-80} max={0}   unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
        <Knob label="RATIO"   value={p.ratio ?? 10}      min={1}   max={20}  step={0.5} unit=":1" onChange={v => onChange({ ...p, ratio: v })} />
        <Knob label="ATTACK"  value={(p.attack ?? 0.001) * 1000} min={0.1} max={200} step={0.1} unit=" ms" onChange={v => onChange({ ...p, attack: v / 1000 })} />
        <Knob label="RELEASE" value={(p.release ?? 0.1) * 1000}  min={10}  max={2000} step={10} unit=" ms" onChange={v => onChange({ ...p, release: v / 1000 })} />
        <Knob label="RANGE"   value={p.range ?? 40}      min={0}   max={80}  unit=" dB" onChange={v => onChange({ ...p, range: v })} />
        <Knob label="MAKEUP"  value={p.makeup ?? 0}      min={0}   max={18}  unit=" dB" onChange={v => onChange({ ...p, makeup: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">BAND</span>
          {NOVA_BANDS.map((b, i) => (
            <button key={b} className={`plugin-step-btn ${Math.round(p.band ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, band: i })}>{b}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">LOOK-AHD</span>
          <Knob label="ms" value={p.lookahead ?? 0} min={0} max={20} step={1} unit=" ms" onChange={v => onChange({ ...p, lookahead: v })} />
        </div>
      </div>
    </div>
  )
}

// ── FS-Prism — Harmonic Exciter ───────────────────────────────────────────────
const PRISM_COLORS = ['BRIGHT', 'PRESENCE', 'AIR']
const PRISM_MODES  = ['WARM', 'SMOOTH', 'CRISP']

function PrismEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-prism-wrap">
      <div className="plugin-knobs-row">
        <Knob label="FREQ"  value={p.freq ?? 3000}   min={500}  max={16000} step={100} unit=" Hz" onChange={v => onChange({ ...p, freq: v })} />
        <Knob label="DRIVE" value={p.drive ?? 0.3}   min={0}    max={1}    step={0.01} onChange={v => onChange({ ...p, drive: v })} />
        <Knob label="Q"     value={p.q ?? 0.7}       min={0.1}  max={5}    step={0.1}  onChange={v => onChange({ ...p, q: v })} />
        <Knob label="MIX"   value={p.mix ?? 0.3}     min={0}    max={1}    step={0.01} onChange={v => onChange({ ...p, mix: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">RANGE</span>
          {PRISM_COLORS.map((c, i) => (
            <button key={c} className={`plugin-step-btn ${Math.round(p.color ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, color: i })}>{c}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">CHARACTER</span>
          {PRISM_MODES.map((m, i) => (
            <button key={m} className={`plugin-step-btn ${Math.round(p.mode ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, mode: i })}>{m}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">ODD HARM</span>
          <button className={`plugin-step-btn ${p.oddOnly ? 'active' : ''}`}
            onClick={() => onChange({ ...p, oddOnly: p.oddOnly ? 0 : 1 })}>{p.oddOnly ? 'ON' : 'OFF'}</button>
        </div>
      </div>
    </div>
  )
}

// ── FS-Vibe — Tape Vibrato / Chorus Modulation ───────────────────────────────
const VIBE_WAVEFORMS = ['SINE', 'TRI', 'WOW']
const VIBE_MODES     = ['VIBRATO', 'CHORUS', 'TAPE']

function VibeEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-vibe-wrap">
      <div className="plugin-knobs-row">
        <Knob label="RATE"   value={p.rate ?? 5}         min={0.1}  max={20}   step={0.1}  unit=" Hz" onChange={v => onChange({ ...p, rate: v })} />
        <Knob label="DEPTH"  value={(p.depth ?? 0.003) * 1000} min={0.1} max={15} step={0.1} unit=" ms" onChange={v => onChange({ ...p, depth: v / 1000 })} />
        <Knob label="MIX"    value={p.mix ?? 0.5}        min={0}    max={1}    step={0.01} onChange={v => onChange({ ...p, mix: v })} />
        <Knob label="STEREO" value={p.stereo ?? 0.5}     min={0}    max={1}    step={0.01} onChange={v => onChange({ ...p, stereo: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">WAVEFORM</span>
          {VIBE_WAVEFORMS.map((w, i) => (
            <button key={w} className={`plugin-step-btn ${Math.round(p.waveform ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, waveform: i })}>{w}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">MODE</span>
          {VIBE_MODES.map((m, i) => (
            <button key={m} className={`plugin-step-btn ${Math.round(p.mode ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, mode: i })}>{m}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── FS-Phase — Stereo Width / M-S Processor ──────────────────────────────────
function PhaseEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  const widthPct = Math.round((p.width ?? 1) * 100)
  return (
    <div className="plugin-phase-wrap">
      {/* Width visualizer */}
      <div className="plugin-phase-vis">
        <div className="plugin-phase-meter">
          <div className="plugin-phase-bar" style={{ width: `${Math.min(100, widthPct / 2)}%`, background: widthPct > 100 ? '#a855f7' : '#3b82f6' }} />
          <span className="plugin-phase-pct">{widthPct}%</span>
        </div>
      </div>
      <div className="plugin-knobs-row">
        <Knob label="WIDTH"    value={p.width ?? 1}       min={0}   max={2}   step={0.01} onChange={v => onChange({ ...p, width: v })} />
        <Knob label="BALANCE"  value={p.balance ?? 0}     min={-1}  max={1}   step={0.01} onChange={v => onChange({ ...p, balance: v })} />
        <Knob label="MID dB"   value={p.midGain ?? 0}     min={-18} max={18}  unit=" dB"  onChange={v => onChange({ ...p, midGain: v })} />
        <Knob label="SIDE dB"  value={p.sideGain ?? 0}    min={-18} max={18}  unit=" dB"  onChange={v => onChange({ ...p, sideGain: v })} />
        <Knob label="OUTPUT"   value={p.output ?? 0}      min={-12} max={12}  unit=" dB"  onChange={v => onChange({ ...p, output: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">BASS MONO ≤</span>
          <Knob label="Hz" value={p.bassMonoFreq ?? 0} min={0} max={300} step={10} unit=" Hz" onChange={v => onChange({ ...p, bassMonoFreq: v })} />
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">M/S MODE</span>
          <button className={`plugin-step-btn ${p.msMode ? 'active' : ''}`}
            onClick={() => onChange({ ...p, msMode: p.msMode ? 0 : 1 })}>{p.msMode ? 'M/S EQ' : 'WIDTH'}</button>
        </div>
      </div>
    </div>
  )
}

// ── FS-Oxide — Tape Emulation ─────────────────────────────────────────────────
const OXIDE_SPEEDS = ['7.5 ips', '15 ips', '30 ips']

function OxideEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-oxide-wrap">
      <div className="plugin-knobs-row">
        <Knob label="SAT"      value={p.saturation ?? 0.3}  min={0}     max={1}     step={0.01} onChange={v => onChange({ ...p, saturation: v })} />
        <Knob label="BRIGHT"   value={p.brightness ?? 16000} min={3000}  max={20000} step={100}  unit=" Hz" onChange={v => onChange({ ...p, brightness: v })} />
        <Knob label="BASS"     value={p.bass ?? 30}          min={20}    max={200}   step={5}    unit=" Hz" onChange={v => onChange({ ...p, bass: v })} />
        <Knob label="MIX"      value={p.mix ?? 0.6}          min={0}     max={1}     step={0.01} onChange={v => onChange({ ...p, mix: v })} />
        <Knob label="AGE"      value={p.age ?? 0.2}          min={0}     max={1}     step={0.01} onChange={v => onChange({ ...p, age: v })} />
        <Knob label="NOISE"    value={p.noise ?? 0}          min={0}     max={1}     step={0.01} onChange={v => onChange({ ...p, noise: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">TAPE SPEED</span>
          {OXIDE_SPEEDS.map((s, i) => (
            <button key={s} className={`plugin-step-btn ${Math.round(p.speed ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, speed: i })}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── FS-Hades — Sub Enhancer ───────────────────────────────────────────────────
const HADES_MODES = ['SUB OCT', 'HARMONIC', 'DEEP']

function HadesEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-hades-wrap">
      <div className="plugin-knobs-row">
        <Knob label="FREQ"    value={p.freq ?? 80}      min={20}   max={250}  step={5}    unit=" Hz" onChange={v => onChange({ ...p, freq: v })} />
        <Knob label="AMOUNT"  value={p.amount ?? 0.4}   min={0}    max={1}    step={0.01} onChange={v => onChange({ ...p, amount: v })} />
        <Knob label="ATTACK"  value={(p.attack ?? 0.005) * 1000} min={0.1} max={100} step={0.1} unit=" ms" onChange={v => onChange({ ...p, attack: v / 1000 })} />
        <Knob label="RELEASE" value={(p.release ?? 0.1) * 1000}  min={10}  max={500}  step={10}  unit=" ms" onChange={v => onChange({ ...p, release: v / 1000 })} />
        <Knob label="OUTPUT"  value={p.output ?? 0}     min={-12}  max={12}   unit=" dB" onChange={v => onChange({ ...p, output: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">MODE</span>
          {HADES_MODES.map((m, i) => (
            <button key={m} className={`plugin-step-btn ${Math.round(p.mode ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, mode: i })}>{m}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">SC HPF</span>
          <button className={`plugin-step-btn ${p.sidechain ? 'active' : ''}`}
            onClick={() => onChange({ ...p, sidechain: p.sidechain ? 0 : 1 })}>{p.sidechain ? 'ON' : 'OFF'}</button>
        </div>
      </div>
    </div>
  )
}

// ── FS-Shield — Noise Gate ────────────────────────────────────────────────────
const SHIELD_MODES = ['GATE', 'EXPANDER', 'DUCK']

function ShieldEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-shield-wrap">
      <div className="plugin-knobs-row">
        <Knob label="THRESH"   value={p.threshold ?? -60} min={-90} max={0}    unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
        <Knob label="ATTACK"   value={(p.attack ?? 0.001) * 1000}  min={0.1} max={200} step={0.1} unit=" ms" onChange={v => onChange({ ...p, attack: v / 1000 })} />
        <Knob label="HOLD"     value={(p.hold ?? 0.05) * 1000}     min={0}   max={500} step={5}   unit=" ms" onChange={v => onChange({ ...p, hold: v / 1000 })} />
        <Knob label="RELEASE"  value={(p.release ?? 0.2) * 1000}   min={10}  max={2000} step={10} unit=" ms" onChange={v => onChange({ ...p, release: v / 1000 })} />
        <Knob label="HYST"     value={p.hysteresis ?? 3}  min={0}   max={20}   unit=" dB" onChange={v => onChange({ ...p, hysteresis: v })} />
        <Knob label="MAKEUP"   value={p.makeup ?? 0}      min={0}   max={18}   unit=" dB" onChange={v => onChange({ ...p, makeup: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">MODE</span>
          {SHIELD_MODES.map((m, i) => (
            <button key={m} className={`plugin-step-btn ${Math.round(p.mode ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, mode: i })}>{m}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">FLIP GATE</span>
          <button className={`plugin-step-btn ${p.flip ? 'active' : ''}`}
            onClick={() => onChange({ ...p, flip: p.flip ? 0 : 1 })}>{p.flip ? 'ON' : 'OFF'}</button>
        </div>
      </div>
    </div>
  )
}

// ── FS-Flux — Pitch Corrector ─────────────────────────────────────────────────
const FLUX_KEYS   = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']
const FLUX_SCALES = ['CHROM', 'MAJOR', 'MINOR', 'PENTA']

function FluxEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-flux-wrap">
      <div className="plugin-knobs-row">
        <Knob label="SPEED"    value={p.speed ?? 0.5}   min={0}   max={1}   step={0.01} onChange={v => onChange({ ...p, speed: v })} />
        <Knob label="AMOUNT"   value={p.amount ?? 0.8}  min={0}   max={1}   step={0.01} onChange={v => onChange({ ...p, amount: v })} />
        <Knob label="FORMANT"  value={p.formant ?? 0}   min={-1}  max={1}   step={0.01} onChange={v => onChange({ ...p, formant: v })} />
        <Knob label="DETUNE"   value={p.detune ?? 0}    min={-50} max={50}  step={1}    unit=" c" onChange={v => onChange({ ...p, detune: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">KEY</span>
          {FLUX_KEYS.map((k, i) => (
            <button key={k} className={`plugin-step-btn plugin-step-btn-sm ${Math.round(p.key ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, key: i })}>{k}</button>
          ))}
        </div>
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">SCALE</span>
          {FLUX_SCALES.map((s, i) => (
            <button key={s} className={`plugin-step-btn ${Math.round(p.scale ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, scale: i })}>{s}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">BYPASS</span>
          <button className={`plugin-step-btn ${p.bypass ? 'active' : ''}`}
            onClick={() => onChange({ ...p, bypass: p.bypass ? 0 : 1 })}>{p.bypass ? 'ON' : 'OFF'}</button>
        </div>
      </div>
    </div>
  )
}

// ── FS-Forge — Parallel Mix Compressor ───────────────────────────────────────
const FORGE_COLORS = ['CLEAN', 'VINTAGE', 'PUNCHY']
const FORGE_BANDS  = ['WIDE', 'LOW', 'MID', 'HIGH']

function ForgeEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-forge-wrap">
      <div className="plugin-knobs-row">
        <Knob label="THRESH"  value={p.threshold ?? -20} min={-60} max={0}   unit=" dB" onChange={v => onChange({ ...p, threshold: v })} />
        <Knob label="RATIO"   value={p.ratio ?? 6}       min={1}   max={20}  step={0.5} unit=":1" onChange={v => onChange({ ...p, ratio: v })} />
        <Knob label="ATTACK"  value={(p.attack ?? 0.005) * 1000} min={0.1} max={300} step={0.1} unit=" ms" onChange={v => onChange({ ...p, attack: v / 1000 })} />
        <Knob label="RELEASE" value={(p.release ?? 0.2) * 1000}  min={10}  max={2000} step={10}  unit=" ms" onChange={v => onChange({ ...p, release: v / 1000 })} />
        <Knob label="MAKEUP"  value={p.makeup ?? 3}      min={0}   max={24}  unit=" dB" onChange={v => onChange({ ...p, makeup: v })} />
        <Knob label="BLEND"   value={p.blend ?? 0.5}     min={0}   max={1}   step={0.01} onChange={v => onChange({ ...p, blend: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">COLOR</span>
          {FORGE_COLORS.map((c, i) => (
            <button key={c} className={`plugin-step-btn ${Math.round(p.color ?? 1) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, color: i })}>{c}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">BAND</span>
          {FORGE_BANDS.map((b, i) => (
            <button key={b} className={`plugin-step-btn ${Math.round(p.band ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, band: i })}>{b}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── FS-Crystal — Granular Freeze ──────────────────────────────────────────────
const CRYSTAL_MODES = ['FREEZE', 'SHIMMER', 'STUTTER']

function CrystalEditor({ plugin, onChange }: PluginEditorProps) {
  const p = plugin.params
  return (
    <div className="plugin-crystal-wrap">
      <div className="plugin-knobs-row">
        <Knob label="MIX"     value={p.mix ?? 0.3}     min={0}   max={1}   step={0.01} onChange={v => onChange({ ...p, mix: v })} />
        <Knob label="SIZE"    value={p.size ?? 4}       min={0.5} max={12}  step={0.1}  unit=" s" onChange={v => onChange({ ...p, size: v })} />
        <Knob label="DECAY"   value={p.decay ?? 0.7}   min={0}   max={1}   step={0.01} onChange={v => onChange({ ...p, decay: v })} />
        <Knob label="PITCH"   value={p.pitch ?? 0}     min={-12} max={12}  step={1}    unit=" st" onChange={v => onChange({ ...p, pitch: v })} />
        <Knob label="SCATTER" value={p.scatter ?? 0.3} min={0}   max={1}   step={0.01} onChange={v => onChange({ ...p, scatter: v })} />
        <Knob label="DENSITY" value={p.density ?? 0.8} min={0.1} max={1}   step={0.01} onChange={v => onChange({ ...p, density: v })} />
      </div>
      <div className="plugin-step-row">
        <div className="plugin-step-group">
          <span className="plugin-step-label">MODE</span>
          {CRYSTAL_MODES.map((m, i) => (
            <button key={m} className={`plugin-step-btn ${Math.round(p.mode ?? 0) === i ? 'active' : ''}`}
              onClick={() => onChange({ ...p, mode: i })}>{m}</button>
          ))}
        </div>
        <div className="plugin-step-group">
          <span className="plugin-step-label">REVERSE</span>
          <button className={`plugin-step-btn ${p.reverse ? 'active' : ''}`}
            onClick={() => onChange({ ...p, reverse: p.reverse ? 0 : 1 })}>{p.reverse ? 'ON' : 'OFF'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Plugin Slot ───────────────────────────────────────────────────────────────
interface PluginSlotProps {
  trackId: string
  plugin: Plugin
  slotIndex: number
}

function PluginSlot({ trackId, plugin, slotIndex }: PluginSlotProps) {
  const { updatePlugin, togglePlugin, removePlugin } = useProjectStore()
  const [expanded, setExpanded] = useState(false)

  const handleChange = useCallback((params: Record<string, number>) => {
    updatePlugin(trackId, plugin.id, params)
  }, [trackId, plugin.id, updatePlugin])

  function renderEditor() {
    switch (plugin.type) {
      case 'eq':           return <EQEditor plugin={plugin} onChange={handleChange} />
      case 'compressor':   return <CompressorEditor plugin={plugin} onChange={handleChange} />
      case 'limiter':      return <LimiterEditor plugin={plugin} onChange={handleChange} />
      case 'reverb':       return <ReverbEditor plugin={plugin} onChange={handleChange} />
      case 'delay':        return <DelayEditor plugin={plugin} onChange={handleChange} />
      case 'chorus':       return <ChorusEditor plugin={plugin} onChange={handleChange} />
      case 'distortion':   return <DistortionEditor plugin={plugin} onChange={handleChange} />
      // Elite Suite — Original 4
      case 'saturation':   return <SaturnEditor plugin={plugin} onChange={handleChange} />
      case 'bus_compressor': return <PressureEditor plugin={plugin} onChange={handleChange} />
      case 'spacetime':    return <SpacetimeEditor plugin={plugin} onChange={handleChange} />
      case 'transient':    return <TransientEditor plugin={plugin} onChange={handleChange} />
      // Elite Suite — New 10
      case 'expander':     return <NovaEditor plugin={plugin} onChange={handleChange} />
      case 'exciter':      return <PrismEditor plugin={plugin} onChange={handleChange} />
      case 'vibrato':      return <VibeEditor plugin={plugin} onChange={handleChange} />
      case 'stereo_width': return <PhaseEditor plugin={plugin} onChange={handleChange} />
      case 'tape':         return <OxideEditor plugin={plugin} onChange={handleChange} />
      case 'sub_enhancer': return <HadesEditor plugin={plugin} onChange={handleChange} />
      case 'noise_gate':   return <ShieldEditor plugin={plugin} onChange={handleChange} />
      case 'pitch_correct':return <FluxEditor plugin={plugin} onChange={handleChange} />
      case 'parallel_comp':return <ForgeEditor plugin={plugin} onChange={handleChange} />
      case 'granular':     return <CrystalEditor plugin={plugin} onChange={handleChange} />
      // AI Plugin Suite
      case 'fs_oracle':
      case 'fs_clone':
      case 'fs_architect':
      case 'fs_phantom':
      case 'fs_nerve':
      case 'fs_bpmfinder':
      // Experimental AI Suite
      case 'fs_ghost':
      case 'fs_prophet':
      case 'fs_void':
      case 'fs_alchemy':   return renderAiPlugin(plugin, handleChange)
      // Flowstate Pro Suite
      default: return renderFlowstatePlugin(plugin, handleChange)
    }
  }

  const typeColors: Record<string, string> = {
    // Classic
    eq: '#06b6d4', compressor: '#10b981', limiter: '#ef4444',
    reverb: '#a855f7', delay: '#3b82f6', chorus: '#ec4899',
    distortion: '#f59e0b',
    // Elite — Original 4
    saturation: '#f97316', bus_compressor: '#22d3ee',
    spacetime: '#c084fc', transient: '#4ade80',
    // Elite — New 10
    expander: '#84cc16', exciter: '#f0abfc', vibrato: '#fb923c',
    stereo_width: '#38bdf8', tape: '#d97706', sub_enhancer: '#7c3aed',
    noise_gate: '#14b8a6', pitch_correct: '#e879f9', parallel_comp: '#facc15',
    granular: '#818cf8',
    // AI Plugin Suite
    fs_oracle: '#d946ef', fs_clone: '#06b6d4', fs_architect: '#22c55e',
    fs_phantom: '#8b5cf6', fs_nerve: '#f59e0b', fs_bpmfinder: '#f97316',
    // Experimental AI Suite
    fs_ghost: '#a855f7', fs_prophet: '#f59e0b', fs_void: '#6366f1', fs_alchemy: '#d97706',
    // Flowstate Pro Suite
    fs_proq: '#a855f7', fs_resonance: '#10b981', fs_vintage_verb: '#818cf8',
    fs_echo: '#f59e0b', fs_tuner: '#e879f9', fs_mastering: '#facc15',
    fs_spacer: '#38bdf8', fs_peak_limiter: '#ef4444', fs_alter: '#22d3ee',
    fs_glitch: '#f97316', fs_wavetable: '#3b82f6', fs_multiband_comp: '#fb923c',
    fs_tape_delay: '#f59e0b', fs_vocal_enhance: '#c084fc', fs_dimension: '#22d3ee',
  }
  const color = typeColors[plugin.type] ?? '#6b7280'

  return (
    <div className={`plugin-slot-v2 ${plugin.enabled ? '' : 'plugin-bypassed'}`} style={{ borderColor: expanded ? color + '66' : undefined }}>
      <div className="plugin-slot-v2-header">
        <span className="plugin-slot-num" style={{ color }}>{slotIndex + 1}</span>
        <div
          className="plugin-power-dot"
          style={{ background: plugin.enabled ? color : undefined }}
          onClick={() => togglePlugin(trackId, plugin.id)}
          title={plugin.enabled ? 'Bypass' : 'Enable'}
        />
        <span className="plugin-slot-name" style={{ color: plugin.enabled ? 'var(--text-p)' : 'var(--text-m)' }}>
          {plugin.name}
        </span>
        <button className="plugin-expand-btn" onClick={() => setExpanded(e => !e)}>
          {expanded ? '▲' : '▼'}
        </button>
        <button className="plugin-remove-btn" onClick={() => removePlugin(trackId, plugin.id)} title="Remove">✕</button>
      </div>
      {expanded && (
        <div className="plugin-slot-v2-body">
          {renderEditor()}
        </div>
      )}
    </div>
  )
}

// ── Plugin Rack ───────────────────────────────────────────────────────────────
interface PluginRackProps {
  track: Track
}

// ── Categorized plugin definitions ──────────────────────────────────────────
interface PluginEntry { key: string; name: string; type: string; desc: string }

const CLASSIC_CATEGORIES: { label: string; color: string; icon: string; plugins: PluginEntry[] }[] = [
  {
    label: 'EQ & Filter',
    color: '#06b6d4',
    icon: '◈',
    plugins: [
      { key: 'eq',          name: 'FS-EQ3',        type: 'eq',         desc: '3-band parametric EQ' },
    ],
  },
  {
    label: 'Dynamics',
    color: '#10b981',
    icon: '⟁',
    plugins: [
      { key: 'compressor',  name: 'FS-Comp',        type: 'compressor', desc: 'Classic VCA compressor' },
      { key: 'limiter',     name: 'FS-Limiter',     type: 'limiter',    desc: 'Brick-wall limiter' },
    ],
  },
  {
    label: 'Reverb & Delay',
    color: '#a855f7',
    icon: '◉',
    plugins: [
      { key: 'reverb',      name: 'FS-Reverb',      type: 'reverb',     desc: 'Algorithmic plate reverb' },
      { key: 'delay',       name: 'FS-Delay',       type: 'delay',      desc: 'Stereo delay + feedback' },
    ],
  },
  {
    label: 'Modulation',
    color: '#ec4899',
    icon: '∿',
    plugins: [
      { key: 'chorus',      name: 'FS-Chorus',      type: 'chorus',     desc: 'Modulated chorus' },
    ],
  },
  {
    label: 'Distortion',
    color: '#f59e0b',
    icon: '⚡',
    plugins: [
      { key: 'distortion',  name: 'FS-Bitcrusher',  type: 'distortion', desc: 'Lo-fi bit depth reducer' },
    ],
  },
]

const ELITE_CATEGORIES: { label: string; color: string; icon: string; plugins: PluginEntry[] }[] = [
  {
    label: 'Saturation',
    color: '#f97316',
    icon: '◈',
    plugins: [
      { key: 'saturation',    name: 'FS-Saturn',    type: 'saturation',    desc: 'Multiband harmonic saturation' },
      { key: 'tape',          name: 'FS-Oxide',     type: 'tape',          desc: 'Analog tape emulation' },
    ],
  },
  {
    label: 'Dynamics',
    color: '#22d3ee',
    icon: '⟁',
    plugins: [
      { key: 'bus_compressor',name: 'FS-Pressure',  type: 'bus_compressor',desc: 'Vintage SSL/Neve bus comp' },
      { key: 'transient',     name: 'FS-Transient', type: 'transient',     desc: 'Attack/sustain designer' },
      { key: 'expander',      name: 'FS-Nova',      type: 'expander',      desc: 'Multiband expander/gate' },
      { key: 'noise_gate',    name: 'FS-Shield',    type: 'noise_gate',    desc: 'Precision noise gate' },
      { key: 'parallel_comp', name: 'FS-Forge',     type: 'parallel_comp', desc: 'NY parallel compressor' },
    ],
  },
  {
    label: 'Reverb & Space',
    color: '#c084fc',
    icon: '◉',
    plugins: [
      { key: 'spacetime',     name: 'FS-Spacetime', type: 'spacetime',     desc: 'Shimmer reverb + ping-pong' },
      { key: 'granular',      name: 'FS-Crystal',   type: 'granular',      desc: 'Granular freeze reverb' },
    ],
  },
  {
    label: 'Modulation',
    color: '#fb923c',
    icon: '∿',
    plugins: [
      { key: 'vibrato',       name: 'FS-Vibe',      type: 'vibrato',       desc: 'Tape vibrato/chorus' },
    ],
  },
  {
    label: 'Pitch & Tone',
    color: '#e879f9',
    icon: '♪',
    plugins: [
      { key: 'pitch_correct', name: 'FS-Flux',      type: 'pitch_correct', desc: 'Real-time pitch correction' },
      { key: 'exciter',       name: 'FS-Prism',     type: 'exciter',       desc: 'Harmonic exciter' },
      { key: 'sub_enhancer',  name: 'FS-Hades',     type: 'sub_enhancer',  desc: 'Sub-harmonic enhancer' },
    ],
  },
  {
    label: 'Stereo',
    color: '#38bdf8',
    icon: '↔',
    plugins: [
      { key: 'stereo_width',  name: 'FS-Phase',     type: 'stereo_width',  desc: 'M/S stereo widener' },
    ],
  },
]

const PRO_CATEGORIES: { label: string; color: string; icon: string; plugins: PluginEntry[] }[] = [
  {
    label: 'EQ & Filtering',
    color: '#a855f7',
    icon: '◈',
    plugins: [
      { key: 'fs_proq',          name: 'FS-ProQ',      type: 'fs_proq',          desc: '8-band surgical + dynamic EQ' },
      { key: 'fs_resonance',     name: 'FS-Resonate',  type: 'fs_resonance',     desc: 'Spectral resonance suppressor' },
      { key: 'fs_spacer',        name: 'FS-Spacer',    type: 'fs_spacer',        desc: 'Sidechain spectral carver' },
    ],
  },
  {
    label: 'Dynamics',
    color: '#ef4444',
    icon: '⟁',
    plugins: [
      { key: 'fs_multiband_comp',name: 'FS-Crush',     type: 'fs_multiband_comp',desc: '4-band multiband compressor' },
      { key: 'fs_peak_limiter',  name: 'FS-Apex',      type: 'fs_peak_limiter',  desc: 'True-peak limiter + LUFS' },
    ],
  },
  {
    label: 'Reverb & Delay',
    color: '#818cf8',
    icon: '◉',
    plugins: [
      { key: 'fs_vintage_verb',  name: 'FS-Cosmos',    type: 'fs_vintage_verb',  desc: '18-mode algorithmic reverb' },
      { key: 'fs_echo',          name: 'FS-Echo',      type: 'fs_echo',          desc: 'Tape/BBD/Galaxy delay' },
      { key: 'fs_tape_delay',    name: 'FS-Reel',      type: 'fs_tape_delay',    desc: 'Analog tape delay + flutter' },
    ],
  },
  {
    label: 'Pitch & Voice',
    color: '#e879f9',
    icon: '♪',
    plugins: [
      { key: 'fs_tuner',         name: 'FS-Voice',     type: 'fs_tuner',         desc: 'Real-time pitch/formant' },
      { key: 'fs_vocal_enhance', name: 'FS-Aura',      type: 'fs_vocal_enhance', desc: 'Intelligent vocal enhancer' },
      { key: 'fs_alter',         name: 'FS-Mutate',    type: 'fs_alter',         desc: 'Vocal transformer' },
    ],
  },
  {
    label: 'Modulation',
    color: '#22d3ee',
    icon: '∿',
    plugins: [
      { key: 'fs_dimension',     name: 'FS-Dimension', type: 'fs_dimension',     desc: 'Stereo chorus expander' },
    ],
  },
  {
    label: 'Mastering',
    color: '#facc15',
    icon: '★',
    plugins: [
      { key: 'fs_mastering',     name: 'FS-Master',    type: 'fs_mastering',     desc: '4-section mastering suite' },
    ],
  },
  {
    label: 'Creative FX',
    color: '#f97316',
    icon: '⚡',
    plugins: [
      { key: 'fs_glitch',        name: 'FS-Glitch',    type: 'fs_glitch',        desc: '16-step multi-FX sequencer' },
      { key: 'fs_wavetable',     name: 'FS-Spectrum',  type: 'fs_wavetable',     desc: 'Wavetable oscillator layer' },
    ],
  },
]

const AI_CATEGORIES: { label: string; color: string; icon: string; plugins: PluginEntry[] }[] = [
  {
    label: 'Analysis',
    color: '#f97316',
    icon: '◎',
    plugins: [
      { key: 'fs_bpmfinder', name: 'FS-BPM Finder', type: 'fs_bpmfinder', desc: 'Live BPM detection + tap tempo' },
    ],
  },
  {
    label: 'Mastering AI',
    color: '#d946ef',
    icon: '★',
    plugins: [
      { key: 'fs_oracle',    name: 'FS-Oracle',     type: 'fs_oracle',    desc: 'AI mastering suite + Claude 3.5' },
    ],
  },
  {
    label: 'Composition AI',
    color: '#22c55e',
    icon: '♪',
    plugins: [
      { key: 'fs_architect', name: 'FS-Architect',  type: 'fs_architect', desc: 'Chord/melody AI generator' },
    ],
  },
  {
    label: 'Timbre & Space',
    color: '#06b6d4',
    icon: '◈',
    plugins: [
      { key: 'fs_clone',     name: 'FS-Clone',      type: 'fs_clone',     desc: 'AI timbre transfer' },
      { key: 'fs_phantom',   name: 'FS-Phantom',    type: 'fs_phantom',   desc: 'AI stereo reconstructor' },
    ],
  },
  {
    label: 'Dynamics AI',
    color: '#f59e0b',
    icon: '⟁',
    plugins: [
      { key: 'fs_nerve',     name: 'FS-Nerve',      type: 'fs_nerve',     desc: 'Adaptive sidechain AI' },
    ],
  },
  {
    label: '🧪 Experimental',
    color: '#f59e0b',
    icon: '⚗',
    plugins: [
      { key: 'fs_ghost',   name: 'FS-Ghost',   type: 'fs_ghost',   desc: 'AI phantom harmonic sculptor — summons ghost overtones' },
      { key: 'fs_prophet', name: 'FS-Prophet', type: 'fs_prophet', desc: 'AI future-caster — synthesizes clip continuation' },
      { key: 'fs_void',    name: 'FS-Void',    type: 'fs_void',    desc: 'Anti-sound negative space filler' },
      { key: 'fs_alchemy', name: 'FS-Alchemy', type: 'fs_alchemy', desc: 'Material transmutation — turn Water into Obsidian' },
    ],
  },
]

// ── Custom scrollable dropdown component ─────────────────────────────────────
interface PluginDropdownProps {
  onSelect: (key: string) => void
  onClose: () => void
}

function PluginDropdown({ onSelect, onClose }: PluginDropdownProps) {
  const [activeTab, setActiveTab] = useState<'classic'|'elite'|'pro'|'ai'>('classic')
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  const tabs: { id: 'classic'|'elite'|'pro'|'ai'; label: string; color: string }[] = [
    { id: 'classic', label: 'CLASSIC',        color: '#06b6d4' },
    { id: 'elite',   label: '★ ELITE',        color: '#f97316' },
    { id: 'pro',     label: '⚡ PRO',          color: '#a855f7' },
    { id: 'ai',      label: '🤖 AI',           color: '#22c55e' },
  ]

  const cats =
    activeTab === 'classic' ? CLASSIC_CATEGORIES :
    activeTab === 'elite'   ? ELITE_CATEGORIES   :
    activeTab === 'pro'     ? PRO_CATEGORIES      : AI_CATEGORIES

  return (
    <div ref={menuRef} className="pdd-overlay">
      {/* Tab bar */}
      <div className="pdd-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`pdd-tab ${activeTab === t.id ? 'pdd-tab-active' : ''}`}
            style={activeTab === t.id ? { color: t.color, borderBottomColor: t.color } : {}}
            onClick={() => { setActiveTab(t.id); setExpandedCat(null) }}
          >{t.label}</button>
        ))}
      </div>

      {/* Category list — scrollable */}
      <div className="pdd-scroll">
        {cats.map(cat => (
          <div key={cat.label} className="pdd-cat">
            {/* Category header */}
            <button
              className="pdd-cat-header"
              onClick={() => setExpandedCat(expandedCat === cat.label ? null : cat.label)}
            >
              <span className="pdd-cat-icon" style={{ color: cat.color }}>{cat.icon}</span>
              <span className="pdd-cat-label">{cat.label}</span>
              <span className="pdd-cat-count">{cat.plugins.length}</span>
              <span className="pdd-cat-arrow">{expandedCat === cat.label ? '▲' : '▼'}</span>
            </button>

            {/* Plugin list inside category */}
            {expandedCat === cat.label && (
              <div className="pdd-plugin-list">
                {cat.plugins.map(plugin => (
                  <button
                    key={plugin.key}
                    className="pdd-plugin-row"
                    onClick={() => onSelect(plugin.key)}
                  >
                    <div className="pdd-plugin-dot" style={{ background: cat.color }} />
                    <div className="pdd-plugin-info">
                      <span className="pdd-plugin-name" style={{ color: cat.color }}>{plugin.name}</span>
                      <span className="pdd-plugin-desc">{plugin.desc}</span>
                    </div>
                    <span className="pdd-plugin-add">+</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PluginRack({ track }: PluginRackProps) {
  const { addPlugin } = useProjectStore()
  const [showAdd, setShowAdd] = useState(false)

  const allDefs: Record<string, { name: string; type: string; params: Record<string, number> }> = {
    ...PLUGIN_DEFAULTS,
    ...FLOWSTATE_PRO_DEFAULTS,
    ...AI_PLUGIN_DEFAULTS,
  }

  const addNewPlugin = useCallback((key: string) => {
    const def = allDefs[key]
    if (!def) return
    addPlugin(track.id, {
      id: `plugin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: def.name,
      type: def.type as any,
      enabled: true,
      params: { ...def.params },
    })
    setShowAdd(false)
  }, [track.id, addPlugin, allDefs])

  return (
    <div className="plugin-rack">
      <div className="plugin-rack-header">
        <span className="plugin-rack-title">INSERT EFFECTS</span>
        <button
          className="plugin-rack-add-btn"
          onClick={() => setShowAdd(s => !s)}
          title="Add Plugin"
        >
          + ADD
        </button>
      </div>

      {showAdd && (
        <PluginDropdown
          onSelect={addNewPlugin}
          onClose={() => setShowAdd(false)}
        />
      )}

      <div className="plugin-rack-slots">
        {track.plugins.length === 0 && (
          <div className="plugin-rack-empty">No effects — click + ADD to insert</div>
        )}
        {track.plugins.map((plugin, i) => (
          <PluginSlot key={plugin.id} trackId={track.id} plugin={plugin} slotIndex={i} />
        ))}
      </div>
    </div>
  )
}
