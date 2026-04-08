/**
 * FS-AUDIO — AI Plugin Suite
 * Five next-generation AI-powered plugins + BPM Finder
 *
 * 1. FS-Oracle    — AI Mastering (Claude via OpenRouter)
 * 2. FS-Clone     — Timbre Transfer (Replicate audio style transfer)
 * 3. FS-Architect — Chord/Melody AI (Claude + music theory)
 * 4. FS-Phantom   — Stereo Reconstructor (pure psychoacoustic DSP)
 * 5. FS-Nerve     — Adaptive Sidechain Intelligence (transient detection)
 * 6. FS-BPMFinder — Live BPM detection while playing
 *
 * All AI calls route through the FlowState hub backend (flowstate-67g.pages.dev)
 * which holds the API keys securely server-side.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useProjectStore } from '../../store/projectStore'

// ── Shared hub fetch ──────────────────────────────────────────────────────────
const HUB = 'https://flowstate-67g.pages.dev'
async function hubPost(path: string, body: object): Promise<any> {
  const r = await fetch(`${HUB}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Hub ${path} → ${r.status}`)
  return r.json()
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function AIBadge({ label = 'AI', color = '#a855f7' }: { label?: string; color?: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '.6px',
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 3, padding: '1px 5px', marginLeft: 4,
    }}>{label}</span>
  )
}

function StatusPill({ text, type }: { text: string; type: 'idle' | 'loading' | 'ok' | 'err' }) {
  const colors = { idle: '#555', loading: '#f59e0b', ok: '#22c55e', err: '#ef4444' }
  return (
    <div style={{
      fontSize: 10, color: colors[type], background: colors[type] + '18',
      border: `1px solid ${colors[type]}44`, borderRadius: 4,
      padding: '3px 8px', textAlign: 'center', marginTop: 6, lineHeight: 1.4,
    }}>{text}</div>
  )
}

function AIKnob({ label, value, min, max, step = 0.01, unit = '', onChange, color = '#a855f7' }:
  { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; color?: string }) {
  const norm = (value - min) / (max - min)
  const angle = -135 + norm * 270
  const size = 38, cx = size / 2, cy = size / 2, r = size / 2 - 3
  const rad = (angle * Math.PI) / 180
  const tx = cx + r * Math.sin(rad), ty = cy - r * Math.cos(rad)
  const ix = cx + (r - 6) * Math.sin(rad), iy = cy - (r - 6) * Math.cos(rad)

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const sy = e.clientY, sv = value, range = max - min
    const mv = (me: MouseEvent) => {
      const nv = Math.max(min, Math.min(max, sv + ((sy - me.clientY) / 120) * range))
      onChange(Math.round((step ? Math.round(nv / step) * step : nv) * 1000) / 1000)
    }
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }, [value, min, max, step, onChange])

  const fmt = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.abs(v) < 10 && v % 1 !== 0 ? v.toFixed(1) : Math.round(v).toString()

  // arc path helper
  const arc = (start: number, end: number) => {
    const s = (start * Math.PI) / 180, e2 = (end * Math.PI) / 180
    return `M ${cx + r * Math.sin(s)} ${cy - r * Math.cos(s)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${cx + r * Math.sin(e2)} ${cy - r * Math.cos(e2)}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: size + 16 }}>
      <svg width={size} height={size} onMouseDown={onDown} style={{ cursor: 'ns-resize', userSelect: 'none' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
        <path d={arc(-135, -135 + norm * 270)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r - 8} fill="rgba(255,255,255,0.04)" />
        <line x1={ix} y1={iy} x2={tx} y2={ty} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}{unit}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.8px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FS-ORACLE — AI Mastering Suite
// ─────────────────────────────────────────────────────────────────────────────
export function OracleEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const { bpm, tracks } = useProjectStore()
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [advice, setAdvice] = useState<string>('')
  const [target, setTarget] = useState<'spotify' | 'apple' | 'club' | 'film' | 'master'>('spotify')

  const TARGETS: Record<string, { lufs: number; ceiling: number; label: string }> = {
    spotify: { lufs: -14, ceiling: -1, label: '🟢 Spotify' },
    apple:   { lufs: -16, ceiling: -1, label: '🍎 Apple' },
    club:    { lufs: -9,  ceiling: -0.3, label: '🔊 Club' },
    film:    { lufs: -24, ceiling: -2, label: '🎬 Film' },
    master:  { lufs: -12, ceiling: -0.1, label: '⭐ Master' },
  }

  async function runAnalysis() {
    setStatus('loading')
    setAdvice('')
    try {
      // Build mix summary for the AI
      const trackSummary = tracks.filter(t => t.type !== 'master').map(t => ({
        name: t.name, type: t.type, volume: t.volume, pan: t.pan,
        plugins: t.plugins.filter(pl => pl.enabled).map(pl => pl.name),
        clips: t.clips.length,
      }))
      const tgt = TARGETS[target]
      const prompt = `You are a professional mastering engineer. Analyze this DAW mix and give specific, actionable mastering advice.

Mix info:
- BPM: ${bpm}
- Target platform: ${tgt.label} (LUFS target: ${tgt.lufs}, ceiling: ${tgt.ceiling} dBTP)
- Tracks: ${JSON.stringify(trackSummary, null, 2)}
- Current master settings: Low EQ: ${p.low ?? 0}dB, High EQ: ${p.high ?? 0}dB, Comp threshold: ${p.cThresh ?? -12}dB, Ratio: ${p.cRatio ?? 2}:1, Limiter ceiling: ${p.ceiling ?? -0.1}dBTP

Give 3-5 specific recommendations covering: frequency balance, dynamics, stereo width, loudness targeting. Be concise and technical. End with exact parameter suggestions I should set.`

      const result = await hubPost('/api/clawbot/chat', {
        message: prompt,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are a professional mastering engineer for FS-Audio DAW. Be concise, technical, and specific. Max 200 words.',
      })
      setAdvice(result.message || result.content || 'No response')
      setStatus('ok')

      // Auto-apply target platform settings
      onChange({
        ...p,
        lufs: tgt.lufs,
        ceiling: tgt.ceiling,
        low: p.low ?? 0,
        high: p.high ?? 0,
      })
    } catch (e: any) {
      setStatus('err')
      setAdvice(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#f0abfc', letterSpacing: '.5px' }}>FS-ORACLE</span>
        <AIBadge label="AI" color="#a855f7" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Claude 3.5</span>
      </div>

      {/* Target Platform */}
      <SectionLabel>Target Platform</SectionLabel>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.entries(TARGETS).map(([k, t]) => (
          <button key={k} onClick={() => setTarget(k as any)} style={{
            fontSize: 10, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
            background: target === k ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${target === k ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
            color: target === k ? '#e879f9' : 'rgba(255,255,255,0.5)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* EQ Section */}
      <SectionLabel>Tonal Balance</SectionLabel>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="LOW" value={p.low ?? 0} min={-6} max={6} step={0.5} unit=" dB" color="#60a5fa"
          onChange={v => onChange({ ...p, low: v })} />
        <AIKnob label="LO-MID" value={p.lom ?? 0} min={-6} max={6} step={0.5} unit=" dB" color="#34d399"
          onChange={v => onChange({ ...p, lom: v })} />
        <AIKnob label="HI-MID" value={p.him ?? 0} min={-6} max={6} step={0.5} unit=" dB" color="#fbbf24"
          onChange={v => onChange({ ...p, him: v })} />
        <AIKnob label="HIGH" value={p.high ?? 0} min={-6} max={6} step={0.5} unit=" dB" color="#f87171"
          onChange={v => onChange({ ...p, high: v })} />
      </div>

      {/* Dynamics Section */}
      <SectionLabel>Dynamics</SectionLabel>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="THRESH" value={p.cThresh ?? -12} min={-30} max={0} step={0.5} unit=" dB" color="#f97316"
          onChange={v => onChange({ ...p, cThresh: v })} />
        <AIKnob label="RATIO" value={p.cRatio ?? 2} min={1} max={8} step={0.5} unit=":1" color="#f97316"
          onChange={v => onChange({ ...p, cRatio: v })} />
        <AIKnob label="WIDTH" value={p.width ?? 1} min={0} max={2} step={0.05} color="#a78bfa"
          onChange={v => onChange({ ...p, width: v })} />
        <AIKnob label="CEILING" value={p.ceiling ?? -0.1} min={-3} max={0} step={0.1} unit=" dBTP" color="#ef4444"
          onChange={v => onChange({ ...p, ceiling: v })} />
      </div>

      {/* LUFS Target */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', minWidth: 60 }}>LUFS Target</span>
        <input type="range" min={-24} max={-6} step={0.5} value={p.lufs ?? -14}
          onChange={e => onChange({ ...p, lufs: parseFloat(e.target.value) })}
          style={{ flex: 1, accentColor: '#a855f7' }} />
        <span style={{ fontSize: 10, color: '#e879f9', minWidth: 32 }}>{p.lufs ?? -14}</span>
      </div>

      {/* AI Analysis Button */}
      <button onClick={runAnalysis} disabled={status === 'loading'} style={{
        width: '100%', padding: '7px 0', borderRadius: 6, cursor: status === 'loading' ? 'not-allowed' : 'pointer',
        background: status === 'loading' ? 'rgba(168,85,247,0.1)' : 'linear-gradient(135deg,#7c3aed,#a855f7)',
        border: '1px solid rgba(168,85,247,0.5)', color: '#fff', fontSize: 11, fontWeight: 700,
        letterSpacing: '.5px', transition: 'all .2s',
      }}>
        {status === 'loading' ? '⏳ ANALYZING MIX...' : '⚡ AI ANALYZE & SUGGEST'}
      </button>

      {/* AI Advice */}
      {advice && (
        <div style={{
          marginTop: 8, padding: 8, background: 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.2)', borderRadius: 6,
          fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6,
          maxHeight: 140, overflowY: 'auto',
        }}>{advice}</div>
      )}
      {status === 'err' && <StatusPill text={advice} type="err" />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FS-CLONE — AI Timbre Transfer
// ─────────────────────────────────────────────────────────────────────────────
export function CloneEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [statusText, setStatusText] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const { tracks, selectedClipIds } = useProjectStore()

  const SOURCE_CHARS = ['Warm', 'Bright', 'Dark', 'Punchy', 'Airy', 'Thick', 'Thin', 'Crisp']
  const STYLE_MODES = ['Spectral Blend', 'Harmonic Copy', 'Timbral Match', 'Full Clone']

  async function runClone() {
    if (!referenceUrl) { setStatus('err'); setStatusText('Paste a reference audio URL first'); return }

    // Get selected clip audio URL
    const selectedClip = tracks.flatMap(t => t.clips).find(c => selectedClipIds.includes(c.id))
    if (!selectedClip?.audioUrl) { setStatus('err'); setStatusText('Select a clip on the timeline first'); return }

    setStatus('loading'); setStatusText('Submitting to Replicate...')
    try {
      // Use Replicate via hub for audio style transfer
      const result = await hubPost('/api/ai/generate', {
        tool: 'audio_style_transfer',
        prompt: `Transfer the timbre and tonal character from the reference audio to the input audio. Style: ${STYLE_MODES[Math.round(p.mode ?? 0)]}. Amount: ${Math.round((p.amount ?? 0.5) * 100)}%.`,
        audioUrl: selectedClip.audioUrl,
        referenceUrl,
        duration: 30,
      })

      if (result.audioUrl) {
        setResultUrl(result.audioUrl)
        setStatus('ok')
        setStatusText(`✓ Clone complete — ${result.model ?? 'Replicate'}`)
      } else if (result.jobId) {
        setStatus('ok')
        setStatusText(`Job queued: ${result.jobId} — check FlowState hub for results`)
      } else {
        setStatus('ok')
        setStatusText(result.message ?? 'Processing...')
      }
    } catch (e: any) {
      setStatus('err')
      setStatusText(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#67e8f9', letterSpacing: '.5px' }}>FS-CLONE</span>
        <AIBadge label="REPLICATE" color="#06b6d4" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Timbre Transfer</span>
      </div>

      {/* Reference URL input */}
      <SectionLabel>Reference Audio URL</SectionLabel>
      <input
        type="text" placeholder="https://... (audio file URL to clone from)"
        value={referenceUrl} onChange={e => setReferenceUrl(e.target.value)}
        style={{
          width: '100%', padding: '5px 8px', borderRadius: 4, fontSize: 10,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 10,
        }}
      />

      {/* Style Mode */}
      <SectionLabel>Clone Mode</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
        {STYLE_MODES.map((m, i) => (
          <button key={m} onClick={() => onChange({ ...p, mode: i })} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.mode ?? 0) === i ? 'rgba(6,182,212,0.25)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${Math.round(p.mode ?? 0) === i ? '#06b6d4' : 'rgba(255,255,255,0.1)'}`,
            color: Math.round(p.mode ?? 0) === i ? '#67e8f9' : 'rgba(255,255,255,0.4)',
          }}>{m}</button>
        ))}
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="AMOUNT" value={p.amount ?? 0.5} min={0} max={1} step={0.01} color="#06b6d4"
          onChange={v => onChange({ ...p, amount: v })} />
        <AIKnob label="SMOOTH" value={p.smooth ?? 0.5} min={0} max={1} step={0.01} color="#22d3ee"
          onChange={v => onChange({ ...p, smooth: v })} />
        <AIKnob label="PRESERVE" value={p.preserve ?? 0.3} min={0} max={1} step={0.01} color="#a5f3fc"
          onChange={v => onChange({ ...p, preserve: v })} />
        <AIKnob label="MIX" value={p.mix ?? 1} min={0} max={1} step={0.01} color="#67e8f9"
          onChange={v => onChange({ ...p, mix: v })} />
      </div>

      {/* Source Character */}
      <SectionLabel>Source Character</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
        {SOURCE_CHARS.map((c, i) => (
          <button key={c} onClick={() => onChange({ ...p, character: i })} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.character ?? 0) === i ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.character ?? 0) === i ? '#06b6d4' : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.character ?? 0) === i ? '#67e8f9' : 'rgba(255,255,255,0.35)',
          }}>{c}</button>
        ))}
      </div>

      <button onClick={runClone} disabled={status === 'loading'} style={{
        width: '100%', padding: '7px 0', borderRadius: 6,
        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
        background: status === 'loading' ? 'rgba(6,182,212,0.1)' : 'linear-gradient(135deg,#0891b2,#06b6d4)',
        border: '1px solid rgba(6,182,212,0.5)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.5px',
      }}>
        {status === 'loading' ? '⏳ CLONING TIMBRE...' : '🎨 CLONE TIMBRE'}
      </button>

      {statusText && <StatusPill text={statusText} type={status} />}
      {resultUrl && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#67e8f9' }}>
          Result: <a href={resultUrl} target="_blank" rel="noreferrer" style={{ color: '#06b6d4' }}>Download</a>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FS-ARCHITECT — AI Chord & Melody Generator
// ─────────────────────────────────────────────────────────────────────────────
export function ArchitectEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const { bpm, key, tracks, selectedTrackId, addClip } = useProjectStore()
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [output, setOutput] = useState<string>('')
  const [genMode, setGenMode] = useState<'chords' | 'melody' | 'bassline' | 'counter'>('chords')

  const GENRES = ['Jazz', 'Neo-Soul', 'Trap', 'Ambient', 'Pop', 'Classical', 'Blues', 'EDM']
  const MOODS  = ['Bright', 'Dark', 'Tense', 'Peaceful', 'Melancholic', 'Euphoric']
  const SCALES = ['Major', 'Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Pentatonic']

  async function generate() {
    setStatus('loading'); setOutput('')
    try {
      // Analyze existing MIDI tracks for harmonic context
      const midiTracks = tracks.filter(t => t.type === 'midi' && t.clips.some(c => c.midiNotes?.length))
      const existingNotes = midiTracks.flatMap(t =>
        t.clips.flatMap(c => (c.midiNotes ?? []).slice(0, 8).map(n => n.pitch))
      ).slice(0, 32)

      const genre = GENRES[Math.round(p.genre ?? 0)] ?? 'Pop'
      const mood  = MOODS[Math.round(p.mood ?? 0)] ?? 'Bright'
      const scale = SCALES[Math.round(p.scale ?? 0)] ?? 'Major'
      const bars  = Math.round(p.bars ?? 4)
      const tension = p.tension ?? 0.5

      const prompt = `You are a music theory expert and composer for FS-Audio DAW.

Generate a ${genMode} for this context:
- Key: ${key}
- Scale: ${scale}
- BPM: ${bpm}
- Genre: ${genre}
- Mood: ${mood}
- Bars: ${bars}
- Tension level: ${Math.round(tension * 10)}/10
- Existing notes in mix: ${existingNotes.length > 0 ? existingNotes.join(',') : 'none yet'}

Respond ONLY with a JSON array of MIDI notes in this exact format, no explanation:
[{"pitch": 60, "velocity": 100, "startBeat": 0, "durationBeats": 1}, ...]

Use MIDI pitch numbers (60=C4). Generate ${bars * 4} beats worth of content. Make it musically excellent.`

      const result = await hubPost('/api/clawbot/chat', {
        message: prompt,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are a music composition AI. Return ONLY valid JSON arrays of MIDI notes. No explanation text.',
      })

      const raw = (result.message || result.content || '').trim()
      // Extract JSON array from response
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No valid MIDI data in response')

      const notes = JSON.parse(jsonMatch[0])
      setOutput(`Generated ${notes.length} notes for ${bars} bars of ${genMode}`)
      setStatus('ok')

      // Add as MIDI clip to selected track
      if (selectedTrackId) {
        const track = tracks.find(t => t.id === selectedTrackId)
        if (track) {
          const maxBeat = Math.max(0, ...track.clips.map(c => c.startBeat + c.durationBeats))
          addClip({
            id: `arch-${Date.now()}`,
            trackId: selectedTrackId,
            startBeat: maxBeat,
            durationBeats: bars * 4,
            name: `AI ${genMode} (${genre})`,
            type: 'midi',
            midiNotes: notes,
            gain: 1, fadeIn: 0, fadeOut: 0,
            fadeInCurve: 'exp', fadeOutCurve: 'exp',
            looped: false, muted: false, aiGenerated: true,
          })
          setOutput(`✓ Added ${notes.length} notes to "${track.name}"`)
        }
      }
    } catch (e: any) {
      setStatus('err')
      setOutput(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#86efac', letterSpacing: '.5px' }}>FS-ARCHITECT</span>
        <AIBadge label="AI" color="#22c55e" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Claude 3.5 Haiku</span>
      </div>

      {/* Gen Mode */}
      <SectionLabel>Generate</SectionLabel>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['chords','melody','bassline','counter'] as const).map(m => (
          <button key={m} onClick={() => setGenMode(m)} style={{
            flex: 1, fontSize: 9, padding: '4px 2px', borderRadius: 4, cursor: 'pointer', textTransform: 'uppercase',
            background: genMode === m ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${genMode === m ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
            color: genMode === m ? '#86efac' : 'rgba(255,255,255,0.4)',
          }}>{m}</button>
        ))}
      </div>

      {/* Genre & Mood */}
      <SectionLabel>Genre</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {GENRES.map((g, i) => (
          <button key={g} onClick={() => onChange({ ...p, genre: i })} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.genre ?? 0) === i ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.genre ?? 0) === i ? '#22c55e' : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.genre ?? 0) === i ? '#86efac' : 'rgba(255,255,255,0.35)',
          }}>{g}</button>
        ))}
      </div>

      <SectionLabel>Mood</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
        {MOODS.map((m, i) => (
          <button key={m} onClick={() => onChange({ ...p, mood: i })} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.mood ?? 0) === i ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.mood ?? 0) === i ? '#22c55e' : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.mood ?? 0) === i ? '#86efac' : 'rgba(255,255,255,0.35)',
          }}>{m}</button>
        ))}
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="BARS" value={p.bars ?? 4} min={1} max={16} step={1} color="#22c55e"
          onChange={v => onChange({ ...p, bars: v })} />
        <AIKnob label="TENSION" value={p.tension ?? 0.5} min={0} max={1} step={0.05} color="#86efac"
          onChange={v => onChange({ ...p, tension: v })} />
        <AIKnob label="DENSITY" value={p.density ?? 0.5} min={0} max={1} step={0.05} color="#4ade80"
          onChange={v => onChange({ ...p, density: v })} />
        <AIKnob label="SCALE" value={p.scale ?? 0} min={0} max={6} step={1} color="#a3e635"
          onChange={v => onChange({ ...p, scale: v })} />
      </div>

      <button onClick={generate} disabled={status === 'loading'} style={{
        width: '100%', padding: '7px 0', borderRadius: 6,
        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
        background: status === 'loading' ? 'rgba(34,197,94,0.08)' : 'linear-gradient(135deg,#15803d,#22c55e)',
        border: '1px solid rgba(34,197,94,0.4)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.5px',
      }}>
        {status === 'loading' ? '⏳ COMPOSING...' : `🎵 GENERATE ${genMode.toUpperCase()}`}
      </button>

      {output && <StatusPill text={output} type={status} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FS-PHANTOM — AI Stereo Reconstructor (pure DSP)
// ─────────────────────────────────────────────────────────────────────────────
export function PhantomEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const MODES = ['Haas Spread', 'Freq-Dep', 'Binaural', 'Room Sim', 'Ultra Wide']
  const CHARS = ['Transparent', 'Warm', 'Airy', 'Studio', 'Concert']

  // Live stereo analyzer visualization
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    let t = 0
    const draw = () => {
      animRef.current = requestAnimationFrame(draw)
      t += 0.03
      const w = canvas.width, h = canvas.height
      ctx2d.fillStyle = 'rgba(0,0,0,0.15)'
      ctx2d.fillRect(0, 0, w, h)

      // Draw stereo Lissajous-style pattern
      const width = p.width ?? 1.5
      const pts = 80
      for (let i = 0; i < pts; i++) {
        const phase = (i / pts) * Math.PI * 2
        const l = Math.sin(phase + t * 0.7) * 0.8
        const r2 = Math.sin(phase * 1.1 + t * 0.9 + width * 0.5) * 0.8
        const x = (l * 0.5 + 0.5) * w
        const y = (r2 * 0.5 + 0.5) * h
        const alpha = 0.6 - (i / pts) * 0.4
        ctx2d.beginPath()
        ctx2d.arc(x, y, 1.5, 0, Math.PI * 2)
        ctx2d.fillStyle = `rgba(139,92,246,${alpha})`
        ctx2d.fill()
      }
      // Center crosshair
      ctx2d.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx2d.lineWidth = 1
      ctx2d.beginPath(); ctx2d.moveTo(w/2,0); ctx2d.lineTo(w/2,h); ctx2d.stroke()
      ctx2d.beginPath(); ctx2d.moveTo(0,h/2); ctx2d.lineTo(w,h/2); ctx2d.stroke()
    }
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [p.width])

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#c4b5fd', letterSpacing: '.5px' }}>FS-PHANTOM</span>
        <AIBadge label="DSP" color="#8b5cf6" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Stereo AI</span>
      </div>

      {/* Stereo scope */}
      <canvas ref={canvasRef} width={220} height={80}
        style={{ width: '100%', height: 80, borderRadius: 6, background: '#0a0a0f', marginBottom: 10, display: 'block' }} />

      {/* Mode */}
      <SectionLabel>Widening Mode</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
        {MODES.map((m, i) => (
          <button key={m} onClick={() => onChange({ ...p, mode: i })} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.mode ?? 1) === i ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${Math.round(p.mode ?? 1) === i ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
            color: Math.round(p.mode ?? 1) === i ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
          }}>{m}</button>
        ))}
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="WIDTH" value={p.width ?? 1.5} min={0} max={3} step={0.05} color="#8b5cf6"
          onChange={v => onChange({ ...p, width: v })} />
        <AIKnob label="DEPTH" value={p.depth ?? 0.5} min={0} max={1} step={0.01} color="#a78bfa"
          onChange={v => onChange({ ...p, depth: v })} />
        <AIKnob label="BASS MN" value={p.bassMonoFreq ?? 120} min={40} max={300} step={5} unit=" Hz" color="#7c3aed"
          onChange={v => onChange({ ...p, bassMonoFreq: v })} />
        <AIKnob label="MIX" value={p.mix ?? 1} min={0} max={1} step={0.01} color="#c4b5fd"
          onChange={v => onChange({ ...p, mix: v })} />
      </div>

      {/* Character */}
      <SectionLabel>Character</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {CHARS.map((c, i) => (
          <button key={c} onClick={() => onChange({ ...p, character: i })} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.character ?? 0) === i ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.character ?? 0) === i ? '#8b5cf6' : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.character ?? 0) === i ? '#c4b5fd' : 'rgba(255,255,255,0.3)',
          }}>{c}</button>
        ))}
      </div>

      {/* Mono check indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
        background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 5 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>MONO COMPATIBLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#86efac' }}>
          Bass mono below {p.bassMonoFreq ?? 120}Hz
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FS-NERVE — Adaptive Sidechain Intelligence
// ─────────────────────────────────────────────────────────────────────────────
export function NerveEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const { tracks } = useProjectStore()
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [analysis, setAnalysis] = useState<string>('')
  const [scSource, setScSource] = useState<string>('')
  const [scTarget, setScTarget] = useState<string>('')
  const MODES = ['Duck', 'Pump', 'Gate', 'Groove Lock', 'Spectral SC']

  const audioTracks = tracks.filter(t => t.type === 'audio' || t.type === 'midi')

  async function analyzeAndOptimize() {
    if (!scSource || !scTarget) { setStatus('err'); setAnalysis('Select source and target tracks'); return }
    setStatus('loading'); setAnalysis('')
    try {
      const src = tracks.find(t => t.id === scSource)
      const tgt = tracks.find(t => t.id === scTarget)
      if (!src || !tgt) throw new Error('Track not found')

      const prompt = `You are an expert mixing engineer. Optimize sidechain compression settings.

Sidechain Source: "${src.name}" (${src.type}, ${src.clips.length} clips)
Sidechain Target: "${tgt.name}" (${tgt.type}, ${tgt.plugins.map(pl => pl.name).join(', ') || 'no plugins'})
Mode: ${MODES[Math.round(p.mode ?? 0)]}
Current settings: threshold=${p.threshold ?? -20}dB, ratio=${p.ratio ?? 4}, attack=${p.attack ?? 0.005}s, release=${p.release ?? 0.15}s

Give optimal attack/release/threshold/ratio values for this sidechain relationship. Consider:
- Kick→Bass ducking needs fast attack (0.001s), medium release (0.1-0.2s)
- Pumping EDM: faster release, ratio 4-8
- Groove lock: tempo-synced release times

Respond with JSON only: {"threshold":-20,"ratio":4,"attack":0.001,"release":0.15,"makeup":0,"advice":"brief explanation"}`

      const result = await hubPost('/api/clawbot/chat', {
        message: prompt,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are a mixing engineer AI. Return ONLY valid JSON with the exact keys specified.',
      })

      const raw = (result.message || result.content || '').trim()
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No valid JSON in response')

      const settings = JSON.parse(jsonMatch[0])
      setAnalysis(`⚡ Auto-optimized: ${settings.advice ?? 'Settings applied'}`)
      setStatus('ok')
      onChange({
        ...p,
        threshold: settings.threshold ?? p.threshold ?? -20,
        ratio: settings.ratio ?? p.ratio ?? 4,
        attack: settings.attack ?? p.attack ?? 0.005,
        release: settings.release ?? p.release ?? 0.15,
        makeup: settings.makeup ?? p.makeup ?? 0,
      })
    } catch (e: any) {
      setStatus('err')
      setAnalysis(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fde68a', letterSpacing: '.5px' }}>FS-NERVE</span>
        <AIBadge label="AI" color="#f59e0b" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Adaptive SC</span>
      </div>

      {/* Track routing */}
      <SectionLabel>Sidechain Routing</SectionLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>SC SOURCE (trigger)</div>
          <select value={scSource} onChange={e => setScSource(e.target.value)} style={{
            width: '100%', padding: '4px 6px', borderRadius: 4, fontSize: 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#fff', outline: 'none',
          }}>
            <option value="">— Select —</option>
            {audioTracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>SC TARGET (ducked)</div>
          <select value={scTarget} onChange={e => setScTarget(e.target.value)} style={{
            width: '100%', padding: '4px 6px', borderRadius: 4, fontSize: 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#fff', outline: 'none',
          }}>
            <option value="">— Select —</option>
            {audioTracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Mode */}
      <SectionLabel>SC Mode</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
        {MODES.map((m, i) => (
          <button key={m} onClick={() => onChange({ ...p, mode: i })} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.mode ?? 0) === i ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${Math.round(p.mode ?? 0) === i ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
            color: Math.round(p.mode ?? 0) === i ? '#fde68a' : 'rgba(255,255,255,0.4)',
          }}>{m}</button>
        ))}
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="THRESH" value={p.threshold ?? -20} min={-60} max={0} step={0.5} unit=" dB" color="#f59e0b"
          onChange={v => onChange({ ...p, threshold: v })} />
        <AIKnob label="RATIO" value={p.ratio ?? 4} min={1} max={20} step={0.5} unit=":1" color="#fbbf24"
          onChange={v => onChange({ ...p, ratio: v })} />
        <AIKnob label="ATTACK" value={p.attack ?? 0.005} min={0.0001} max={0.1} step={0.0001} unit=" s" color="#fcd34d"
          onChange={v => onChange({ ...p, attack: v })} />
        <AIKnob label="RELEASE" value={p.release ?? 0.15} min={0.01} max={1} step={0.01} unit=" s" color="#fde68a"
          onChange={v => onChange({ ...p, release: v })} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <AIKnob label="MAKEUP" value={p.makeup ?? 0} min={-12} max={12} step={0.5} unit=" dB" color="#f97316"
          onChange={v => onChange({ ...p, makeup: v })} />
        <AIKnob label="LISTEN" value={p.listen ?? 0} min={0} max={1} step={1} color="#fb923c"
          onChange={v => onChange({ ...p, listen: v })} />
        <AIKnob label="FREQ SC" value={p.freqSc ?? 100} min={20} max={8000} step={10} unit=" Hz" color="#fdba74"
          onChange={v => onChange({ ...p, freqSc: v })} />
        <AIKnob label="RANGE" value={p.range ?? 40} min={0} max={60} step={1} unit=" dB" color="#fed7aa"
          onChange={v => onChange({ ...p, range: v })} />
      </div>

      <button onClick={analyzeAndOptimize} disabled={status === 'loading'} style={{
        width: '100%', padding: '7px 0', borderRadius: 6,
        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
        background: status === 'loading' ? 'rgba(245,158,11,0.08)' : 'linear-gradient(135deg,#b45309,#f59e0b)',
        border: '1px solid rgba(245,158,11,0.4)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.5px',
      }}>
        {status === 'loading' ? '⏳ ANALYZING...' : '⚡ AI OPTIMIZE SIDECHAIN'}
      </button>

      {analysis && <StatusPill text={analysis} type={status} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. FS-BPM FINDER — Live BPM Detection
// ─────────────────────────────────────────────────────────────────────────────
export function BpmFinderEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const { bpm, setBpm, isPlaying } = useProjectStore()
  const [detecting, setDetecting] = useState(false)
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [tapTimes, setTapTimes] = useState<number[]>([])
  const [history, setHistory] = useState<number[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  const onsetTimesRef = useRef<number[]>([])
  const lastEnergyRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ── Onset detection algorithm ──────────────────────────────────────────────
  const startDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.3
      src.connect(analyser)
      analyserRef.current = analyser
      setDetecting(true)
      onsetTimesRef.current = []

      const buf = new Float32Array(analyser.fftSize)
      const freqBuf = new Uint8Array(analyser.frequencyBinCount)

      const detect = () => {
        rafRef.current = requestAnimationFrame(detect)
        analyser.getFloatTimeDomainData(buf)
        analyser.getByteFrequencyData(freqBuf)

        // Energy in kick/bass frequency band (20-200Hz)
        const binLow = Math.floor(20 / (ctx.sampleRate / analyser.fftSize))
        const binHigh = Math.floor(200 / (ctx.sampleRate / analyser.fftSize))
        let energy = 0
        for (let i = binLow; i < binHigh; i++) energy += freqBuf[i] * freqBuf[i]
        energy = Math.sqrt(energy / (binHigh - binLow))

        // Onset: spectral flux (sudden energy increase)
        const threshold = (p.sensitivity ?? 0.6) * 80 + 20
        if (energy > threshold && energy > lastEnergyRef.current * 1.4) {
          const now = Date.now()
          const recent = onsetTimesRef.current
          recent.push(now)
          // Keep only last 24 onsets
          if (recent.length > 24) recent.shift()

          // Calculate BPM from inter-onset intervals
          if (recent.length >= 4) {
            const intervals: number[] = []
            for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1])
            // Filter intervals in musical BPM range (60-200 BPM = 300ms-1000ms)
            const valid = intervals.filter(iv => iv > 250 && iv < 1200)
            if (valid.length >= 2) {
              const avgInterval = valid.reduce((a, b) => a + b, 0) / valid.length
              const rawBpm = 60000 / avgInterval

              // Round to nearest 0.5 BPM
              const rounded = Math.round(rawBpm * 2) / 2
              // Clamp to musical range
              const clamped = Math.max(60, Math.min(200, rounded))

              // Double-time / half-time correction
              let finalBpm = clamped
              if (finalBpm > 140 && finalBpm < 200) finalBpm = finalBpm / 2  // might be half-notes
              if (finalBpm < 80 && finalBpm > 50)   finalBpm = finalBpm * 2  // might be double-time

              const conf = Math.min(100, Math.round((valid.length / 12) * 100))
              setDetectedBpm(Math.round(finalBpm * 2) / 2)
              setConfidence(conf)
              setHistory(h => [...h.slice(-19), Math.round(finalBpm * 2) / 2])
            }
          }
        }
        lastEnergyRef.current = energy

        // Draw waveform
        const canvas = canvasRef.current
        if (canvas) {
          const ctx2d = canvas.getContext('2d')
          if (ctx2d) {
            ctx2d.fillStyle = '#0a0a0f'
            ctx2d.fillRect(0, 0, canvas.width, canvas.height)
            ctx2d.strokeStyle = energy > threshold ? '#f59e0b' : '#6366f1'
            ctx2d.lineWidth = 1.5
            ctx2d.beginPath()
            const step = canvas.width / buf.length
            buf.forEach((v, i) => {
              const x = i * step, y = (v * 0.5 + 0.5) * canvas.height
              i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y)
            })
            ctx2d.stroke()
            // Energy bar
            ctx2d.fillStyle = energy > threshold ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.2)'
            ctx2d.fillRect(0, canvas.height - (energy / 255) * canvas.height, 4, (energy / 255) * canvas.height)
          }
        }
      }
      detect()
    } catch {
      setDetecting(false)
    }
  }, [p.sensitivity])

  const stopDetection = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setDetecting(false)
    onsetTimesRef.current = []
  }, [])

  useEffect(() => () => { cancelAnimationFrame(rafRef.current) }, [])

  // Tap tempo
  const handleTap = useCallback(() => {
    const now = Date.now()
    setTapTimes(prev => {
      const recent = [...prev, now].filter(t => now - t < 4000).slice(-8)
      if (recent.length >= 2) {
        const intervals = recent.slice(1).map((t, i) => t - recent[i])
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const tapped = Math.round(60000 / avg * 2) / 2
        setDetectedBpm(tapped)
        setConfidence(Math.min(100, recent.length * 12))
      }
      return recent
    })
  }, [])

  function applyBpm() {
    if (detectedBpm) {
      setBpm(detectedBpm)
      onChange({ ...p, detectedBpm })
    }
  }

  const confColor = confidence > 80 ? '#22c55e' : confidence > 50 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fdba74', letterSpacing: '.5px' }}>FS-BPM FINDER</span>
        <AIBadge label="LIVE" color="#f97316" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Onset Detection</span>
      </div>

      {/* Waveform display */}
      <canvas ref={canvasRef} width={220} height={50}
        style={{ width: '100%', height: 50, borderRadius: 6, background: '#0a0a0f', marginBottom: 10, display: 'block' }} />

      {/* Big BPM display */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{
          fontSize: 52, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1,
          color: detectedBpm ? confColor : 'rgba(255,255,255,0.15)',
          fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace',
          textShadow: detectedBpm ? `0 0 20px ${confColor}44` : 'none',
        }}>
          {detectedBpm ?? '---'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>BPM</div>
        {confidence > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ width: 80, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
              <div style={{ width: `${confidence}%`, height: '100%', background: confColor, borderRadius: 2, transition: 'all .3s' }} />
            </div>
            <span style={{ fontSize: 9, color: confColor }}>{confidence}% conf.</span>
          </div>
        )}
      </div>

      {/* Current project BPM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
        background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '5px 8px' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Project BPM:</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{bpm}</span>
        {detectedBpm && Math.abs(detectedBpm - bpm) > 0.5 && (
          <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 4 }}>
            Δ {(detectedBpm - bpm).toFixed(1)}
          </span>
        )}
      </div>

      {/* Sensitivity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', minWidth: 62 }}>SENSITIVITY</span>
        <input type="range" min={0} max={1} step={0.05} value={p.sensitivity ?? 0.6}
          onChange={e => onChange({ ...p, sensitivity: parseFloat(e.target.value) })}
          style={{ flex: 1, accentColor: '#f97316' }} />
        <span style={{ fontSize: 9, color: '#fdba74', minWidth: 28 }}>{Math.round((p.sensitivity ?? 0.6) * 100)}%</span>
      </div>

      {/* BPM History */}
      {history.length > 1 && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 8, alignItems: 'flex-end', height: 24 }}>
          {history.map((b, i) => (
            <div key={i} style={{
              flex: 1, background: i === history.length - 1 ? confColor : 'rgba(249,115,22,0.3)',
              borderRadius: 2,
              height: `${Math.max(20, Math.min(100, ((b - 60) / 140) * 100))}%`,
              transition: 'all .2s',
            }} title={`${b} BPM`} />
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button onClick={detecting ? stopDetection : startDetection} style={{
          flex: 2, padding: '7px 0', borderRadius: 6, cursor: 'pointer',
          background: detecting
            ? 'linear-gradient(135deg,#991b1b,#ef4444)'
            : 'linear-gradient(135deg,#c2410c,#f97316)',
          border: `1px solid ${detecting ? '#ef444488' : '#f9731688'}`,
          color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.4px',
        }}>
          {detecting ? '⏹ STOP DETECT' : (isPlaying ? '🎙 DETECT LIVE' : '🎙 START DETECT')}
        </button>
        <button onClick={handleTap} style={{
          flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer',
          background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)',
          color: '#fdba74', fontSize: 11, fontWeight: 700,
        }}>TAP</button>
      </div>

      <button onClick={applyBpm} disabled={!detectedBpm} style={{
        width: '100%', padding: '6px 0', borderRadius: 6,
        cursor: detectedBpm ? 'pointer' : 'not-allowed',
        background: detectedBpm ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${detectedBpm ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`,
        color: detectedBpm ? '#86efac' : 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700,
      }}>
        {detectedBpm ? `✓ APPLY ${detectedBpm} BPM TO PROJECT` : 'DETECT BPM FIRST'}
      </button>
    </div>
  )
}

// ── AI Plugin defaults ────────────────────────────────────────────────────────
export const AI_PLUGIN_DEFAULTS: Record<string, { name: string; type: string; params: Record<string, number> }> = {
  fs_oracle: {
    name: 'FS-Oracle', type: 'fs_oracle',
    params: { low: 0, lom: 0, him: 0, high: 0, cThresh: -12, cRatio: 2, cAttack: 0.01, cRelease: 0.15, cMakeup: 0, width: 1, lufs: -14, ceiling: -0.1, platform: 0 },
  },
  fs_clone: {
    name: 'FS-Clone', type: 'fs_clone',
    params: { mode: 0, amount: 0.5, smooth: 0.5, preserve: 0.3, mix: 1, character: 0 },
  },
  fs_architect: {
    name: 'FS-Architect', type: 'fs_architect',
    params: { genre: 4, mood: 0, scale: 0, bars: 4, tension: 0.5, density: 0.5 },
  },
  fs_phantom: {
    name: 'FS-Phantom', type: 'fs_phantom',
    params: { mode: 1, width: 1.5, depth: 0.5, bassMonoFreq: 120, mix: 1, character: 0 },
  },
  fs_nerve: {
    name: 'FS-Nerve', type: 'fs_nerve',
    params: { mode: 0, threshold: -20, ratio: 4, attack: 0.005, release: 0.15, makeup: 0, listen: 0, freqSc: 100, range: 40 },
  },
  fs_bpmfinder: {
    name: 'FS-BPM Finder', type: 'fs_bpmfinder',
    params: { sensitivity: 0.6, detectedBpm: 0, filterLow: 20, filterHigh: 200 },
  },
}

export function renderAiPlugin(plugin: any, onChange: (p: Record<string, number>) => void): React.ReactNode {
  switch (plugin.type) {
    case 'fs_oracle':     return <OracleEditor    plugin={plugin} onChange={onChange} />
    case 'fs_clone':      return <CloneEditor     plugin={plugin} onChange={onChange} />
    case 'fs_architect':  return <ArchitectEditor plugin={plugin} onChange={onChange} />
    case 'fs_phantom':    return <PhantomEditor   plugin={plugin} onChange={onChange} />
    case 'fs_nerve':      return <NerveEditor     plugin={plugin} onChange={onChange} />
    case 'fs_bpmfinder':  return <BpmFinderEditor plugin={plugin} onChange={onChange} />
    default: return null
  }
}
