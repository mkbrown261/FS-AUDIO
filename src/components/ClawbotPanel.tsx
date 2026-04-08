import React, { useState, useRef, useCallback } from 'react'
import { useProjectStore } from '../store/projectStore'

const FLOWSTATE_HUB = 'https://flowstate-67g.pages.dev'

interface Message {
  role: 'user' | 'clawbot'
  content: string
  coinCost?: number
  local?: boolean
  audioUrl?: string
  stems?: StemResult[]
}

interface StemResult {
  name: string
  url: string
}

// Quick actions — local ones don't hit the API
const QUICK_ACTIONS = [
  { label: '🎵 Analyze Key & BPM',  tool: 'detect_key_bpm',     cost: 0,  isLocal: true  },
  { label: '🎼 Suggest Arrangement', tool: 'suggest_arrangement', cost: 0,  isLocal: true  },
  { label: '🥁 Generate Beat',       tool: 'generate_beat',       cost: 15, isLocal: false },
  { label: '🎹 Generate Melody',     tool: 'generate_melody',     cost: 20, isLocal: false },
  { label: '🎸 Full Track',          tool: 'generate_track',      cost: 40, isLocal: false },
  { label: '🎚 Separate Stems',      tool: 'separate_stems',      cost: 25, isLocal: false },
  { label: '✨ AI Master',           tool: 'master_track',        cost: 20, isLocal: false },
]

function BotIcon({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'mascot-lg' : size === 'md' ? 'mascot-md' : 'mascot-sm'
  return (
    <img
      src="/assets/clawbot-mascot.png"
      alt="Clawbot"
      className={cls}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  )
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 12 C2 9.5 4 8 7 8 C10 8 12 9.5 12 12" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

// ── Local functions (no API) ───────────────────────────────────────────────────
function localAnalyzeKeyBpm(bpm: number, key: string): string {
  return [
    `Project Analysis (local)`,
    ``,
    `Key: ${key}`,
    `BPM: ${bpm.toFixed(1)}`,
    ``,
    `Tempo: ${bpm < 70 ? 'Slow / Ballad' : bpm < 100 ? 'Mid-tempo' : bpm < 130 ? 'Upbeat' : bpm < 160 ? 'Fast / Dance' : 'Very Fast / Breakcore'}`,
    ``,
    `Tip: Use the BPM field in the toolbar to adjust. Scroll the BPM field with your mouse wheel for fine control.`,
  ].join('\n')
}

function localSuggestArrangement(bpm: number, key: string): string {
  const isMinor = key.includes('minor')
  const prog = isMinor ? 'i — VI — III — VII' : 'I — V — vi — IV'
  const feel = bpm < 90 ? 'a laid-back, spacious' : bpm < 120 ? 'a moderate, driving' : 'an energetic, punchy'
  return [
    `Arrangement Template — ${key} @ ${bpm.toFixed(1)} BPM`,
    ``,
    `Chord Progression: ${prog}`,
    ``,
    `Structure:`,
    `  Intro (4 bars) → Verse (8 bars) → Pre-Chorus (4 bars) → Chorus (8 bars)`,
    `  → Verse (8 bars) → Chorus (8 bars) → Bridge (4 bars) → Outro (4 bars)`,
    ``,
    `Suggested Tracks:`,
    `  • Kick / Snare (Audio)`,
    `  • Hi-hats (Audio)`,
    `  • Bass Line (MIDI → ${key})`,
    `  • Lead Synth (MIDI → ${key})`,
    `  • Pad / Atmosphere (Audio)`,
    `  • FX Hits (Audio)`,
    ``,
    `Production Tips for ${feel} feel at ${bpm.toFixed(0)} BPM:`,
    isMinor
      ? `  • Use the ${key.replace(' minor', '')} natural minor scale\n  • Add tension with a raised 7th (harmonic minor)\n  • Kick on 1 & 3, snare on 2 & 4`
      : `  • The ${key.replace(' major', '')} major scale gives a bright, uplifting sound\n  • Try suspensions (sus2/sus4) for harmonic interest\n  • V chord creates tension before resolving to I`,
    ``,
    `(Local — no credits used)`,
  ].join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** All Flowstate Hub API calls use credentials:include so fs_session cookie is sent */
async function hubFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${FLOWSTATE_HUB}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

/** Poll a Replicate prediction until done or timeout (max 3 min, 5s intervals) */
async function pollPrediction(predictionId: string, maxMs = 180_000): Promise<{ audioUrl: string | null; error?: string }> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const r = await hubFetch(`/api/audio/generate/poll/${predictionId}`)
      if (!r.ok) return { audioUrl: null, error: `Poll error ${r.status}` }
      const d: any = await r.json()
      if (d.status === 'succeeded' || d.audioUrl) return { audioUrl: d.audioUrl ?? d.output?.[0] ?? null }
      if (d.status === 'failed' || d.status === 'canceled') return { audioUrl: null, error: d.error ?? 'Generation failed' }
      // still processing — continue polling
    } catch { /* network blip — keep trying */ }
  }
  return { audioUrl: null, error: 'Timed out waiting for generation' }
}

/** Poll AudioShake job until stems are ready */
async function pollStemJob(jobId: string, maxMs = 300_000): Promise<StemResult[] | null> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 6000))
    try {
      const r = await hubFetch(`/api/audio/generate/poll/${jobId}`)
      if (!r.ok) break
      const d: any = await r.json()
      if (d.stems && Array.isArray(d.stems)) return d.stems as StemResult[]
      if (d.status === 'complete' && d.outputs) {
        return Object.entries(d.outputs).map(([name, url]) => ({ name, url: url as string }))
      }
      if (d.status === 'failed') break
    } catch { /* keep going */ }
  }
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ClawbotPanel() {
  const { aiLevel, bpm, key, addClip, tracks, selectedTrackId, selectedClipIds } = useProjectStore()

  const [messages, setMessages] = useState<Message[]>([{
    role: 'clawbot',
    content: `Clawbot — AI music assistant for Flowstate Audio.\n\nI can generate beats, melodies, and full tracks, separate stems, suggest arrangements, and help with your workflow.\n\n🟢 LOCAL — runs instantly, no credits\n☁️ CLOUD — requires Flowstate account + ClawFlow\n\nSign in at flowstate-67g.pages.dev to unlock cloud features.`,
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [coinsUsed, setCoinsUsed] = useState(0)
  const [generatingTool, setGeneratingTool] = useState<string | null>(null)
  const [authStatus, setAuthStatus] = useState<'unknown' | 'ok' | 'needs_login'>('unknown')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  function scrollToBottom() {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function addMsg(msg: Message) {
    setMessages(prev => [...prev, msg])
    scrollToBottom()
  }

  // Get the audioUrl of the currently selected clip (for stem separation)
  const getSelectedClipUrl = useCallback((): string | null => {
    if (!selectedClipIds.length) return null
    for (const track of tracks) {
      const clip = track.clips.find(c => selectedClipIds.includes(c.id))
      if (clip?.audioUrl) return clip.audioUrl
    }
    return null
  }, [tracks, selectedClipIds])

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function sendMessage(text?: string) {
    const msg = text ?? input
    if (!msg.trim()) return
    setInput('')
    addMsg({ role: 'user', content: msg })
    setLoading(true)

    try {
      const res = await hubFetch('/api/clawbot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: msg,
          app: 'flowstate_audio',
          history: messages.slice(-6).map(m => ({ role: m.role === 'clawbot' ? 'assistant' : 'user', content: m.content })),
        }),
      })

      if (res.status === 401 || res.status === 402) {
        setAuthStatus('needs_login')
        const d: any = await res.json().catch(() => ({}))
        addMsg({
          role: 'clawbot',
          content: res.status === 401
            ? `🔐 Sign in required\n\nPlease log in at ${FLOWSTATE_HUB} to use Clawbot chat.\n\nLocal features (Key & BPM analysis, Arrangement suggestions) work without an account.`
            : `⚡ ClawFlow subscription required\n\nCloud AI features need an active ClawFlow subscription ($40/mo).\n\nGet it at ${FLOWSTATE_HUB} → Account.\n\n${d.promo?.pitch ?? ''}`,
        })
        return
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAuthStatus('ok')
      const data: any = await res.json()
      addMsg({ role: 'clawbot', content: data.reply ?? data.message ?? 'No response.', coinCost: data.coinCost })
      if (data.coinCost) setCoinsUsed(c => c + data.coinCost)
    } catch {
      addMsg({ role: 'clawbot', content: `Cloud AI isn't reachable right now. Try the 🟢 LOCAL actions — they work offline.\n\nMake sure you're signed in at ${FLOWSTATE_HUB}.` })
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }

  // ── Action runner ─────────────────────────────────────────────────────────
  async function runAction(tool: string, cost: number, isLocal: boolean) {
    setGeneratingTool(tool)
    const promptEl = document.getElementById('clawbot-prompt') as HTMLTextAreaElement
    const prompt = promptEl?.value || `Create a ${key} ${tool.replace(/_/g, ' ')} at ${bpm} BPM`

    // ── LOCAL actions ───────────────────────────────────────────────────────
    if (isLocal) {
      addMsg({ role: 'user', content: tool === 'detect_key_bpm' ? 'Analyze Key & BPM' : `Suggest arrangement for ${key} @ ${bpm.toFixed(0)} BPM` })
      setTimeout(() => {
        addMsg({
          role: 'clawbot',
          content: tool === 'detect_key_bpm' ? localAnalyzeKeyBpm(bpm, key) : localSuggestArrangement(bpm, key),
          local: true,
        })
        setGeneratingTool(null)
      }, 350)
      return
    }

    // ── CLOUD actions ───────────────────────────────────────────────────────
    addMsg({ role: 'user', content: `${tool.replace(/_/g, ' ')}: ${prompt}` })
    setLoading(true)

    // For stem separation, we need an audioUrl from the selected clip
    let audioUrlForStems: string | null = null
    if (tool === 'separate_stems') {
      audioUrlForStems = getSelectedClipUrl()
      if (!audioUrlForStems) {
        addMsg({ role: 'clawbot', content: `🎚 Stem Separation\n\nPlease select a clip on the timeline first. The clip's audio will be sent for separation.\n\nSelect a clip → click "Separate Stems".` })
        setLoading(false)
        setGeneratingTool(null)
        return
      }
      addMsg({ role: 'clawbot', content: `🎚 Separating stems...\n\nSending to AudioShake API. This typically takes 1–3 minutes.\nStems: Vocals, Drums, Bass, Other` })
    } else {
      addMsg({ role: 'clawbot', content: `Working on it... ⏳\n\nThis may take up to a minute for AI generation.` })
    }

    try {
      const body: any = { tool, prompt, bpm, key, style: 'pop', durationSeconds: 30 }
      if (audioUrlForStems) body.audioUrl = audioUrlForStems

      const res = await hubFetch('/api/audio/generate', { method: 'POST', body: JSON.stringify(body) })

      if (res.status === 401) {
        setAuthStatus('needs_login')
        addMsg({ role: 'clawbot', content: `🔐 Sign in required\n\nPlease log in at ${FLOWSTATE_HUB} to use cloud generation features.\n\nLocal actions (Key & BPM, Arrangement) work without an account.` })
        return
      }
      if (res.status === 402) {
        setAuthStatus('needs_login')
        const d: any = await res.json().catch(() => ({}))
        addMsg({ role: 'clawbot', content: `⚡ ClawFlow required\n\nGet your subscription at ${FLOWSTATE_HUB} → Account.\n\n${d.promo?.pitch ?? ''}` })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      setAuthStatus('ok')
      const data: any = await res.json()

      // ── Direct audio result ──────────────────────────────────────────────
      if (data.audioUrl) {
        placeAudioClip(data.audioUrl, prompt)
        addMsg({ role: 'clawbot', content: `✅ Generated and added to timeline.`, coinCost: cost, audioUrl: data.audioUrl })
        setCoinsUsed(c => c + cost)
        return
      }

      // ── Replicate async prediction — need to poll ────────────────────────
      if (data.predictionId || data.status === 'queued') {
        const pid = data.predictionId
        addMsg({ role: 'clawbot', content: `⏳ Generation queued (MusicGen via Replicate).\nPolling for result... this may take 30–60 seconds.` })
        const result = await pollPrediction(pid)
        if (result.audioUrl) {
          placeAudioClip(result.audioUrl, prompt)
          addMsg({ role: 'clawbot', content: `✅ Generated and added to timeline.`, coinCost: cost, audioUrl: result.audioUrl })
          setCoinsUsed(c => c + cost)
        } else {
          addMsg({ role: 'clawbot', content: `Generation failed: ${result.error ?? 'Unknown error'}\n\nThis may be a temporary API issue. Try again shortly.` })
        }
        return
      }

      // ── AudioShake stem separation — poll for job result ─────────────────
      if (tool === 'separate_stems' && (data.jobId || data.status === 'queued')) {
        const jid = data.jobId
        addMsg({ role: 'clawbot', content: `🎚 Stems separating... (job: ${jid})\nPolling AudioShake — usually 1–3 minutes.` })
        const stems = await pollStemJob(jid)
        if (stems && stems.length > 0) {
          // Create a clip per stem on separate tracks
          stems.forEach((stem, i) => {
            const targetTrack = tracks[i % Math.max(tracks.filter(t => t.type === 'audio').length, 1)]
            if (targetTrack) {
              addClip({
                id: `clip-stem-${Date.now()}-${i}`,
                trackId: targetTrack.id,
                startBeat: 0,
                durationBeats: 16,
                name: `${stem.name} (stem)`,
                type: 'audio',
                audioUrl: stem.url,
                gain: 1, fadeIn: 0, fadeOut: 0,
                fadeInCurve: 'linear', fadeOutCurve: 'linear',
                looped: false, muted: false, aiGenerated: true,
              })
            }
          })
          addMsg({
            role: 'clawbot',
            content: `✅ Stems separated and added to timeline:\n${stems.map(s => `  • ${s.name}`).join('\n')}`,
            coinCost: cost,
            stems,
          })
          setCoinsUsed(c => c + cost)
        } else {
          // AudioShake polling not yet wired on Hub — show direct result
          addMsg({ role: 'clawbot', content: `🎚 Stem separation job submitted (${jid}).\n\nAudioShake is processing your audio. Check back at ${FLOWSTATE_HUB} for results, or stems will appear when polling completes.\n\n${data.message ?? ''}` })
        }
        return
      }

      // ── Other responses (arrangement, suggestion, etc.) ──────────────────
      if (data.suggestion) {
        const s = data.suggestion
        addMsg({
          role: 'clawbot',
          content: `Arrangement Suggestion\n\nChord Progression: ${s.chordProgression}\n\nStructure:\n${s.arrangement?.join(' > ')}\n\nTracks: ${s.suggestedTracks?.join(', ')}\n\nTips:\n${s.productionTips?.map((t: string) => `  • ${t}`).join('\n')}`,
          coinCost: data.coinCost ?? 0,
        })
        return
      }

      addMsg({ role: 'clawbot', content: data.message ?? 'Done.', coinCost: data.coinCost ?? 0 })

    } catch (err: any) {
      addMsg({ role: 'clawbot', content: `☁️ Cloud generation unavailable right now.\n\nMake sure you're signed in at ${FLOWSTATE_HUB}.\n\nError: ${err?.message ?? 'Network error'}` })
    } finally {
      setLoading(false)
      setGeneratingTool(null)
      scrollToBottom()
    }
  }

  function placeAudioClip(audioUrl: string, name: string) {
    const audioTracks = tracks.filter(t => t.type !== 'master')
    const targetTrack = audioTracks.find(t => t.id === selectedTrackId) ?? audioTracks[0] ?? tracks[0]
    if (!targetTrack) return
    // Find end of last clip on target track to place after it
    const lastEnd = targetTrack.clips.reduce((mx, c) => Math.max(mx, c.startBeat + c.durationBeats), 0)
    addClip({
      id: `clip-ai-${Date.now()}`,
      trackId: targetTrack.id,
      startBeat: lastEnd,
      durationBeats: 16,
      name: name.slice(0, 28),
      type: 'audio',
      audioUrl,
      gain: 1, fadeIn: 0, fadeOut: 0,
      fadeInCurve: 'exp', fadeOutCurve: 'exp',
      looped: false, muted: false, aiGenerated: true,
    })
  }

  return (
    <div className="clawbot-panel" style={{ width: '100%' }}>
      {/* Header */}
      <div className="clawbot-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <BotIcon size="md" />
          <span>Clawbot</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {authStatus === 'needs_login' && (
            <a
              href={FLOWSTATE_HUB}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 9, color: '#f59e0b', textDecoration: 'none', border: '1px solid rgba(245,158,11,.3)', borderRadius: 3, padding: '2px 6px' }}
            >
              Sign in
            </a>
          )}
          {authStatus === 'ok' && (
            <span style={{ fontSize: 9, color: '#10b981' }}>● Connected</span>
          )}
          {coinsUsed > 0 && <span className="coins-badge">{coinsUsed} cr used</span>}
        </div>
      </div>

      {/* Messages */}
      <div className="clawbot-messages">
        {messages.map((m, i) => (
          <div key={i} className={`cb-msg ${m.role}`}>
            <div className="cb-av">
              {m.role === 'clawbot' ? <BotIcon /> : <UserIcon />}
            </div>
            <div className="cb-bubble">
              {i === 0 && m.role === 'clawbot' && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  <BotIcon size="lg" />
                </div>
              )}
              <pre className="cb-text">{m.content}</pre>
              {/* Inline audio player for generated audio */}
              {m.audioUrl && (
                <audio
                  controls
                  src={m.audioUrl}
                  style={{ marginTop: 6, width: '100%', height: 28 }}
                />
              )}
              {/* Stem links */}
              {m.stems && m.stems.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {m.stems.map((s, j) => (
                    <a key={j} href={s.url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>
                      ⬇ {s.name}.mp3
                    </a>
                  ))}
                </div>
              )}
              {m.local && <span style={{ fontSize: 9, color: '#10b981', fontWeight: 700, display: 'block', marginTop: 3 }}>🟢 Local — no credits used</span>}
              {m.coinCost != null && m.coinCost > 0 && <span className="coin-cost">{m.coinCost} credits</span>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="cb-msg clawbot">
            <div className="cb-av"><BotIcon /></div>
            <div className="cb-bubble"><div className="typing-dots"><span/><span/><span/></div></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Prompt */}
      <textarea
        id="clawbot-prompt"
        className="clawbot-prompt"
        placeholder={`Describe what to generate... e.g. "dark trap beat" or "lo-fi melody in ${key}"`}
        rows={2}
      />

      {/* Quick AI actions */}
      <div className="quick-actions">
        {QUICK_ACTIONS.map(({ label, tool, cost, isLocal }) => (
          <button
            key={tool}
            className={`quick-btn ${isLocal ? 'quick-btn-local' : ''}`}
            onClick={() => runAction(tool, cost, isLocal)}
            disabled={loading || generatingTool !== null}
            title={
              tool === 'separate_stems'
                ? 'Select a clip on the timeline first, then click to separate stems via AudioShake'
                : isLocal ? 'Runs locally — no credits needed' : `Requires cloud API — ${cost} credits`
            }
          >
            {generatingTool === tool ? '⏳ Working...' : label}
            <span className="qa-cost" style={{ color: isLocal ? '#10b981' : undefined }}>
              {isLocal ? 'LOCAL' : `${cost} cr`}
            </span>
          </button>
        ))}
      </div>

      {/* Chat input */}
      <div className="clawbot-input-row">
        <input
          className="clawbot-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask Clawbot..."
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
        />
        <button className="cb-send-btn" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
