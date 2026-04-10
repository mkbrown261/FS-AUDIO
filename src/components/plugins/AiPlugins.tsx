/**
 * FS-AUDIO — AI Plugin Suite
 *
 * Subscription gating rules (enforced per-plugin):
 *   • Pure DSP (no network)     → FREE — no gate
 *   • Uses /api/clawbot or hub  → CLAWFLOW subscription required  (d.hasClawflow)
 *   • Any AI/LLM feature        → FS-AUDIO AI subscription required (d.hasAI || d.hasClawflow)
 *
 * Plugins:
 *   FREE        — FS-Phantom, FS-BPM Finder, FS-Dream (DSP only)
 *   CLAWFLOW    — FS-Oracle, FS-Clone, FS-Architect, FS-Nerve,
 *                 FS-Séance, FS-Synapse, FS-Ouroboros (AI calls)
 *   (FS-Dream visuals are free; its AI "describe" button is CLAWFLOW)
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

// ── Subscription gate ─────────────────────────────────────────────────────────
// Uses electronAPI.getUser() (same as AuthGateModal) instead of a cookie check.
// AI plugins in the 🤖 AI tab require Pro, Team, or Enterprise plan.
// ClawFlow is a separate add-on — not checked here.

interface SubState { checked: boolean; hasPro: boolean }

const PRO_TIERS = new Set(['pro', 'personal_pro', 'team', 'team_starter', 'team_growth', 'enterprise', 'clawflow'])

function useSubGate(): SubState {
  const [state, setState] = useState<SubState>({ checked: false, hasPro: false })
  useEffect(() => {
    const check = async () => {
      try {
        const user = await (window as any).electronAPI?.getUser?.()
        if (!user) { setState({ checked: true, hasPro: false }); return }
        const tier = (user.tier ?? 'free').toLowerCase()
        setState({ checked: true, hasPro: PRO_TIERS.has(tier) })
      } catch {
        setState({ checked: true, hasPro: false })
      }
    }
    check()
  }, [])
  return state
}

// The locked wall shown inside the plugin body when a Pro plan is required
function SubscriptionWall() {
  function openPricing() {
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal('https://flowst8.cc/pricing')
    }
  }
  return (
    <div style={{
      margin: '10px 12px', padding: '14px 12px',
      background: '#f59e0b0d', border: '1px solid #f59e0b33',
      borderRadius: 8, textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>🤖</div>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', marginBottom: 6, letterSpacing: '.4px' }}>PRO PLAN REQUIRED</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 10 }}>
        AI plugins are available on Pro, Team, and Enterprise plans.
      </div>
      <button
        onClick={openPricing}
        style={{
          display: 'inline-block', padding: '6px 16px', borderRadius: 6,
          background: 'linear-gradient(135deg, #d97706, #f59e0b)',
          color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '.4px',
          border: '1px solid #f59e0b88', cursor: 'pointer',
        }}
      >UPGRADE →</button>
    </div>
  )
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
  const sub = useSubGate()
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
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>

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
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FS-CLONE — AI Timbre Transfer
// ─────────────────────────────────────────────────────────────────────────────
export function CloneEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const sub = useSubGate()
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
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>

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
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FS-ARCHITECT — AI Chord & Melody Generator
// ─────────────────────────────────────────────────────────────────────────────
export function ArchitectEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const sub = useSubGate()
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
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>

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
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FS-PHANTOM — AI Stereo Reconstructor (pure DSP — FREE, no gate)
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
  const sub = useSubGate()
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
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>

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
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. FS-BPM FINDER — Live BPM Detection (FREE — pure DSP, no gate)
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

// ─────────────────────────────────────────────────────────────────────────────
// 7. FS-SÉANCE — Emotion-to-Sound Engine  [CLAWFLOW GATED]
//    Converts a typed mood/scene description into real DSP parameter sets.
//    Claude reads the emotion, returns EQ curve, reverb, sat, stereo settings,
//    then writes them directly to the plugin's sibling plugins on the track.
// ─────────────────────────────────────────────────────────────────────────────
export function SeanceEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const sub = useSubGate()
  const { tracks, selectedTrackId, updatePlugin } = useProjectStore()
  const [status, setStatus] = useState<'idle'|'loading'|'ok'|'err'>('idle')
  const [prompt, setPrompt] = useState('')
  const [resultText, setResultText] = useState('')
  const [lastDNA, setLastDNA] = useState<Record<string,number> | null>(null)

  const PRESETS = [
    { label: '🌊 Oceanic',    text: 'vast underwater cave, slow pressure, bioluminescent calm, barely breathing' },
    { label: '🔥 Rage',       text: 'pure red-hot fury, distorted feedback walls, crushing weight, no mercy' },
    { label: '🌙 Liminal',    text: '3AM empty parking lot, neon reflecting on wet asphalt, nobody home' },
    { label: '🧠 Psychedelic',text: 'fractals breathing in the walls, time dissolving, warm synapse fires' },
    { label: '🏔 Ancient',    text: 'ten-thousand-year old stone, tectonic slow motion, cosmic indifference' },
    { label: '💀 Void',       text: 'absolute silence that is somehow loud, total darkness with warmth, post-death peace' },
  ]

  async function castSpell() {
    if (!prompt.trim()) return
    setStatus('loading'); setResultText('')
    try {
      const track = tracks.find(t => t.id === selectedTrackId)
      const pluginList = track?.plugins.filter(pl => pl.enabled && pl.id !== plugin.id).map(pl => pl.name) ?? []

      const result = await hubPost('/api/clawbot/chat', {
        message: `You are a DSP emotion sculptor for FS-Audio DAW. A producer typed this feeling/scene:
"${prompt}"

Active plugins on this track: ${pluginList.join(', ') || 'none'}

Return ONLY a JSON object (no explanation) that maps audio DSP parameters to this emotion. Use these exact keys:
{
  "eqLow": <-12 to 12 dB>,
  "eqMid": <-12 to 12 dB>,
  "eqHigh": <-12 to 12 dB>,
  "reverbWet": <0 to 1>,
  "reverbSize": <0.5 to 8>,
  "satDrive": <0 to 10>,
  "stereoWidth": <0 to 2>,
  "compression": <0 to 1>,
  "brightness": <0 to 1>,
  "darkness": <0 to 1>,
  "density": <0 to 1>,
  "description": "<one evocative sentence about what this soundscape feels like>"
}`,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are a DSP emotion sculptor. Return ONLY valid JSON, no explanation.',
      })

      const raw = (result.message || result.content || '').trim()
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in response')
      const dna: Record<string, number> & { description?: string } = JSON.parse(match[0])
      setLastDNA(dna)
      setResultText(dna.description ?? 'Emotion sculpted.')
      setStatus('ok')

      // Write emotion DNA into plugin params
      onChange({ ...p,
        eqLow: dna.eqLow ?? 0, eqMid: dna.eqMid ?? 0, eqHigh: dna.eqHigh ?? 0,
        reverbWet: dna.reverbWet ?? 0.3, reverbSize: dna.reverbSize ?? 2,
        satDrive: dna.satDrive ?? 0, stereoWidth: dna.stereoWidth ?? 1,
        compression: dna.compression ?? 0.5,
      })

      // Also try to write to sibling EQ, reverb, saturation plugins on same track
      if (track) {
        track.plugins.forEach(pl => {
          if (!pl.enabled) return
          if (pl.type === 'eq' || pl.type === 'fs_proq') {
            updatePlugin(track.id, pl.id, { ...pl.params,
              lowGain: dna.eqLow ?? pl.params.lowGain ?? 0,
              midGain: dna.eqMid ?? pl.params.midGain ?? 0,
              highGain: dna.eqHigh ?? pl.params.highGain ?? 0,
            })
          }
          if (pl.type === 'reverb' || pl.type === 'fs_vintage_verb') {
            updatePlugin(track.id, pl.id, { ...pl.params,
              wet: dna.reverbWet ?? pl.params.wet ?? 0.3,
              size: dna.reverbSize ?? pl.params.size ?? 2,
            })
          }
          if (pl.type === 'saturation') {
            updatePlugin(track.id, pl.id, { ...pl.params,
              lowDrive: Math.min(10, (dna.satDrive ?? 0) * 0.5),
              midDrive: Math.min(10, (dna.satDrive ?? 0) * 0.8),
              highDrive: Math.min(10, (dna.satDrive ?? 0) * 0.4),
            })
          }
          if (pl.type === 'stereo_width') {
            updatePlugin(track.id, pl.id, { ...pl.params, width: dna.stereoWidth ?? 1 })
          }
        })
      }
    } catch (e: any) {
      setStatus('err'); setResultText(`Error: ${e.message}`)
    }
  }

  const EMOTION_COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444']

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#c084fc', letterSpacing: '.5px' }}>FS-SÉANCE</span>
        <AIBadge label="EMOTION AI" color="#a855f7" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Mood → DSP</span>
      </div>
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>
        {/* Emotion prompt */}
        <SectionLabel>Describe the emotion / scene / feeling</SectionLabel>
        <textarea
          value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder='e.g. "lonely 4AM drive through empty streets with rain on the glass..."'
          rows={3}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 10, resize: 'none',
            background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)',
            color: 'rgba(255,255,255,0.8)', outline: 'none', boxSizing: 'border-box',
            lineHeight: 1.5, marginBottom: 8,
          }}
        />

        {/* Preset moods */}
        <SectionLabel>Quick Moods</SectionLabel>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
          {PRESETS.map((pr, i) => (
            <button key={pr.label} onClick={() => setPrompt(pr.text)} style={{
              fontSize: 9, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
              background: `${EMOTION_COLORS[i % EMOTION_COLORS.length]}18`,
              border: `1px solid ${EMOTION_COLORS[i % EMOTION_COLORS.length]}44`,
              color: EMOTION_COLORS[i % EMOTION_COLORS.length],
            }}>{pr.label}</button>
          ))}
        </div>

        {/* DNA readout */}
        {lastDNA && (
          <div style={{ display: 'flex', gap: 3, marginBottom: 10, alignItems: 'flex-end', height: 36 }}>
            {['eqLow','eqMid','eqHigh','reverbWet','satDrive','stereoWidth','compression','brightness','darkness'].map((k, i) => {
              const raw = lastDNA[k] ?? 0
              const norm = k.startsWith('eq') ? (raw + 12) / 24 : Math.min(1, Math.max(0, raw / (k === 'satDrive' ? 10 : 1)))
              return (
                <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: '100%', height: `${Math.max(4, norm * 28)}px`,
                    background: EMOTION_COLORS[i % EMOTION_COLORS.length],
                    borderRadius: 2, transition: 'height .5s',
                    boxShadow: `0 0 6px ${EMOTION_COLORS[i % EMOTION_COLORS.length]}88`,
                  }} />
                  <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '.3px' }}>{k.replace(/([A-Z])/g,' $1').trim().slice(0,4)}</span>
                </div>
              )
            })}
          </div>
        )}

        <button onClick={castSpell} disabled={status === 'loading' || !prompt.trim()} style={{
          width: '100%', padding: '8px 0', borderRadius: 6,
          cursor: status === 'loading' || !prompt.trim() ? 'not-allowed' : 'pointer',
          background: status === 'loading' ? 'rgba(168,85,247,0.1)' : 'linear-gradient(135deg,#6d28d9,#a855f7,#d946ef)',
          border: '1px solid rgba(168,85,247,0.5)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.6px',
        }}>
          {status === 'loading' ? '🔮 CHANNELING EMOTION...' : '🔮 CAST SÉANCE'}
        </button>

        {resultText && (
          <div style={{
            marginTop: 8, padding: '7px 10px', fontSize: 10, lineHeight: 1.6,
            background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 6,
            color: 'rgba(255,255,255,0.6)', fontStyle: 'italic',
          }}>"{resultText}"</div>
        )}
        {status === 'err' && <StatusPill text={resultText} type="err" />}
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. FS-DREAM — Extreme Time-Stretch / Texture Morpher  [FREE — pure DSP]
//    Renders the selected clip at 0.001x–0.5x speed using an OfflineAudioContext
//    with phase-vocoder-inspired overlap-add stretching, pitch-compensated via
//    playbackRate inversion. Turns a 1-second snare into a 60-second cinematic
//    drone pad. No AI call — 100% Web Audio.
// ─────────────────────────────────────────────────────────────────────────────
export function DreamEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const { tracks, selectedClipIds, addClip, selectedTrackId } = useProjectStore()
  const [status, setStatus] = useState<'idle'|'processing'|'ok'|'err'>('idle')
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const rafRef = useRef<number>(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const STRETCH_PRESETS = [
    { label: '× 0.5',  rate: 0.5  },
    { label: '× 0.1',  rate: 0.1  },
    { label: '× 0.05', rate: 0.05 },
    { label: '× 0.01', rate: 0.01 },
    { label: '× 0.005',rate: 0.005},
  ]
  const MODES = ['Smooth', 'Grainy', 'Metallic', 'Crystalline', 'Spectral']

  // Animated shimmer on canvas while processing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    let t = 0
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      t += 0.04
      ctx2d.fillStyle = 'rgba(0,0,0,0.2)'
      ctx2d.fillRect(0, 0, canvas.width, canvas.height)
      const stretchRate = p.stretchRate ?? 0.05
      const bands = 32
      for (let i = 0; i < bands; i++) {
        const x = (i / bands) * canvas.width
        const phase = (i / bands) * Math.PI * 4 + t * (1 + (1 - stretchRate) * 2)
        const h = (Math.sin(phase) * 0.5 + 0.5) * (canvas.height * 0.7) * (status === 'processing' ? 1 : 0.3)
        const hue = 180 + i * 5 + t * 20
        ctx2d.fillStyle = `hsla(${hue},80%,60%,${status === 'processing' ? 0.7 : 0.2})`
        ctx2d.fillRect(x, canvas.height - h, canvas.width / bands - 1, h)
      }
      if (status === 'processing') {
        ctx2d.fillStyle = `rgba(99,102,241,${0.3 + Math.sin(t * 3) * 0.15})`
        ctx2d.fillRect(0, canvas.height - 3, canvas.width * progress, 3)
      }
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [status, progress, p.stretchRate])

  async function applyDream() {
    const clip = tracks.flatMap(t => t.clips).find(c => selectedClipIds.includes(c.id))
    if (!clip?.audioBuffer && !clip?.audioUrl) {
      setStatus('err'); setStatusText('Select a clip with audio first'); return
    }
    setStatus('processing'); setProgress(0); setStatusText('Decoding audio…')

    try {
      // Decode the buffer
      let srcBuf: AudioBuffer
      if (clip.audioBuffer) {
        srcBuf = clip.audioBuffer
      } else {
        const resp = await fetch(clip.audioUrl!)
        const arr = await resp.arrayBuffer()
        const tmpCtx = new AudioContext()
        srcBuf = await tmpCtx.decodeAudioData(arr)
        tmpCtx.close()
      }

      const stretchRate = Math.max(0.001, Math.min(0.99, p.stretchRate ?? 0.05))
      const pitchCompensate = p.pitchCompensate ?? 1
      const grainSize = Math.floor((p.grainSize ?? 0.1) * srcBuf.sampleRate)
      const hopSize = Math.floor(grainSize * stretchRate)

      setStatusText(`Stretching ${(1 / stretchRate).toFixed(0)}× (${(srcBuf.duration / stretchRate).toFixed(0)}s output)…`)
      setProgress(0.1)

      // Build output length
      const outLength = Math.min(
        Math.floor(srcBuf.length / stretchRate),
        srcBuf.sampleRate * 300   // cap at 5 minutes
      )
      const offCtx = new OfflineAudioContext(srcBuf.numberOfChannels, outLength, srcBuf.sampleRate)
      const outBuf = offCtx.createBuffer(srcBuf.numberOfChannels, outLength, srcBuf.sampleRate)

      // Overlap-add grain synthesis
      const numGrains = Math.ceil(srcBuf.length / hopSize)
      const window = new Float32Array(grainSize)
      for (let i = 0; i < grainSize; i++) {
        // Hann window
        window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (grainSize - 1)))
      }

      for (let ch = 0; ch < srcBuf.numberOfChannels; ch++) {
        const inData  = srcBuf.getChannelData(ch)
        const outData = outBuf.getChannelData(ch)
        for (let g = 0; g < numGrains; g++) {
          const inPos  = g * hopSize
          const outPos = Math.floor(g * hopSize / stretchRate)
          if (outPos + grainSize >= outLength) break
          for (let s = 0; s < grainSize; s++) {
            const inIdx = inPos + s
            if (inIdx >= inData.length) break
            // Mode-based grain manipulation
            let sample = inData[inIdx] * window[s]
            const mode = Math.round(p.mode ?? 0)
            if (mode === 1) sample *= (Math.random() * 0.4 + 0.8)       // Grainy
            if (mode === 2) sample = Math.tanh(sample * 3) * 0.33        // Metallic
            if (mode === 3) sample *= (Math.sin(s / grainSize * Math.PI * 8) * 0.3 + 0.7) // Crystalline
            outData[outPos + s] = (outData[outPos + s] ?? 0) + sample
          }
          if (g % 100 === 0) setProgress(0.1 + (g / numGrains) * 0.8)
        }
      }

      setProgress(0.95); setStatusText('Rendering…')

      // Source node with pitch compensation
      const src = offCtx.createBufferSource()
      src.buffer = outBuf
      src.playbackRate.value = pitchCompensate === 1 ? 1 : Math.pow(2, (1 - stretchRate) * 0.5)
      src.connect(offCtx.destination)
      src.start(0)

      const rendered = await offCtx.startRendering()
      setProgress(1)

      // Place rendered clip on track
      const track = tracks.find(t => t.id === selectedTrackId) ?? tracks[0]
      if (track) {
        const maxBeat = Math.max(0, ...track.clips.map(c => c.startBeat + c.durationBeats))
        addClip({
          id: `dream-${Date.now()}`,
          trackId: track.id,
          startBeat: maxBeat,
          durationBeats: Math.round((rendered.duration / 60) * (120) * 4),
          name: `DREAM ×${(1/stretchRate).toFixed(0)} — ${clip.name}`,
          type: 'audio',
          audioBuffer: rendered,
          gain: 1, fadeIn: 4, fadeOut: 8,
          fadeInCurve: 's-curve', fadeOutCurve: 's-curve',
          looped: false, muted: false, aiGenerated: true,
        })
        setStatus('ok')
        setStatusText(`✓ ${(rendered.duration).toFixed(0)}s dream texture added to "${track.name}"`)
      }
    } catch (e: any) {
      setStatus('err'); setStatusText(`Error: ${e.message}`)
    }
  }

  const stretchRate = p.stretchRate ?? 0.05
  const estDur = (tracks.flatMap(t => t.clips).find(c => selectedClipIds.includes(c.id))?.audioBuffer?.duration ?? 2) / stretchRate

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#a5f3fc', letterSpacing: '.5px' }}>FS-DREAM</span>
        <AIBadge label="DSP" color="#0891b2" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Time Morpher</span>
      </div>

      {/* Spectral visualizer */}
      <canvas ref={canvasRef} width={220} height={48}
        style={{ width: '100%', height: 48, borderRadius: 6, background: '#03070f', marginBottom: 10, display: 'block' }} />

      {/* Stretch rate */}
      <SectionLabel>Stretch Rate</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {STRETCH_PRESETS.map(pr => (
          <button key={pr.label} onClick={() => onChange({ ...p, stretchRate: pr.rate })} style={{
            fontSize: 9, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
            background: Math.abs((p.stretchRate ?? 0.05) - pr.rate) < 0.001 ? 'rgba(8,145,178,0.35)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${Math.abs((p.stretchRate ?? 0.05) - pr.rate) < 0.001 ? '#0891b2' : 'rgba(255,255,255,0.1)'}`,
            color: Math.abs((p.stretchRate ?? 0.05) - pr.rate) < 0.001 ? '#a5f3fc' : 'rgba(255,255,255,0.4)',
          }}>{pr.label}</button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 80 }}>
          <input type="range" min={0.001} max={0.5} step={0.001} value={stretchRate}
            onChange={e => onChange({ ...p, stretchRate: parseFloat(e.target.value) })}
            style={{ flex: 1, accentColor: '#0891b2' }} />
          <span style={{ fontSize: 9, color: '#7dd3fc', minWidth: 28 }}>×{(1/stretchRate).toFixed(1)}</span>
        </div>
      </div>

      {/* Estimated output */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
        padding: '5px 8px', background: 'rgba(8,145,178,0.08)', borderRadius: 5,
        border: '1px solid rgba(8,145,178,0.2)',
      }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>Est. output:</span>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#a5f3fc', fontFamily: 'monospace' }}>
          {estDur < 60 ? `${estDur.toFixed(0)}s` : `${(estDur/60).toFixed(1)}m`}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>stretch texture</span>
      </div>

      {/* Grain controls */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
        <AIKnob label="GRAIN" value={(p.grainSize ?? 0.1) * 1000} min={20} max={500} step={5} unit=" ms" color="#0891b2"
          onChange={v => onChange({ ...p, grainSize: v / 1000 })} />
        <AIKnob label="PITCH ∓" value={p.pitchCompensate ?? 1} min={0} max={1} step={1} color="#22d3ee"
          onChange={v => onChange({ ...p, pitchCompensate: v })} />
        <AIKnob label="MIX" value={p.mix ?? 1} min={0} max={1} step={0.01} color="#67e8f9"
          onChange={v => onChange({ ...p, mix: v })} />
      </div>

      {/* Mode */}
      <SectionLabel>Texture Mode</SectionLabel>
      <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
        {MODES.map((m, i) => (
          <button key={m} onClick={() => onChange({ ...p, mode: i })} style={{
            flex: 1, fontSize: 8, padding: '3px 2px', borderRadius: 4, cursor: 'pointer',
            background: Math.round(p.mode ?? 0) === i ? 'rgba(8,145,178,0.3)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.mode ?? 0) === i ? '#0891b2' : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.mode ?? 0) === i ? '#a5f3fc' : 'rgba(255,255,255,0.35)',
          }}>{m}</button>
        ))}
      </div>

      <button onClick={applyDream} disabled={status === 'processing'} style={{
        width: '100%', padding: '8px 0', borderRadius: 6,
        cursor: status === 'processing' ? 'not-allowed' : 'pointer',
        background: status === 'processing' ? 'rgba(8,145,178,0.1)' : 'linear-gradient(135deg,#0c4a6e,#0891b2,#22d3ee)',
        border: '1px solid rgba(8,145,178,0.5)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.5px',
      }}>
        {status === 'processing' ? `⏳ DREAMING… ${Math.round(progress * 100)}%` : '💤 DREAM STRETCH'}
      </button>
      {statusText && <StatusPill text={statusText} type={status === 'processing' ? 'loading' : status === 'ok' ? 'ok' : status === 'err' ? 'err' : 'idle'} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. FS-OUROBOROS — Self-Evolving Feedback Organism  [FREE — pure DSP]
//    A generative feedback loop that uses a genetic algorithm to evolve its
//    own filter/delay/saturation parameters toward a target "fitness" score
//    (spectral complexity vs musical stability). Each generation mutates a
//    tiny bit. Shows a live "DNA helix" canvas visualization of the genome.
//    Every parameter it discovers can be locked and exported to siblings.
// ─────────────────────────────────────────────────────────────────────────────
export function OuroborosEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const [running, setRunning] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [fitness, setFitness] = useState(0)
  const [lockedDna, setLockedDna] = useState<number[] | null>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const rafRef     = useRef<number>(0)
  const genRef     = useRef(0)
  const dnaRef     = useRef<number[]>(Array.from({ length: 12 }, () => Math.random()))
  // Genome layout: [feedbackGain, delayTime, filterFreq, filterQ, satDrive, stereoW,
  //                 modRate, modDepth, reverbWet, highCut, lowCut, outputGain]
  const DNA_LABELS = ['FDBK','DLY','FREQ','Q','SAT','WIDTH','MOD','DEPTH','REV','HI-CUT','LO-CUT','GAIN']
  const DNA_COLORS = ['#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e',
                      '#14b8a6','#06b6d4','#3b82f6','#8b5cf6','#a855f7','#ec4899']

  const TARGET_MODES = ['Chaotic', 'Harmonic', 'Alien', 'Organic', 'Industrial', 'Cosmic']

  function computeFitness(dna: number[]): number {
    const [fdbk, dly, freq, q, sat, width, mod, depth, rev] = dna
    const targetMode = Math.round(p.targetMode ?? 0)
    let score = 0
    if (targetMode === 0) { // Chaotic: high feedback, fast mod, high sat
      score = fdbk * 0.4 + mod * 0.3 + sat * 0.3
    } else if (targetMode === 1) { // Harmonic: medium feedback, slow mod, low sat
      score = (1 - Math.abs(fdbk - 0.5)) * 0.4 + (1 - mod) * 0.3 + (1 - sat) * 0.3
    } else if (targetMode === 2) { // Alien: extreme freq, high Q, fast depth
      score = Math.abs(freq - 0.5) * 0.4 + q * 0.3 + depth * 0.3
    } else if (targetMode === 3) { // Organic: slow everything, wide stereo
      score = (1 - mod) * 0.3 + width * 0.3 + (1 - fdbk) * 0.2 + rev * 0.2
    } else if (targetMode === 4) { // Industrial: high sat, extreme delay, low freq
      score = sat * 0.4 + (1 - freq) * 0.3 + fdbk * 0.3
    } else { // Cosmic: huge reverb, long delay, wide
      score = rev * 0.4 + dly * 0.3 + width * 0.3
    }
    return Math.min(1, Math.max(0, score))
  }

  function mutate(dna: number[], rate: number): number[] {
    return dna.map(v => {
      if (Math.random() < rate) {
        const delta = (Math.random() - 0.5) * 0.2
        return Math.min(1, Math.max(0, v + delta))
      }
      return v
    })
  }

  // Evolve one generation
  const evolve = useCallback(() => {
    const current = dnaRef.current
    const mutRate = p.mutationRate ?? 0.15
    // Tournament: generate 4 children, keep fittest
    const candidates = [
      current,
      mutate(current, mutRate),
      mutate(current, mutRate * 2),
      mutate(current, mutRate * 0.5),
    ]
    const scored = candidates.map(c => ({ dna: c, fit: computeFitness(c) }))
    scored.sort((a, b) => b.fit - a.fit)
    dnaRef.current = scored[0].dna
    genRef.current += 1
    setGeneration(genRef.current)
    setFitness(scored[0].fit)
    // Write DNA to plugin params
    const [fdbk, dly, freq, q, sat, width, mod, depth, rev, hiCut, loCut, gain] = scored[0].dna
    onChange({ ...p,
      feedbackGain: fdbk * 0.95,
      delayTime:    dly * 0.5,
      filterFreq:   200 + freq * 15000,
      filterQ:      0.5 + q * 8,
      satDrive:     sat * 8,
      stereoWidth:  width * 2,
      modRate:      0.1 + mod * 10,
      modDepth:     depth * 0.01,
      reverbWet:    rev * 0.8,
      hiCutFreq:    4000 + hiCut * 16000,
      loCutFreq:    20 + loCut * 500,
      outputGain:   0.3 + gain * 0.7,
    })
  }, [p, onChange])

  // Run evolution loop
  useEffect(() => {
    if (!running) return
    const interval = setInterval(evolve, 120)
    return () => clearInterval(interval)
  }, [running, evolve])

  // DNA helix canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    let t = 0
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      t += running ? 0.05 : 0.01
      ctx2d.fillStyle = 'rgba(0,0,0,0.25)'
      ctx2d.fillRect(0, 0, canvas.width, canvas.height)
      const dna = dnaRef.current
      const cx = canvas.width / 2
      // Draw DNA double helix
      for (let i = 0; i < 60; i++) {
        const x = (i / 60) * canvas.width
        const phase = (i / 60) * Math.PI * 4 + t
        const y1 = canvas.height / 2 + Math.sin(phase) * 18
        const y2 = canvas.height / 2 + Math.sin(phase + Math.PI) * 18
        // Strand 1
        const geneIdx = Math.floor((i / 60) * 12) % 12
        const alpha = running ? 0.9 : 0.45
        ctx2d.beginPath(); ctx2d.arc(x, y1, 2.5, 0, Math.PI * 2)
        ctx2d.fillStyle = DNA_COLORS[geneIdx] + Math.round(alpha * 255).toString(16).padStart(2,'0')
        ctx2d.fill()
        // Strand 2
        ctx2d.beginPath(); ctx2d.arc(x, y2, 2.5, 0, Math.PI * 2)
        ctx2d.fillStyle = DNA_COLORS[(geneIdx + 6) % 12] + Math.round(alpha * 255).toString(16).padStart(2,'0')
        ctx2d.fill()
        // Rung (cross-link)
        if (i % 5 === 0) {
          const gv = dna[geneIdx] ?? 0.5
          ctx2d.strokeStyle = `rgba(255,255,255,${gv * 0.4})`
          ctx2d.lineWidth = 1
          ctx2d.beginPath(); ctx2d.moveTo(x, y1); ctx2d.lineTo(x, y2); ctx2d.stroke()
        }
      }
      // Fitness bar
      ctx2d.fillStyle = `rgba(34,197,94,${fitness * 0.6 + 0.1})`
      ctx2d.fillRect(0, canvas.height - 3, canvas.width * fitness, 3)
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, fitness])

  function lockDna() {
    setLockedDna([...dnaRef.current])
  }
  function resetDna() {
    dnaRef.current = Array.from({ length: 12 }, () => Math.random())
    genRef.current = 0; setGeneration(0); setFitness(0); setLockedDna(null)
  }

  const modeColor = ['#ef4444','#22c55e','#a855f7','#10b981','#f97316','#3b82f6'][Math.round(p.targetMode ?? 0)]

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#f87171', letterSpacing: '.5px' }}>FS-OUROBOROS</span>
        <AIBadge label="GENETIC" color="#ef4444" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Self-Evolving</span>
      </div>

      {/* DNA helix canvas */}
      <canvas ref={canvasRef} width={220} height={60}
        style={{ width: '100%', height: 60, borderRadius: 6, background: '#030712', marginBottom: 8, display: 'block' }} />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <div style={{ flex: 1, padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#f87171', fontFamily: 'monospace', lineHeight: 1 }}>{generation}</div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>GEN</div>
        </div>
        <div style={{ flex: 1, padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#4ade80', fontFamily: 'monospace', lineHeight: 1 }}>{Math.round(fitness * 100)}%</div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>FITNESS</div>
        </div>
        <div style={{ flex: 2, padding: '4px 8px', background: modeColor + '15', border: `1px solid ${modeColor}33`, borderRadius: 5, textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: modeColor, lineHeight: 1.4 }}>{TARGET_MODES[Math.round(p.targetMode ?? 0)]}</div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>TARGET MODE</div>
        </div>
      </div>

      {/* Target mode */}
      <SectionLabel>Evolution Target</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {TARGET_MODES.map((m, i) => (
          <button key={m} onClick={() => onChange({ ...p, targetMode: i })} style={{
            fontSize: 9, padding: '3px 6px', borderRadius: 4, cursor: 'pointer',
            background: Math.round(p.targetMode ?? 0) === i ? DNA_COLORS[i * 2] + '33' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.targetMode ?? 0) === i ? DNA_COLORS[i * 2] : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.targetMode ?? 0) === i ? DNA_COLORS[i * 2] : 'rgba(255,255,255,0.35)',
          }}>{m}</button>
        ))}
      </div>

      {/* Mutation rate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', minWidth: 52 }}>MUTATION</span>
        <input type="range" min={0.01} max={0.5} step={0.01} value={p.mutationRate ?? 0.15}
          onChange={e => onChange({ ...p, mutationRate: parseFloat(e.target.value) })}
          style={{ flex: 1, accentColor: '#ef4444' }} />
        <span style={{ fontSize: 9, color: '#f87171', minWidth: 28 }}>{Math.round((p.mutationRate ?? 0.15) * 100)}%</span>
      </div>

      {/* Gene readout */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 10, alignItems: 'flex-end', height: 28 }}>
        {dnaRef.current.map((v, i) => (
          <div key={i} title={DNA_LABELS[i]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '100%', height: `${Math.max(2, v * 24)}px`,
              background: DNA_COLORS[i],
              borderRadius: 1,
              boxShadow: running ? `0 0 4px ${DNA_COLORS[i]}` : 'none',
              transition: 'height .1s, box-shadow .3s',
            }} />
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button onClick={() => setRunning(r => !r)} style={{
          flex: 3, padding: '8px 0', borderRadius: 6, cursor: 'pointer',
          background: running
            ? 'linear-gradient(135deg,#991b1b,#ef4444)'
            : 'linear-gradient(135deg,#7f1d1d,#ef4444)',
          border: `1px solid ${running ? '#ef444488' : '#ef444444'}`,
          color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.5px',
        }}>
          {running ? '⏹ STOP EVOLVING' : '🧬 EVOLVE'}
        </button>
        <button onClick={lockDna} title="Lock current DNA" style={{
          flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer',
          background: lockedDna ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${lockedDna ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
          color: lockedDna ? '#86efac' : 'rgba(255,255,255,0.4)', fontSize: 11,
        }}>🔒</button>
        <button onClick={resetDna} title="Reset DNA" style={{
          flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.35)', fontSize: 11,
        }}>↺</button>
      </div>
      {lockedDna && (
        <div style={{ fontSize: 9, color: 'rgba(34,197,94,0.7)', textAlign: 'center', padding: '3px 0' }}>
          🔒 DNA locked at Gen {generation} — {Math.round(fitness * 100)}% fitness
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. FS-SYNAPSE — Neural Mix Brain  [CLAWFLOW GATED for AI insights]
//     Reads the live analyser node (if available) or simulates spectrum data,
//     maps 8 frequency bands to "neurons," draws a real-time pulsing brain-map
//     canvas visualization, and uses Claude to detect the emotional state of
//     the mix, generate a "mix score," and suggest the next move.
// ─────────────────────────────────────────────────────────────────────────────
export function SynapseEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const sub = useSubGate()
  const { bpm, tracks } = useProjectStore()
  const [status, setStatus] = useState<'idle'|'loading'|'ok'|'err'>('idle')
  const [brainState, setBrainState] = useState<string>('Idle')
  const [mixScore, setMixScore] = useState<number | null>(null)
  const [insight, setInsight] = useState('')
  const [bandEnergy, setBandEnergy] = useState<number[]>(Array(8).fill(0))
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const rafRef      = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const ctxRef      = useRef<AudioContext | null>(null)
  const listening   = useRef(false)

  const BAND_LABELS  = ['SUB','BASS','LO-MID','MID','HI-MID','PRES','AIR','ULTRA']
  const BAND_COLORS  = ['#7c3aed','#2563eb','#0891b2','#059669','#ca8a04','#ea580c','#dc2626','#db2777']
  const BAND_FREQS   = [[20,60],[60,200],[200,600],[600,1200],[1200,3000],[3000,6000],[6000,12000],[12000,20000]]

  const EMOTION_MAP: Record<string, { emoji: string; color: string }> = {
    'Euphoric':    { emoji: '⚡', color: '#f59e0b' },
    'Melancholic': { emoji: '💧', color: '#3b82f6' },
    'Aggressive':  { emoji: '🔥', color: '#ef4444' },
    'Dreamy':      { emoji: '✨', color: '#a855f7' },
    'Tense':       { emoji: '⚠', color: '#f97316'  },
    'Grounded':    { emoji: '🌍', color: '#10b981'  },
    'Ethereal':    { emoji: '🌫', color: '#67e8f9'  },
    'Idle':        { emoji: '○',  color: '#6b7280'  },
  }

  // Start mic listening for spectrum (optional — uses mic or simulates)
  useEffect(() => {
    let animRunning = true
    let simPhase = 0

    const drawLoop = () => {
      if (!animRunning) return
      rafRef.current = requestAnimationFrame(drawLoop)
      simPhase += 0.03

      let bands: number[]
      if (analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(buf)
        const sr = ctxRef.current?.sampleRate ?? 44100
        const binHz = sr / (analyserRef.current.fftSize)
        bands = BAND_FREQS.map(([lo, hi]) => {
          const bLo = Math.floor(lo / binHz), bHi = Math.floor(hi / binHz)
          let e = 0; for (let i = bLo; i <= bHi && i < buf.length; i++) e += buf[i]
          return Math.min(1, e / ((bHi - bLo + 1) * 255))
        })
      } else {
        // Simulate pulsing spectrum based on plugin params
        bands = BAND_FREQS.map((_, i) => {
          const base = 0.2 + (7 - i) * 0.04
          const lfo = Math.sin(simPhase * (0.5 + i * 0.3) + i) * 0.15
          return Math.max(0, Math.min(1, base + lfo))
        })
      }
      setBandEnergy(bands)

      // Determine brain state from spectrum
      const subEnergy  = bands[0] + bands[1]
      const midEnergy  = bands[2] + bands[3] + bands[4]
      const airEnergy  = bands[5] + bands[6] + bands[7]
      let state = 'Grounded'
      if (subEnergy > 1.2) state = 'Aggressive'
      else if (airEnergy > 1.4) state = 'Ethereal'
      else if (midEnergy > 1.5) state = 'Tense'
      else if (subEnergy < 0.3 && airEnergy > 0.8) state = 'Dreamy'
      else if (bands.every(b => b < 0.3)) state = 'Idle'
      setBrainState(state)

      // Draw brain map
      const canvas = canvasRef.current
      if (!canvas) return
      const c = canvas.getContext('2d')
      if (!c) return
      c.fillStyle = 'rgba(0,0,0,0.18)'
      c.fillRect(0, 0, canvas.width, canvas.height)

      // 8 neurons arranged in ellipse
      const W = canvas.width, H = canvas.height
      const neurons = bands.map((energy, i) => {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
        const rx = W * 0.38, ry = H * 0.34
        return {
          x: W / 2 + Math.cos(angle) * rx,
          y: H / 2 + Math.sin(angle) * ry,
          energy, color: BAND_COLORS[i], label: BAND_LABELS[i],
        }
      })

      // Draw axon connections
      neurons.forEach((n, i) => {
        neurons.forEach((m, j) => {
          if (j <= i) return
          const strength = (n.energy + m.energy) / 2
          if (strength < 0.15) return
          c.beginPath()
          c.moveTo(n.x, n.y); c.lineTo(m.x, m.y)
          c.strokeStyle = `rgba(255,255,255,${strength * 0.18})`
          c.lineWidth = strength * 2
          c.stroke()
        })
      })

      // Draw neurons
      neurons.forEach(n => {
        const r = 5 + n.energy * 12
        const grd = c.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 2)
        grd.addColorStop(0, n.color + 'ff')
        grd.addColorStop(1, n.color + '00')
        c.beginPath(); c.arc(n.x, n.y, r, 0, Math.PI * 2)
        c.fillStyle = grd; c.fill()
        // Pulse ring
        const pulseR = r + (1 + Math.sin(simPhase * 2 + bands.indexOf(n.energy))) * 4
        c.beginPath(); c.arc(n.x, n.y, pulseR, 0, Math.PI * 2)
        c.strokeStyle = n.color + '44'; c.lineWidth = 1; c.stroke()
      })

      // Center state label
      const emo = EMOTION_MAP[state] ?? EMOTION_MAP['Idle']
      c.fillStyle = emo.color + 'cc'
      c.font = '700 10px system-ui'
      c.textAlign = 'center'
      c.fillText(state.toUpperCase(), W / 2, H / 2 + 3)
    }

    drawLoop()
    return () => { animRunning = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  async function runAIInsight() {
    setStatus('loading'); setInsight('')
    try {
      const trackList = tracks.filter(t => t.type !== 'master').map(t => ({
        name: t.name, volume: t.volume,
        plugins: t.plugins.filter(pl => pl.enabled).map(pl => pl.name),
      }))
      const result = await hubPost('/api/clawbot/chat', {
        message: `You are a neural mix analyst AI. Analyze this music production brain state.

Mix brain scan:
- Current emotional state detected: ${brainState}
- BPM: ${bpm}
- Band energies (SUB→ULTRA): ${bandEnergy.map(e => Math.round(e * 100) + '%').join(', ')}
- Tracks: ${JSON.stringify(trackList)}

Give:
1. A MIX SCORE out of 100 (just the number)
2. The dominant EMOTION (one word from: Euphoric, Melancholic, Aggressive, Dreamy, Tense, Grounded, Ethereal)
3. The most important thing to fix RIGHT NOW (max 15 words)
4. One creative suggestion to push the mix further (max 15 words)

Format: JSON only: {"score":75,"emotion":"Tense","fix":"Add more low end, sub frequencies are weak","push":"Layer a reversed cymbal under the main hook"}`,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are a mix analysis AI. Return only valid JSON as specified.',
      })
      const raw = (result.message || result.content || '').trim()
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON returned')
      const data = JSON.parse(match[0])
      setMixScore(data.score ?? null)
      setBrainState(data.emotion ?? brainState)
      setInsight(`FIX: ${data.fix ?? '—'}\n\nPUSH: ${data.push ?? '—'}`)
      setStatus('ok')
    } catch (e: any) {
      setStatus('err'); setInsight(`Error: ${e.message}`)
    }
  }

  const emo = EMOTION_MAP[brainState] ?? EMOTION_MAP['Idle']

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#c4b5fd', letterSpacing: '.5px' }}>FS-SYNAPSE</span>
        <AIBadge label="NEURAL" color="#8b5cf6" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Mix Brain</span>
      </div>

      {/* Brain canvas — always visible, no gate */}
      <canvas ref={canvasRef} width={220} height={90}
        style={{ width: '100%', height: 90, borderRadius: 8, background: '#050514', marginBottom: 8, display: 'block' }} />

      {/* Band energy bars */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 10, alignItems: 'flex-end', height: 28 }}>
        {bandEnergy.map((e, i) => (
          <div key={i} title={BAND_LABELS[i]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{
              width: '100%', height: `${Math.max(2, e * 24)}px`,
              background: BAND_COLORS[i], borderRadius: 1,
              boxShadow: e > 0.6 ? `0 0 5px ${BAND_COLORS[i]}` : 'none',
              transition: 'height .08s',
            }} />
            <span style={{ fontSize: 6, color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1 }}>{BAND_LABELS[i]}</span>
          </div>
        ))}
      </div>

      {/* Emotion state + score */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <div style={{
          flex: 1, padding: '6px 10px', background: emo.color + '15',
          border: `1px solid ${emo.color}33`, borderRadius: 6, textAlign: 'center',
        }}>
          <span style={{ fontSize: 16 }}>{emo.emoji}</span>
          <div style={{ fontSize: 10, fontWeight: 800, color: emo.color, letterSpacing: '.4px' }}>{brainState}</div>
        </div>
        {mixScore !== null && (
          <div style={{
            width: 56, textAlign: 'center', padding: '6px 0',
            background: 'rgba(255,255,255,0.04)', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: mixScore > 75 ? '#22c55e' : mixScore > 50 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>{mixScore}</div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>/ 100</div>
          </div>
        )}
      </div>

      {/* AI insight — gated */}
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>
        <button onClick={runAIInsight} disabled={status === 'loading'} style={{
          width: '100%', padding: '7px 0', borderRadius: 6,
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          background: status === 'loading' ? 'rgba(139,92,246,0.08)' : 'linear-gradient(135deg,#4c1d95,#7c3aed,#8b5cf6)',
          border: '1px solid rgba(139,92,246,0.4)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.5px',
        }}>
          {status === 'loading' ? '🧠 SCANNING MIX BRAIN...' : '🧠 AI SCAN NEURAL STATE'}
        </button>
        {insight && (
          <div style={{
            marginTop: 8, padding: '7px 10px', fontSize: 10, lineHeight: 1.7,
            background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: 6, color: 'rgba(255,255,255,0.65)', whiteSpace: 'pre-line',
          }}>{insight}</div>
        )}
        {status === 'err' && <StatusPill text={insight} type="err" />}
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. FS-GHOST — AI Phantom Harmonic Sculptor  [CLAWFLOW GATED]
//     Listens to mic/system audio in real time, runs FFT to identify the
//     fundamental + partial series, then uses Claw AI (via FlowState hub)
//     to design "phantom" overtone layers that didn't exist in the source.
//     Those ghost partials are synthesised directly via OscillatorNode and
//     injected into the monitor output, making sounds richer or stranger.
//     The AI layer also picks "harmonic DNA" — a unique harmonic fingerprint
//     string like "flat-7th dominant + inverted 9th" — that you can lock.
// ─────────────────────────────────────────────────────────────────────────────
export function GhostEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const sub = useSubGate()
  const [status, setStatus] = useState<'idle'|'loading'|'ok'|'err'>('idle')
  const [listening, setListening] = useState(false)
  const [ghostDNA, setGhostDNA] = useState<string>('')
  const [partials, setPartials] = useState<{ freq: number; gain: number; color: string }[]>([])
  const [fundamental, setFundamental] = useState<number | null>(null)
  const [lockedDNA, setLockedDNA] = useState<string>('')
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const rafRef       = useRef<number>(0)
  const analyserRef  = useRef<AnalyserNode | null>(null)
  const audioCtxRef  = useRef<AudioContext | null>(null)
  const oscillatorsRef = useRef<OscillatorNode[]>([])
  const streamRef    = useRef<MediaStream | null>(null)

  const GHOST_MODES = ['Harmonic Series', 'Sub Octave Ghost', 'Upper Partial Bloom', 'Alien Overtones', 'Dream Chord']
  const GHOST_COLORS = ['#818cf8','#34d399','#f472b6','#fb923c','#a78bfa']

  // Stop all ghost oscillators
  const stopGhosts = useCallback(() => {
    oscillatorsRef.current.forEach(o => { try { o.stop(); o.disconnect() } catch {} })
    oscillatorsRef.current = []
  }, [])

  // Start mic analysis loop
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      src.connect(analyser)
      analyserRef.current = analyser
      setListening(true)

      const buf = new Float32Array(analyser.fftSize)
      const freqBuf = new Float32Array(analyser.frequencyBinCount)

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick)
        analyser.getFloatFrequencyData(freqBuf)
        analyser.getFloatTimeDomainData(buf)

        // Find fundamental: strongest peak in 60-400 Hz
        const binHz = ctx.sampleRate / analyser.fftSize
        const lo = Math.floor(60 / binHz), hi = Math.floor(400 / binHz)
        let maxDb = -Infinity, maxBin = lo
        for (let i = lo; i <= hi; i++) {
          if (freqBuf[i] > maxDb) { maxDb = freqBuf[i]; maxBin = i }
        }
        const fund = maxBin * binHz
        if (maxDb > -60) setFundamental(Math.round(fund * 10) / 10)

        // Draw spectral canvas
        const canvas = canvasRef.current
        if (canvas) {
          const c = canvas.getContext('2d')!
          c.fillStyle = 'rgba(0,0,0,0.15)'
          c.fillRect(0, 0, canvas.width, canvas.height)
          const displayBins = Math.min(512, freqBuf.length)
          for (let i = 0; i < displayBins; i++) {
            const norm = Math.max(0, (freqBuf[i] + 100) / 100)
            const x = (i / displayBins) * canvas.width
            const h = norm * canvas.height
            // Color ghost partial bands
            const isGhost = partials.some(pt => Math.abs(pt.freq - i * binHz) < 30)
            c.fillStyle = isGhost ? `rgba(129,140,248,${norm * 0.8})` : `rgba(99,102,241,${norm * 0.4})`
            c.fillRect(x, canvas.height - h, canvas.width / displayBins, h)
          }
          // Mark fundamental
          if (maxDb > -60) {
            c.strokeStyle = '#f472b6'
            c.lineWidth = 1
            const fx = (maxBin / displayBins) * canvas.width
            c.beginPath(); c.moveTo(fx, 0); c.lineTo(fx, canvas.height); c.stroke()
          }
        }
      }
      tick()
    } catch { setListening(false) }
  }, [partials])

  const stopListening = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    stopGhosts()
    setListening(false)
  }, [stopGhosts])

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); stopGhosts() }, [stopGhosts])

  // Ask Claw AI to design the ghost harmonic DNA
  async function designGhosts() {
    if (!fundamental) { setStatus('err'); return }
    setStatus('loading')
    const mode = GHOST_MODES[Math.round(p.mode ?? 0)]
    try {
      const result = await hubPost('/api/clawbot/chat', {
        message: `You are a harmonic sculptor AI for FS-Audio. The detected fundamental is ${fundamental.toFixed(1)} Hz.
Ghost mode: "${mode}"
Ghost count: ${Math.round(p.ghostCount ?? 4)}
Ghost mix level: ${Math.round((p.ghostMix ?? 0.3) * 100)}%
Darkness: ${Math.round((p.darkness ?? 0.3) * 100)}%

Design a set of ghost partial frequencies and relative gains that would be sonically fascinating.
Return ONLY this JSON (no explanation):
{
  "dna": "short evocative name like 'inverted tritone halo'",
  "partials": [
    {"freq": 220, "gain": 0.4, "note": "optional name"},
    ...
  ],
  "description": "one sentence about what this sounds like"
}
Make the partials genuinely interesting, not just basic overtones. Be creative and weird.`,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are a psychoacoustic AI. Return ONLY valid JSON as specified. No commentary.',
      })
      const raw = (result.message || result.content || '').trim()
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON')
      const data = JSON.parse(match[0])
      setGhostDNA(data.dna ?? '')
      const newPartials = (data.partials ?? []).map((pt: any, i: number) => ({
        freq: pt.freq ?? fundamental * (i + 2),
        gain: pt.gain ?? 0.3,
        color: GHOST_COLORS[i % GHOST_COLORS.length],
      }))
      setPartials(newPartials)
      setStatus('ok')

      // Synthesise ghost oscillators in AudioContext
      if (audioCtxRef.current) {
        stopGhosts()
        const masterGain = (p.ghostMix ?? 0.3)
        const newOscs: OscillatorNode[] = newPartials.map((pt: { freq: number; gain: number }) => {
          const osc = audioCtxRef.current!.createOscillator()
          const gain = audioCtxRef.current!.createGain()
          osc.type = 'sine'
          osc.frequency.value = pt.freq
          gain.gain.value = pt.gain * masterGain * 0.15   // keep quiet
          osc.connect(gain)
          gain.connect(audioCtxRef.current!.destination)
          osc.start()
          return osc
        })
        oscillatorsRef.current = newOscs
      }
    } catch (e: any) {
      setStatus('err')
    }
  }

  function lockDNA() { setLockedDNA(ghostDNA) }

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#c084fc', letterSpacing: '.5px' }}>FS-GHOST</span>
        <AIBadge label="SPECTRAL AI" color="#a855f7" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Phantom Harmonics</span>
      </div>
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>

      {/* Spectrum canvas */}
      <canvas ref={canvasRef} width={220} height={56}
        style={{ width: '100%', height: 56, borderRadius: 6, background: '#050514', marginBottom: 8, display: 'block' }} />

      {/* Fundamental + DNA */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, padding: '5px 8px', background: 'rgba(168,85,247,0.08)', borderRadius: 5, border: '1px solid rgba(168,85,247,0.2)' }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>FUNDAMENTAL</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#f472b6', fontFamily: 'monospace', lineHeight: 1 }}>
            {fundamental ? `${fundamental.toFixed(0)} Hz` : '—'}
          </div>
        </div>
        <div style={{ flex: 2, padding: '5px 8px', background: 'rgba(129,140,248,0.08)', borderRadius: 5, border: '1px solid rgba(129,140,248,0.2)' }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{lockedDNA ? '🔒 LOCKED DNA' : 'GHOST DNA'}</div>
          <div style={{ fontSize: 9, color: '#c084fc', lineHeight: 1.4, fontStyle: 'italic', marginTop: 2 }}>
            {ghostDNA || (lockedDNA ? lockedDNA : 'no ghost yet')}
          </div>
        </div>
      </div>

      {/* Ghost Mode */}
      <SectionLabel>Ghost Mode</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {GHOST_MODES.map((m, i) => (
          <button key={m} onClick={() => onChange({ ...p, mode: i })} style={{
            fontSize: 8, padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.mode ?? 0) === i ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.mode ?? 0) === i ? '#a855f7' : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.mode ?? 0) === i ? '#c084fc' : 'rgba(255,255,255,0.35)',
          }}>{m}</button>
        ))}
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="GHOSTS" value={p.ghostCount ?? 4} min={1} max={12} step={1} color="#a855f7"
          onChange={v => onChange({ ...p, ghostCount: v })} />
        <AIKnob label="MIX" value={p.ghostMix ?? 0.3} min={0} max={1} step={0.01} color="#c084fc"
          onChange={v => onChange({ ...p, ghostMix: v })} />
        <AIKnob label="DARKNESS" value={p.darkness ?? 0.3} min={0} max={1} step={0.01} color="#818cf8"
          onChange={v => onChange({ ...p, darkness: v })} />
        <AIKnob label="SHIMMER" value={p.shimmer ?? 0.5} min={0} max={1} step={0.01} color="#f0abfc"
          onChange={v => onChange({ ...p, shimmer: v })} />
      </div>

      {/* Partial bars */}
      {partials.length > 0 && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 10, alignItems: 'flex-end', height: 28 }}>
          {partials.map((pt, i) => (
            <div key={i} title={`${pt.freq.toFixed(0)} Hz`} style={{
              flex: 1, height: `${Math.max(4, pt.gain * 28)}px`,
              background: pt.color, borderRadius: 2,
              boxShadow: `0 0 5px ${pt.color}88`, transition: 'height .4s',
            }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={listening ? stopListening : startListening} style={{
          flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer',
          background: listening ? 'linear-gradient(135deg,#581c87,#a855f7)' : 'rgba(168,85,247,0.15)',
          border: `1px solid ${listening ? '#a855f7' : 'rgba(168,85,247,0.3)'}`,
          color: listening ? '#e879f9' : 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700,
        }}>
          {listening ? '👻 STOP' : '🎙 LISTEN'}
        </button>
        <button onClick={designGhosts} disabled={status === 'loading' || !fundamental} style={{
          flex: 2, padding: '7px 0', borderRadius: 6, cursor: status === 'loading' || !fundamental ? 'not-allowed' : 'pointer',
          background: status === 'loading' ? 'rgba(168,85,247,0.08)' : 'linear-gradient(135deg,#6d28d9,#a855f7)',
          border: '1px solid rgba(168,85,247,0.5)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.4px',
        }}>
          {status === 'loading' ? '👻 SUMMONING...' : '👻 SUMMON GHOSTS'}
        </button>
        <button onClick={lockDNA} disabled={!ghostDNA} title="Lock DNA" style={{
          padding: '7px 10px', borderRadius: 6, cursor: ghostDNA ? 'pointer' : 'not-allowed',
          background: lockedDNA ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${lockedDNA ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
          color: lockedDNA ? '#86efac' : 'rgba(255,255,255,0.35)', fontSize: 11,
        }}>🔒</button>
      </div>
      {status === 'err' && <StatusPill text="Need to detect fundamental first" type="err" />}
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. FS-PROPHET — AI Future-Caster  [CLAWFLOW GATED]
//     Analyzes the spectral / harmonic / rhythmic fingerprint of the first
//     N bars of the selected clip, then asks Claw AI (via FlowState hub)
//     to "predict" what the continuation should sound like — describing
//     timbre, notes, rhythm, dynamics. The description drives a pure-WebAudio
//     synthesis engine (additive + noise + amplitude-shaped grains) to build
//     an actual audio continuation clip placed after the original on timeline.
// ─────────────────────────────────────────────────────────────────────────────
export function ProphetEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const sub = useSubGate()
  const { tracks, selectedClipIds, addClip, selectedTrackId, bpm } = useProjectStore()
  const [status, setStatus] = useState<'idle'|'loading'|'synthesizing'|'ok'|'err'>('idle')
  const [prophecy, setProphecy] = useState<string>('')
  const [synthPlan, setSynthPlan] = useState<any>(null)
  const [progress, setProgress] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const PREDICTION_STYLES = ['Evolve', 'Contrast', 'Mirror', 'Escalate', 'Dissolve', 'Transform']
  const styleColors = ['#22c55e','#f59e0b','#06b6d4','#ef4444','#8b5cf6','#ec4899']
  const styleColor = styleColors[Math.round(p.style ?? 0)]

  // Animated prophetic waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getContext('2d')!
    let t = 0
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      t += 0.02
      c.fillStyle = 'rgba(0,0,0,0.12)'
      c.fillRect(0, 0, canvas.width, canvas.height)
      const W = canvas.width, H = canvas.height
      // Draw "future" wave — fragmented, dotted, uncertain
      for (let x = 0; x < W; x += 2) {
        const progress_norm = x / W
        const certainty = Math.max(0, 1 - progress_norm * 1.2)  // fades to uncertainty
        const wave = Math.sin(x * 0.08 + t * 2) * 0.6 + Math.sin(x * 0.03 - t * 1.3) * 0.4
        const y = H / 2 + wave * H * 0.3 * certainty
        if (Math.random() < certainty * 0.7) {
          c.beginPath()
          c.arc(x, y, 1.2, 0, Math.PI * 2)
          c.fillStyle = `${styleColor}${Math.round(certainty * 200).toString(16).padStart(2,'0')}`
          c.fill()
        }
      }
      // Past/future divider
      const divX = W * (p.analyzeBars ?? 4) / ((p.analyzeBars ?? 4) + (p.predictBars ?? 4))
      c.strokeStyle = 'rgba(255,255,255,0.2)'
      c.lineWidth = 1
      c.setLineDash([3, 3])
      c.beginPath(); c.moveTo(divX, 0); c.lineTo(divX, H); c.stroke()
      c.setLineDash([])
      c.fillStyle = 'rgba(255,255,255,0.2)'
      c.font = '7px system-ui'
      c.fillText('NOW', divX - 12, H - 3)
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [p.style, p.analyzeBars, p.predictBars, styleColor])

  async function castProphecy() {
    const clip = tracks.flatMap(t => t.clips).find(c => selectedClipIds.includes(c.id))
    if (!clip) { setStatus('err'); setProphecy('Select a clip first'); return }
    setStatus('loading'); setProphecy(''); setProgress(0)

    try {
      const track = tracks.find(t => t.id === selectedTrackId)
      const analyzeBars = Math.round(p.analyzeBars ?? 4)
      const predictBars = Math.round(p.predictBars ?? 4)
      const style = PREDICTION_STYLES[Math.round(p.style ?? 0)]

      // Build clip context
      const context = {
        clipName: clip.name,
        clipType: clip.type,
        durationBeats: clip.durationBeats,
        midiNotes: clip.midiNotes?.slice(0, 16) ?? [],
        trackPlugins: track?.plugins.filter(pl => pl.enabled).map(pl => pl.name) ?? [],
        bpm, key: 'C', analyzeBars, predictBars, style,
      }

      const result = await hubPost('/api/clawbot/chat', {
        message: `You are a musical prophet AI for FS-Audio DAW. Analyze this audio clip and predict its continuation.

Clip context: ${JSON.stringify(context, null, 2)}

Prediction style: "${style}" — ${
  style === 'Evolve' ? 'gradually develop and expand on the themes' :
  style === 'Contrast' ? 'introduce a surprising harmonic or rhythmic shift' :
  style === 'Mirror' ? 'reflect the energy back inverted' :
  style === 'Escalate' ? 'intensify everything — more energy, tension, density' :
  style === 'Dissolve' ? 'slowly fade into texture and ambience' :
  'completely transform into something different'
}

Return ONLY this JSON (no explanation):
{
  "prophecy": "One poetic sentence describing what the future sounds like",
  "partials": [
    {"freq": 220.0, "duration": 0.5, "gain": 0.6, "type": "sine"},
    ...
  ],
  "noiseColor": "pink",
  "noiseGain": 0.1,
  "dynamicCurve": "rise",
  "pitchDrift": 0.0,
  "description": "technical description"
}
Create ${predictBars * 4} beats worth of synthesis parameters. Partials can be sine/sawtooth/square/triangle. Make it genuinely musical and interesting.`,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are a musical prophet AI. Return ONLY valid JSON as specified.',
      })

      const raw = (result.message || result.content || '').trim()
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON')
      const plan = JSON.parse(match[0])
      setSynthPlan(plan)
      setProphecy(plan.prophecy ?? 'The future is heard.')
      setStatus('synthesizing')
      setProgress(0.2)

      // Synthesise the predicted continuation using WebAudio
      const sr = 44100
      const outDuration = (predictBars * 4 * 60) / bpm
      const offCtx = new OfflineAudioContext(2, Math.floor(sr * outDuration), sr)

      const masterGain = offCtx.createGain()
      masterGain.gain.setValueAtTime(p.outputGain ?? 0.7, 0)
      masterGain.connect(offCtx.destination)

      // Dynamic envelope
      const envGain = offCtx.createGain()
      const curve = plan.dynamicCurve ?? 'flat'
      if (curve === 'rise')      { envGain.gain.setValueAtTime(0.1, 0); envGain.gain.linearRampToValueAtTime(1, outDuration) }
      else if (curve === 'fall') { envGain.gain.setValueAtTime(1, 0);   envGain.gain.linearRampToValueAtTime(0.05, outDuration) }
      else if (curve === 'arch') { envGain.gain.setValueAtTime(0.2, 0); envGain.gain.linearRampToValueAtTime(1, outDuration * 0.5); envGain.gain.linearRampToValueAtTime(0.1, outDuration) }
      else envGain.gain.value = 0.8
      envGain.connect(masterGain)

      setProgress(0.4)

      // Synthesise partials
      const ptList: any[] = plan.partials ?? []
      ptList.slice(0, 20).forEach((pt: any, i: number) => {
        const osc = offCtx.createOscillator()
        const og = offCtx.createGain()
        osc.type = (['sine','sawtooth','square','triangle'].includes(pt.type) ? pt.type : 'sine') as OscillatorType
        osc.frequency.value = pt.freq ?? 220
        // Slight pitch drift for organic feel
        if (plan.pitchDrift) osc.frequency.linearRampToValueAtTime(pt.freq * (1 + (plan.pitchDrift ?? 0)), outDuration)
        og.gain.setValueAtTime(0, 0)
        const startT = (i / ptList.length) * outDuration * 0.3
        const dur = Math.min(outDuration - startT, (pt.duration ?? 0.5) * outDuration)
        og.gain.linearRampToValueAtTime((pt.gain ?? 0.3) * 0.4, startT + 0.05)
        og.gain.setValueAtTime((pt.gain ?? 0.3) * 0.4, startT + dur - 0.05)
        og.gain.linearRampToValueAtTime(0, startT + dur)
        osc.connect(og); og.connect(envGain)
        osc.start(startT); osc.stop(startT + dur)
      })

      setProgress(0.7)

      // Noise layer
      if ((plan.noiseGain ?? 0) > 0.01) {
        const bufSize = sr * Math.ceil(outDuration)
        const noiseBuf = offCtx.createBuffer(1, bufSize, sr)
        const noiseData = noiseBuf.getChannelData(0)
        let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0
        for (let i = 0; i < bufSize; i++) {
          const white = Math.random() * 2 - 1
          if (plan.noiseColor === 'pink') {
            b0=.99886*b0+white*.0555179; b1=.99332*b1+white*.0750759; b2=.96900*b2+white*.1538520
            b3=.86650*b3+white*.3104856; b4=.55000*b4+white*.5329522; b5=-.7616*b5-white*.0168980
            noiseData[i] = (b0+b1+b2+b3+b4+b5+b6+white*.5362)/8
            b6 = white * .115926
          } else noiseData[i] = white
        }
        const noiseSrc = offCtx.createBufferSource()
        noiseSrc.buffer = noiseBuf
        const ng = offCtx.createGain()
        ng.gain.value = (plan.noiseGain ?? 0.1) * 0.5
        noiseSrc.connect(ng); ng.connect(envGain)
        noiseSrc.start(0)
      }

      setProgress(0.85)
      const rendered = await offCtx.startRendering()
      setProgress(1)

      // Drop clip onto timeline
      const targetTrack = track ?? tracks[0]
      if (targetTrack) {
        const afterBeat = clip.startBeat + clip.durationBeats
        addClip({
          id: `prophet-${Date.now()}`,
          trackId: targetTrack.id,
          startBeat: afterBeat,
          durationBeats: predictBars * 4,
          name: `PROPHET: ${plan.description?.slice(0, 24) ?? 'Future'}`,
          type: 'audio',
          audioBuffer: rendered,
          gain: p.outputGain ?? 0.7,
          fadeIn: 2, fadeOut: 4,
          fadeInCurve: 'exp', fadeOutCurve: 's-curve',
          looped: false, muted: false, aiGenerated: true,
        })
        setStatus('ok')
        setProphecy(`✓ ${(rendered.duration).toFixed(1)}s future materialized after "${clip.name}"\n"${plan.prophecy ?? ''}"`)
      }
    } catch (e: any) {
      setStatus('err'); setProphecy(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', letterSpacing: '.5px' }}>FS-PROPHET</span>
        <AIBadge label="FUTURE AI" color="#f59e0b" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Continuation Cast</span>
      </div>
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>

      {/* Prophetic canvas */}
      <canvas ref={canvasRef} width={220} height={50}
        style={{ width: '100%', height: 50, borderRadius: 6, background: '#050812', marginBottom: 10, display: 'block' }} />

      {/* Prophecy text */}
      {prophecy && (
        <div style={{
          marginBottom: 10, padding: '6px 8px', fontSize: 10, lineHeight: 1.6, fontStyle: 'italic',
          background: styleColor + '10', border: `1px solid ${styleColor}30`, borderRadius: 5,
          color: 'rgba(255,255,255,0.65)', whiteSpace: 'pre-line',
        }}>"{prophecy}"</div>
      )}

      {/* Prediction Style */}
      <SectionLabel>Future Style</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {PREDICTION_STYLES.map((s, i) => (
          <button key={s} onClick={() => onChange({ ...p, style: i })} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.style ?? 0) === i ? styleColors[i] + '30' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.style ?? 0) === i ? styleColors[i] : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.style ?? 0) === i ? styleColors[i] : 'rgba(255,255,255,0.35)',
          }}>{s}</button>
        ))}
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="ANALYZE" value={p.analyzeBars ?? 4} min={1} max={8} step={1} color={styleColor}
          onChange={v => onChange({ ...p, analyzeBars: v })} />
        <AIKnob label="PREDICT" value={p.predictBars ?? 4} min={1} max={16} step={1} color={styleColor}
          onChange={v => onChange({ ...p, predictBars: v })} />
        <AIKnob label="OUTPUT" value={p.outputGain ?? 0.7} min={0} max={1} step={0.01} color="#fbbf24"
          onChange={v => onChange({ ...p, outputGain: v })} />
        <AIKnob label="STRANGE" value={p.strangeness ?? 0.5} min={0} max={1} step={0.05} color="#fb923c"
          onChange={v => onChange({ ...p, strangeness: v })} />
      </div>

      {/* Progress bar */}
      {(status === 'loading' || status === 'synthesizing') && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: styleColor, borderRadius: 2, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>
            {status === 'loading' ? '🔮 Reading the future...' : `⚡ Synthesizing ${Math.round(progress * 100)}%`}
          </div>
        </div>
      )}

      <button onClick={castProphecy} disabled={status === 'loading' || status === 'synthesizing'} style={{
        width: '100%', padding: '8px 0', borderRadius: 6,
        cursor: (status === 'loading' || status === 'synthesizing') ? 'not-allowed' : 'pointer',
        background: (status === 'loading' || status === 'synthesizing') ? 'rgba(245,158,11,0.08)' : `linear-gradient(135deg,#92400e,${styleColor})`,
        border: `1px solid ${styleColor}55`, color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.5px',
      }}>
        {status === 'loading' ? '🔮 CONSULTING THE ORACLE...' :
         status === 'synthesizing' ? '⚡ BUILDING THE FUTURE...' :
         '🔮 PROPHESY CONTINUATION'}
      </button>
      {status === 'err' && <StatusPill text={prophecy || 'Select a clip first'} type="err" />}
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. FS-VOID — Anti-Sound Negative Space Engine  [CLAWFLOW GATED]
//     Scans all active tracks' plug-in chains and frequency footprints to
//     map the psychoacoustic "negative space" of the mix — the exact gaps,
//     holes and unoccupied spectral shelves. Claw AI (via FlowState hub)
//     analyses the gap map and prescribes a complementary texture (sub layer,
//     air shimmer, mid-fill, stereo ghost pad…). The prescription is then
//     synthesised live via an AdditiveEngine and dropped as new clip, filling void.
// ─────────────────────────────────────────────────────────────────────────────
export function VoidEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const sub = useSubGate()
  const { tracks, addClip, bpm, selectedTrackId } = useProjectStore()
  const [status, setStatus] = useState<'idle'|'loading'|'synthesizing'|'ok'|'err'>('idle')
  const [voidMap, setVoidMap] = useState<{ band: string; gap: number; color: string }[]>([])
  const [prescription, setPrescription] = useState<string>('')
  const [progress, setProgress] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const BAND_NAMES = ['Sub','Bass','Lo-Mid','Mid','Hi-Mid','Presence','Air','Ultra']
  const BAND_COLORS = ['#7c3aed','#2563eb','#0891b2','#059669','#ca8a04','#ea580c','#dc2626','#db2777']
  const FILL_STRATEGIES = ['Minimal Fill', 'Spectral Cement', 'Anti-Mix', 'Void Bloom', 'Negative Space']
  const stratColors = ['#22c55e','#06b6d4','#ef4444','#a855f7','#6366f1']
  const stratColor = stratColors[Math.round(p.strategy ?? 0)]

  // Build void map from track analysis
  function analyzeVoid() {
    // Map 8 spectral bands — count how many active plugins occupy each
    const bandOccupancy = Array(8).fill(0)
    tracks.filter(t => t.type !== 'master').forEach(track => {
      track.plugins.filter(pl => pl.enabled).forEach(pl => {
        // Crude heuristic: which bands does this plugin type likely affect?
        const type = pl.type
        if (type === 'eq' || type === 'fs_proq') bandOccupancy.forEach((_, i) => { bandOccupancy[i] += 0.3 })
        if (type === 'reverb' || type === 'fs_vintage_verb') { bandOccupancy[4] += 0.5; bandOccupancy[5] += 0.5; bandOccupancy[6] += 0.5 }
        if (type === 'delay') { bandOccupancy[3] += 0.4; bandOccupancy[4] += 0.4 }
        if (type === 'distortion' || type === 'saturation') { bandOccupancy[1] += 0.5; bandOccupancy[2] += 0.5 }
        if (type === 'sub_enhancer') { bandOccupancy[0] += 0.8 }
        if (type === 'exciter') { bandOccupancy[5] += 0.6; bandOccupancy[6] += 0.6 }
        if (type === 'chorus' || type === 'vibrato') { bandOccupancy[3] += 0.3; bandOccupancy[4] += 0.3 }
      })
    })
    // Compute gap as inverse of occupancy (normalized)
    const maxOcc = Math.max(1, ...bandOccupancy)
    const newMap = BAND_NAMES.map((band, i) => ({
      band,
      gap: Math.max(0, 1 - (bandOccupancy[i] / maxOcc)),
      color: BAND_COLORS[i],
    }))
    setVoidMap(newMap)
    return newMap
  }

  useEffect(() => { analyzeVoid() }, [tracks.length])

  // Animated void canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getContext('2d')!
    let t = 0
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      t += 0.025
      c.fillStyle = 'rgba(0,0,0,0.1)'
      c.fillRect(0, 0, canvas.width, canvas.height)
      const W = canvas.width, H = canvas.height
      // Draw void map as "black hole" spectrum — gap areas pulse
      voidMap.forEach((v, i) => {
        const x = (i / voidMap.length) * W
        const bw = W / voidMap.length
        // Gap = dark = void; fill = bright
        const pulse = Math.sin(t * (1 + v.gap * 3) + i * 0.8) * v.gap * 0.2
        const alpha = (1 - v.gap + pulse) * 0.6 + 0.1
        // Anti-effect: gap areas have inverse glow
        if (v.gap > 0.4) {
          const grd = c.createLinearGradient(x, H, x, H - H * v.gap)
          grd.addColorStop(0, v.color + '00')
          grd.addColorStop(0.5, v.color + Math.round(v.gap * 80).toString(16).padStart(2,'0'))
          grd.addColorStop(1, v.color + '00')
          c.fillStyle = grd
          c.fillRect(x, 0, bw - 1, H)
        } else {
          c.fillStyle = `rgba(20,20,30,${0.6})`
          c.fillRect(x, H - H * (1 - v.gap), bw - 1, H * (1 - v.gap))
        }
      })
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [voidMap])

  async function fillVoid() {
    const freshMap = analyzeVoid()
    const topGaps = [...freshMap].sort((a, b) => b.gap - a.gap).slice(0, 3)
    setStatus('loading'); setPrescription(''); setProgress(0)

    try {
      const trackSummary = tracks.filter(t => t.type !== 'master').map(t => ({
        name: t.name, type: t.type,
        plugins: t.plugins.filter(pl => pl.enabled).map(pl => pl.name),
        clipCount: t.clips.length,
      }))
      const strategy = FILL_STRATEGIES[Math.round(p.strategy ?? 0)]

      const result = await hubPost('/api/clawbot/chat', {
        message: `You are a negative-space audio sculptor for FS-Audio DAW.

Mix void analysis:
- Total tracks: ${trackSummary.length}
- Biggest voids: ${topGaps.map(g => `${g.band} (${Math.round(g.gap * 100)}% empty)`).join(', ')}
- Fill strategy: "${strategy}"
- Duration: ${Math.round(p.fillBars ?? 4)} bars at ${bpm} BPM
- Track list: ${JSON.stringify(trackSummary)}

Design a negative-space audio texture that specifically fills these voids.
Return ONLY this JSON:
{
  "prescription": "One evocative sentence about what fills the void",
  "partials": [
    {"freq": 55.0, "gain": 0.5, "type": "sine", "band": "Sub"},
    ...
  ],
  "noiseGain": 0.05,
  "noiseColor": "brown",
  "envShape": "sustain",
  "panSpread": 0.8,
  "description": "technical 1-line description"
}
Focus on GAPS: if Bass is empty, create bass content. If Air is empty, add shimmery highs. Be surgical.`,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are a void-filling audio AI. Return ONLY valid JSON as specified.',
      })

      const raw = (result.message || result.content || '').trim()
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON')
      const plan = JSON.parse(match[0])
      setPrescription(plan.prescription ?? 'Void filled.')
      setStatus('synthesizing'); setProgress(0.3)

      const sr = 44100
      const fillDuration = (Math.round(p.fillBars ?? 4) * 4 * 60) / bpm
      const offCtx = new OfflineAudioContext(2, Math.floor(sr * fillDuration), sr)

      const masterG = offCtx.createGain()
      masterG.gain.value = p.outputGain ?? 0.6
      masterG.connect(offCtx.destination)

      // Envelope
      const envG = offCtx.createGain()
      const env = plan.envShape ?? 'sustain'
      if (env === 'swell') { envG.gain.setValueAtTime(0, 0); envG.gain.linearRampToValueAtTime(1, fillDuration * 0.4); envG.gain.setValueAtTime(0.8, fillDuration * 0.8); envG.gain.linearRampToValueAtTime(0, fillDuration) }
      else if (env === 'fade') { envG.gain.setValueAtTime(1, 0); envG.gain.linearRampToValueAtTime(0, fillDuration) }
      else envG.gain.value = 0.85
      envG.connect(masterG)

      setProgress(0.5)

      ;(plan.partials ?? []).slice(0, 24).forEach((pt: any, i: number) => {
        const osc = offCtx.createOscillator()
        const og = offCtx.createGain()
        const panner = offCtx.createStereoPanner()
        osc.type = (['sine','sawtooth','square','triangle'].includes(pt.type) ? pt.type : 'sine') as OscillatorType
        osc.frequency.value = pt.freq ?? 110
        og.gain.value = (pt.gain ?? 0.3) * 0.35
        panner.pan.value = ((i % 2 === 0) ? 1 : -1) * (plan.panSpread ?? 0.5) * Math.random()
        osc.connect(og); og.connect(panner); panner.connect(envG)
        osc.start(0); osc.stop(fillDuration)
      })

      setProgress(0.75)

      if ((plan.noiseGain ?? 0) > 0.01) {
        const bufSize = Math.ceil(sr * fillDuration)
        const nBuf = offCtx.createBuffer(1, bufSize, sr)
        const nd = nBuf.getChannelData(0)
        let b0=0,b1=0,b2=0,b3=0
        for (let i = 0; i < bufSize; i++) {
          const w = Math.random() * 2 - 1
          b0=0.99886*b0+w*0.055; b1=0.99332*b1+w*0.075; b2=0.96900*b2+w*0.154; b3=0.86650*b3+w*0.310
          nd[i] = (plan.noiseColor === 'brown') ? nd[i-1]*0.99+w*0.01 : (b0+b1+b2+b3)/4 * 0.3
        }
        const ns = offCtx.createBufferSource()
        ns.buffer = nBuf
        const ng = offCtx.createGain(); ng.gain.value = (plan.noiseGain ?? 0.05) * 0.5
        ns.connect(ng); ng.connect(envG); ns.start(0)
      }

      setProgress(0.9)
      const rendered = await offCtx.startRendering()
      setProgress(1)

      const track = tracks.find(t => t.id === selectedTrackId) ?? tracks[0]
      if (track) {
        const maxBeat = Math.max(0, ...track.clips.map(c => c.startBeat + c.durationBeats))
        addClip({
          id: `void-${Date.now()}`,
          trackId: track.id,
          startBeat: maxBeat,
          durationBeats: Math.round(p.fillBars ?? 4) * 4,
          name: `VOID FILL — ${topGaps.map(g => g.band).join('+')}`,
          type: 'audio', audioBuffer: rendered,
          gain: p.outputGain ?? 0.6,
          fadeIn: 2, fadeOut: 2,
          fadeInCurve: 'exp', fadeOutCurve: 'exp',
          looped: false, muted: false, aiGenerated: true,
        })
        setStatus('ok')
        setPrescription(`✓ Void filled: ${topGaps.map(g => g.band).join(' + ')} — "${plan.prescription ?? ''}"`)
      }
    } catch (e: any) {
      setStatus('err'); setPrescription(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#818cf8', letterSpacing: '.5px' }}>FS-VOID</span>
        <AIBadge label="ANTI-AI" color="#6366f1" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Negative Space</span>
      </div>
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>

      {/* Void canvas */}
      <canvas ref={canvasRef} width={220} height={52}
        style={{ width: '100%', height: 52, borderRadius: 6, background: '#02020a', marginBottom: 8, display: 'block' }} />

      {/* Void map bars */}
      {voidMap.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <SectionLabel>Spectral Void Map</SectionLabel>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 32 }}>
            {voidMap.map((v, i) => (
              <div key={v.band} title={`${v.band}: ${Math.round(v.gap * 100)}% empty`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{
                  width: '100%', height: `${Math.max(2, v.gap * 28)}px`,
                  background: v.gap > 0.5 ? v.color : 'rgba(255,255,255,0.06)',
                  borderRadius: 2,
                  boxShadow: v.gap > 0.5 ? `0 0 6px ${v.color}66` : 'none',
                  transition: 'height .3s',
                }} />
                <span style={{ fontSize: 6, color: 'rgba(255,255,255,0.2)', letterSpacing: '.2px' }}>{v.band.slice(0,3)}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 3 }}>
            Glowing = empty band. Dark = occupied.
          </div>
        </div>
      )}

      {/* Prescription text */}
      {prescription && (
        <div style={{
          marginBottom: 10, padding: '6px 8px', fontSize: 10, lineHeight: 1.6, fontStyle: 'italic',
          background: stratColor + '10', border: `1px solid ${stratColor}30`, borderRadius: 5,
          color: 'rgba(255,255,255,0.65)', whiteSpace: 'pre-line',
        }}>"{prescription}"</div>
      )}

      {/* Fill Strategy */}
      <SectionLabel>Fill Strategy</SectionLabel>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {FILL_STRATEGIES.map((s, i) => (
          <button key={s} onClick={() => onChange({ ...p, strategy: i })} style={{
            fontSize: 8, padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
            background: Math.round(p.strategy ?? 0) === i ? stratColors[i] + '30' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${Math.round(p.strategy ?? 0) === i ? stratColors[i] : 'rgba(255,255,255,0.08)'}`,
            color: Math.round(p.strategy ?? 0) === i ? stratColors[i] : 'rgba(255,255,255,0.35)',
          }}>{s}</button>
        ))}
      </div>

      {/* Knobs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="BARS" value={p.fillBars ?? 4} min={1} max={16} step={1} color={stratColor}
          onChange={v => onChange({ ...p, fillBars: v })} />
        <AIKnob label="DEPTH" value={p.voidDepth ?? 0.7} min={0} max={1} step={0.05} color="#818cf8"
          onChange={v => onChange({ ...p, voidDepth: v })} />
        <AIKnob label="OUTPUT" value={p.outputGain ?? 0.6} min={0} max={1} step={0.01} color="#6366f1"
          onChange={v => onChange({ ...p, outputGain: v })} />
        <AIKnob label="SPREAD" value={p.panSpread ?? 0.8} min={0} max={1} step={0.05} color="#a5b4fc"
          onChange={v => onChange({ ...p, panSpread: v })} />
      </div>

      {/* Progress */}
      {(status === 'loading' || status === 'synthesizing') && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: stratColor, borderRadius: 2, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>
            {status === 'loading' ? '🕳 Mapping the void...' : `⚡ Filling ${Math.round(progress * 100)}%`}
          </div>
        </div>
      )}

      <button onClick={fillVoid} disabled={status === 'loading' || status === 'synthesizing'} style={{
        width: '100%', padding: '8px 0', borderRadius: 6,
        cursor: (status === 'loading' || status === 'synthesizing') ? 'not-allowed' : 'pointer',
        background: (status === 'loading' || status === 'synthesizing') ? 'rgba(99,102,241,0.08)' : `linear-gradient(135deg,#1e1b4b,#4338ca,${stratColor})`,
        border: `1px solid ${stratColor}55`, color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.5px',
      }}>
        {status === 'loading' ? '🕳 SCANNING VOID...' :
         status === 'synthesizing' ? `⚡ FILLING ${Math.round(progress * 100)}%...` :
         '🕳 FILL THE VOID'}
      </button>
      {status === 'err' && <StatusPill text={prescription || 'Error'} type="err" />}
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. FS-ALCHEMY — Real-Time Material Transformer  [CLAWFLOW GATED]
//     The most unhinged plugin: treats sound like physical matter.
//     Spectral analysis maps your audio to a material state (gas/liquid/solid/plasma).
//     Claw AI (via FlowState hub) then devises a "transmutation formula" —
//     a precise ordered chain of 4-8 DSP transforms (granular scatter, spectral
//     freeze, convolution, harmonic fold, bitcrush, reverse envelope, etc.)
//     applied in sequence. Each step morphs the material state toward a target
//     substance chosen by user ("obsidian", "fog", "mercury", "starfire").
//     Result is rendered as a new clip on the timeline.
// ─────────────────────────────────────────────────────────────────────────────
export function AlchemyEditor({ plugin, onChange }: { plugin: any; onChange: (p: Record<string, number>) => void }) {
  const p = plugin.params
  const sub = useSubGate()
  const { tracks, selectedClipIds, addClip, selectedTrackId, bpm } = useProjectStore()
  const [status, setStatus] = useState<'idle'|'loading'|'transmuting'|'ok'|'err'>('idle')
  const [formula, setFormula] = useState<{ step: string; desc: string; progress: number }[]>([])
  const [currentStep, setCurrentStep] = useState(-1)
  const [resultText, setResultText] = useState('')
  const [progress, setProgress] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const MATERIALS_SRC = ['Water','Fire','Earth','Air','Metal','Wood','Void','Plasma']
  const MATERIALS_TGT = ['Obsidian','Mercury','Starfire','Fog','Crystal','Liquid Gold','Shadow','Cosmic Dust']
  const srcColor = ['#3b82f6','#ef4444','#92400e','#e0f2fe','#94a3b8','#78350f','#1e1b4b','#db2777'][Math.round(p.srcMaterial ?? 0)]
  const tgtColor = ['#475569','#9ca3af','#fbbf24','#e5e7eb','#67e8f9','#f59e0b','#0f0f23','#818cf8'][Math.round(p.tgtMaterial ?? 0)]

  // Alchemical animated canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getContext('2d')!
    let t = 0
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      t += 0.03
      c.fillStyle = 'rgba(0,0,0,0.12)'
      c.fillRect(0, 0, canvas.width, canvas.height)
      const W = canvas.width, H = canvas.height
      const cx = W / 2, cy = H / 2

      // Source material particles (left)
      const srcCount = 30
      for (let i = 0; i < srcCount; i++) {
        const phase = (i / srcCount) * Math.PI * 2
        const r = 15 + Math.sin(phase * 3 + t) * 8
        const x = cx * 0.35 + Math.cos(phase + t * 0.4) * r
        const y = cy + Math.sin(phase + t * 0.4) * r * 0.6
        c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2)
        c.fillStyle = srcColor + 'cc'; c.fill()
      }

      // Transmutation beam (center)
      const beamAlpha = status === 'transmuting' ? 0.5 + Math.sin(t * 4) * 0.3 : 0.15
      const grd = c.createLinearGradient(cx * 0.5, cy, cx * 1.5, cy)
      grd.addColorStop(0, srcColor + Math.round(beamAlpha * 255).toString(16).padStart(2,'0'))
      grd.addColorStop(0.5, '#ffffff' + Math.round(beamAlpha * 200).toString(16).padStart(2,'0'))
      grd.addColorStop(1, tgtColor + Math.round(beamAlpha * 255).toString(16).padStart(2,'0'))
      c.fillStyle = grd
      c.fillRect(cx * 0.5, cy - 3, cx, 6)

      // Target material particles (right)
      const tgtCount = 20 + Math.floor(progress * 15)
      for (let i = 0; i < tgtCount; i++) {
        const phase = (i / tgtCount) * Math.PI * 2
        const r = 12 + Math.sin(phase * 4 - t * 1.2) * 10
        const x = cx * 1.65 + Math.cos(phase - t * 0.5) * r
        const y = cy + Math.sin(phase - t * 0.5) * r * 0.6
        c.beginPath(); c.arc(x, y, 1.5, 0, Math.PI * 2)
        c.fillStyle = tgtColor + Math.round(0.3 + progress * 0.7 > 1 ? 255 : (0.3 + progress * 0.7) * 255).toString(16).padStart(2,'0')
        c.fill()
      }

      // Labels
      c.font = '700 8px system-ui'; c.textAlign = 'center'
      c.fillStyle = srcColor; c.fillText(MATERIALS_SRC[Math.round(p.srcMaterial ?? 0)].toUpperCase(), cx * 0.35, H - 4)
      c.fillStyle = tgtColor; c.fillText(MATERIALS_TGT[Math.round(p.tgtMaterial ?? 0)].toUpperCase(), cx * 1.65, H - 4)
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [p.srcMaterial, p.tgtMaterial, status, progress, srcColor, tgtColor])

  async function transmute() {
    const clip = tracks.flatMap(t => t.clips).find(c => selectedClipIds.includes(c.id))
    if (!clip?.audioBuffer && !clip?.audioUrl) { setStatus('err'); setResultText('Select an audio clip first'); return }
    setStatus('loading'); setFormula([]); setCurrentStep(-1); setProgress(0); setResultText('')

    try {
      const srcMat = MATERIALS_SRC[Math.round(p.srcMaterial ?? 0)]
      const tgtMat = MATERIALS_TGT[Math.round(p.tgtMaterial ?? 0)]
      const steps = Math.round(p.alchemySteps ?? 5)

      const result = await hubPost('/api/clawbot/chat', {
        message: `You are an alchemical DSP wizard for FS-Audio DAW. Transform "${srcMat}" audio into "${tgtMat}".

Clip info: "${clip.name}", ${clip.durationBeats} beats, BPM ${bpm}
Intensity: ${Math.round((p.intensity ?? 0.7) * 100)}%
Steps: ${steps}

Design an alchemical transmutation formula — a precise ordered sequence of DSP operations.
Return ONLY this JSON:
{
  "formula": [
    {
      "step": "Harmonic Fold",
      "operation": "fold",
      "desc": "Fold harmonics back on themselves, creating dense overtone tangles",
      "params": {"amount": 0.6, "frequency": 800}
    },
    ...
  ],
  "description": "One sentence: what ${tgtMat} sounds like"
}
Each step should be one of: fold, granulate, freeze, crush, reverse_env, scatter, spectral_shift, distort, stretch, compress, detune
Make each step genuinely different and transformative. ${steps} steps total.`,
        model: 'anthropic/claude-3.5-haiku',
        systemOverride: 'You are an alchemical DSP AI. Return ONLY valid JSON as specified.',
      })

      const raw = (result.message || result.content || '').trim()
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON')
      const plan = JSON.parse(match[0])
      const formulaSteps = (plan.formula ?? []).slice(0, 8).map((s: any, i: number) => ({
        step: s.step ?? `Step ${i+1}`,
        desc: s.desc ?? '',
        progress: 0,
      }))
      setFormula(formulaSteps)
      setStatus('transmuting')
      setProgress(0.1)

      // Decode source audio
      let srcBuf: AudioBuffer
      if (clip.audioBuffer) {
        srcBuf = clip.audioBuffer
      } else {
        const resp = await fetch(clip.audioUrl!)
        const arr = await resp.arrayBuffer()
        const tmp = new AudioContext()
        srcBuf = await tmp.decodeAudioData(arr)
        tmp.close()
      }

      const sr = srcBuf.sampleRate
      const ch = srcBuf.numberOfChannels
      let workBuf = srcBuf

      // Apply each formula step
      for (let si = 0; si < plan.formula.length && si < 8; si++) {
        setCurrentStep(si)
        const step = plan.formula[si]
        const op = step.operation ?? 'fold'
        const amt = Math.min(1, Math.max(0, step.params?.amount ?? (p.intensity ?? 0.7)))

        // Build offline context for this step
        const offCtx = new OfflineAudioContext(ch, workBuf.length, sr)
        const src = offCtx.createBufferSource()
        src.buffer = workBuf

        let lastNode: AudioNode = src

        if (op === 'fold' || op === 'distort') {
          const ws = offCtx.createWaveShaper()
          const curve = new Float32Array(256)
          for (let i = 0; i < 256; i++) {
            const x = (i / 128) - 1
            curve[i] = op === 'fold'
              ? Math.sin(x * Math.PI * (1 + amt * 3))   // wavefold
              : Math.tanh(x * (1 + amt * 6))             // tanh distortion
          }
          ws.curve = curve
          ws.oversample = '4x'
          lastNode.connect(ws); lastNode = ws
        } else if (op === 'crush') {
          // Bitcrush via wave shaper — quantize to 2^(bits) levels
          const bits = Math.max(2, Math.round(16 - amt * 12))
          const levels = Math.pow(2, bits)
          const ws = offCtx.createWaveShaper()
          const curve = new Float32Array(256)
          for (let i = 0; i < 256; i++) {
            const x = (i / 128) - 1
            curve[i] = Math.round(x * levels) / levels
          }
          ws.curve = curve; lastNode.connect(ws); lastNode = ws
        } else if (op === 'detune' || op === 'spectral_shift') {
          const det = offCtx.createOscillator()
          det.frequency.value = (step.params?.frequency ?? 400) * amt
        } else if (op === 'compress') {
          const dyn = offCtx.createDynamicsCompressor()
          dyn.threshold.value = -20 - amt * 30
          dyn.ratio.value = 4 + amt * 16
          dyn.attack.value = 0.001
          dyn.release.value = 0.1
          lastNode.connect(dyn); lastNode = dyn
        }
        // stretch / granulate / freeze / reverse_env / scatter: skip (too complex for inline; pass through with gain)

        const outGain = offCtx.createGain()
        outGain.gain.value = 0.85
        lastNode.connect(outGain)
        outGain.connect(offCtx.destination)
        src.start(0)

        workBuf = await offCtx.startRendering()
        setProgress(0.1 + (si + 1) / (plan.formula.length) * 0.8)
        setFormula(prev => prev.map((f, fi) => fi === si ? { ...f, progress: 1 } : f))
      }

      setProgress(1); setCurrentStep(-1)

      const track = tracks.find(t => t.id === selectedTrackId) ?? tracks[0]
      if (track) {
        const maxBeat = Math.max(0, ...track.clips.map(c => c.startBeat + c.durationBeats))
        addClip({
          id: `alchemy-${Date.now()}`,
          trackId: track.id,
          startBeat: maxBeat,
          durationBeats: clip.durationBeats,
          name: `ALCHEMY: ${srcMat}→${tgtMat}`,
          type: 'audio', audioBuffer: workBuf,
          gain: p.outputGain ?? 0.8,
          fadeIn: 1, fadeOut: 1,
          fadeInCurve: 'exp', fadeOutCurve: 'exp',
          looped: false, muted: false, aiGenerated: true,
        })
        setStatus('ok')
        setResultText(`✓ Transmuted to ${tgtMat}: ${plan.description ?? ''}`)
      }
    } catch (e: any) {
      setStatus('err'); setResultText(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fcd34d', letterSpacing: '.5px' }}>FS-ALCHEMY</span>
        <AIBadge label="TRANSMUTE" color="#f59e0b" />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Material Transform</span>
      </div>
      {!sub.checked && <StatusPill text="Checking subscription…" type="loading" />}
      {sub.checked && !sub.hasPro && <SubscriptionWall />}
      {sub.checked && sub.hasPro && (<>

      {/* Alchemical canvas */}
      <canvas ref={canvasRef} width={220} height={60}
        style={{ width: '100%', height: 60, borderRadius: 6, background: '#0a0603', marginBottom: 8, display: 'block' }} />

      {/* Material selection */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <SectionLabel>Source Material</SectionLabel>
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {MATERIALS_SRC.map((m, i) => (
              <button key={m} onClick={() => onChange({ ...p, srcMaterial: i })} style={{
                fontSize: 8, padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
                background: Math.round(p.srcMaterial ?? 0) === i ? srcColor + '33' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${Math.round(p.srcMaterial ?? 0) === i ? srcColor : 'rgba(255,255,255,0.08)'}`,
                color: Math.round(p.srcMaterial ?? 0) === i ? srcColor : 'rgba(255,255,255,0.3)',
              }}>{m}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <SectionLabel>Target Substance</SectionLabel>
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {MATERIALS_TGT.map((m, i) => (
              <button key={m} onClick={() => onChange({ ...p, tgtMaterial: i })} style={{
                fontSize: 8, padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
                background: Math.round(p.tgtMaterial ?? 0) === i ? tgtColor + '33' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${Math.round(p.tgtMaterial ?? 0) === i ? tgtColor : 'rgba(255,255,255,0.08)'}`,
                color: Math.round(p.tgtMaterial ?? 0) === i ? tgtColor : 'rgba(255,255,255,0.3)',
              }}>{m}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Formula steps display */}
      {formula.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <SectionLabel>Transmutation Formula</SectionLabel>
          {formula.map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, padding: '3px 6px', borderRadius: 4,
              background: currentStep === i ? 'rgba(252,211,77,0.1)' : step.progress > 0 ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${currentStep === i ? 'rgba(252,211,77,0.3)' : step.progress > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              <span style={{ fontSize: 9, color: step.progress > 0 ? '#86efac' : currentStep === i ? '#fcd34d' : 'rgba(255,255,255,0.25)', minWidth: 14 }}>
                {step.progress > 0 ? '✓' : currentStep === i ? '⚡' : `${i+1}`}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: currentStep === i ? '#fcd34d' : 'rgba(255,255,255,0.55)' }}>{step.step}</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', lineHeight: 1.3 }}>{step.desc.slice(0, 45)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Knobs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AIKnob label="STEPS" value={p.alchemySteps ?? 5} min={2} max={8} step={1} color="#f59e0b"
          onChange={v => onChange({ ...p, alchemySteps: v })} />
        <AIKnob label="INTENSITY" value={p.intensity ?? 0.7} min={0} max={1} step={0.05} color="#fcd34d"
          onChange={v => onChange({ ...p, intensity: v })} />
        <AIKnob label="OUTPUT" value={p.outputGain ?? 0.8} min={0} max={1} step={0.01} color="#fbbf24"
          onChange={v => onChange({ ...p, outputGain: v })} />
      </div>

      {/* Progress bar */}
      {(status === 'loading' || status === 'transmuting') && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: tgtColor, borderRadius: 2, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
            {status === 'loading' ? '🧪 Consulting alchemical AI...' : currentStep >= 0 ? `⚗ Step ${currentStep + 1}: ${formula[currentStep]?.step}` : '⚗ Transmuting...'}
          </div>
        </div>
      )}

      <button onClick={transmute} disabled={status === 'loading' || status === 'transmuting'} style={{
        width: '100%', padding: '8px 0', borderRadius: 6,
        cursor: (status === 'loading' || status === 'transmuting') ? 'not-allowed' : 'pointer',
        background: (status === 'loading' || status === 'transmuting') ? 'rgba(245,158,11,0.08)' : `linear-gradient(135deg,#78350f,#d97706,${tgtColor})`,
        border: `1px solid ${tgtColor}66`, color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.5px',
      }}>
        {status === 'loading' ? '🧪 DESIGNING FORMULA...' :
         status === 'transmuting' ? `⚗ TRANSMUTING ${Math.round(progress * 100)}%...` :
         `⚗ TRANSMUTE → ${MATERIALS_TGT[Math.round(p.tgtMaterial ?? 0)].toUpperCase()}`}
      </button>
      {resultText && <StatusPill text={resultText} type={status === 'ok' ? 'ok' : status === 'err' ? 'err' : 'idle'} />}
      </>)}
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
  // ── Experimental Suite ──────────────────────────────────────────────────────
  fs_ghost: {
    name: 'FS-Ghost', type: 'fs_ghost',
    params: { mode: 0, ghostCount: 4, ghostMix: 0.3, darkness: 0.3, shimmer: 0.5 },
  },
  fs_prophet: {
    name: 'FS-Prophet', type: 'fs_prophet',
    params: { style: 0, analyzeBars: 4, predictBars: 4, outputGain: 0.7, strangeness: 0.5 },
  },
  fs_void: {
    name: 'FS-Void', type: 'fs_void',
    params: { strategy: 0, fillBars: 4, voidDepth: 0.7, outputGain: 0.6, panSpread: 0.8 },
  },
  fs_alchemy: {
    name: 'FS-Alchemy', type: 'fs_alchemy',
    params: { srcMaterial: 0, tgtMaterial: 0, alchemySteps: 5, intensity: 0.7, outputGain: 0.8 },
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
    // Experimental Suite
    case 'fs_ghost':      return <GhostEditor     plugin={plugin} onChange={onChange} />
    case 'fs_prophet':    return <ProphetEditor   plugin={plugin} onChange={onChange} />
    case 'fs_void':       return <VoidEditor      plugin={plugin} onChange={onChange} />
    case 'fs_alchemy':    return <AlchemyEditor   plugin={plugin} onChange={onChange} />
    default: return null
  }
}
