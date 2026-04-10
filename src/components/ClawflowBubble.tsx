/**
 * ClawflowBubble — Non-invasive floating chat bubble in the bottom-right corner.
 *
 * • Collapsed: shows only the Clawflow mascot chat-bubble icon.
 * • Expanded:  shows the mascot, greeting, three AudioShake quick-action bubbles,
 *              a full chat thread, and a text input.
 *
 * AudioShake capabilities surfaced (gated by ClawFlow subscription):
 *   1. Isolate Stems     — vocals, drums, bass, guitar, piano, strings, wind
 *   2. Remixing / Remastering — stems for Dolby Atmos, Sony 360, immersive mixes
 *   3. Instrumentals / Acapella — karaoke instrumental or pure acapella in one click
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useAuthGate, AuthGateModal } from './AuthGateModal'

const FLOWSTATE_HUB = 'https://flowstate-67g.pages.dev'

interface Message {
  role: 'user' | 'bot'
  text: string
  audioUrl?: string
  stems?: { name: string; url: string }[]
  local?: boolean
}

interface StemResult { name: string; url: string }

// ─── Audio-Shake quick actions ─────────────────────────────────────────────
const AUDIOSHAKE_ACTIONS = [
  {
    id: 'isolate_stems',
    emoji: '🎚',
    label: 'Isolate Stems',
    desc: 'Separate vocals, drums, bass, guitar, piano & more',
    tool: 'separate_stems',
    cost: 25,
  },
  {
    id: 'remix_remaster',
    emoji: '🎛',
    label: 'Remixing / Remastering',
    desc: 'High-fidelity stems for Dolby Atmos & immersive mixes',
    tool: 'remix_remaster',
    cost: 30,
  },
  {
    id: 'instrumental_acapella',
    emoji: '🎤',
    label: 'Instrumentals / Acapella',
    desc: 'Karaoke-ready instrumental or pure acapella instantly',
    tool: 'instrumental_acapella',
    cost: 20,
  },
] as const

// ─── helpers ──────────────────────────────────────────────────────────────
async function hubFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${FLOWSTATE_HUB}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

async function pollStemJob(jobId: string, maxMs = 300_000): Promise<StemResult[] | null> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 6000))
    try {
      const r = await hubFetch(`/api/audio/generate/poll/${jobId}`)
      if (!r.ok) break
      const d: any = await r.json()
      if (d.stems && Array.isArray(d.stems)) return d.stems as StemResult[]
      if (d.status === 'complete' && d.outputs)
        return Object.entries(d.outputs).map(([name, url]) => ({ name, url: url as string }))
      if (d.status === 'failed') break
    } catch { /* keep trying */ }
  }
  return null
}

// ─── Mascot image ──────────────────────────────────────────────────────────
function Mascot({ size }: { size: number }) {
  const [err, setErr] = useState(false)
  if (err) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="22" fill="url(#cg)" stroke="rgba(168,85,247,.4)" strokeWidth="1.5"/>
        <defs>
          <radialGradient id="cg" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#7c3aed"/>
            <stop offset="100%" stopColor="#1e1b2e"/>
          </radialGradient>
        </defs>
        <circle cx="18" cy="20" r="2.5" fill="#e0d4ff"/>
        <circle cx="30" cy="20" r="2.5" fill="#e0d4ff"/>
        <path d="M17 28 Q24 34 31 28" stroke="#c4b5fd" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M20 10 L18 17 M24 9 L24 16 M28 10 L30 17" stroke="#a855f7" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )
  }
  return (
    <img
      src="/assets/clawbot-mascot.png"
      alt="Clawflow"
      width={size}
      height={size}
      style={{ objectFit: 'contain', display: 'block' }}
      onError={() => setErr(true)}
    />
  )
}

// ─── Main component ────────────────────────────────────────────────────────
export function ClawflowBubble() {
  const { bpm, key, tracks, selectedClipIds, addClip, selectedTrackId } = useProjectStore()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [authStatus, setAuthStatus] = useState<'unknown' | 'ok' | 'needs_login'>('unknown')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [unread, setUnread] = useState(0)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auth gate hook — shows proper modal for sign-in / ClawFlow prompt
  const { modal: authModal, checkAndRun, closeModal } = useAuthGate()

  // Check auth when panel first opens
  useEffect(() => {
    if (!open) return
    hubFetch('/api/clawbot/status')
      .then(r => r.json())
      .then((d: any) => {
        if (d.loggedIn) {
          setAuthStatus('ok')
          setHasSubscription(!!d.hasClawflow)
        } else {
          setAuthStatus('needs_login')
        }
      })
      .catch(() => setAuthStatus('needs_login'))
  }, [open])

  // Scroll to bottom on new messages
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  function handleOpen() {
    setOpen(o => !o)
    setUnread(0)
  }

  function addMsg(m: Message) {
    setMessages(prev => [...prev, m])
    if (!open) setUnread(u => u + 1)
  }

  // ── Get selected clip URL for stem tools ───────────────────────────────
  const getSelectedClipUrl = useCallback((): string | null => {
    if (!selectedClipIds.length) return null
    for (const track of tracks) {
      const clip = track.clips.find(c => selectedClipIds.includes(c.id))
      if (clip?.audioUrl) return clip.audioUrl
    }
    return null
  }, [tracks, selectedClipIds])

  function placeAudioClip(audioUrl: string, name: string) {
    const audioTracks = tracks.filter(t => t.type !== 'master')
    const target = audioTracks.find(t => t.id === selectedTrackId) ?? audioTracks[0] ?? tracks[0]
    if (!target) return
    const lastEnd = target.clips.reduce((mx, c) => Math.max(mx, c.startBeat + c.durationBeats), 0)
    addClip({
      id: `clip-cf-${Date.now()}`,
      trackId: target.id,
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

  // ── AudioShake action — gate via modal, then run ───────────────────────
  function handleActionClick(actionId: string, tool: string, label: string, cost: number) {
    checkAndRun(
      {
        toolName: label,
        toolIcon: AUDIOSHAKE_ACTIONS.find(a => a.id === actionId)?.emoji ?? '⚡',
        requiredAccess: 'clawflow',
        description: AUDIOSHAKE_ACTIONS.find(a => a.id === actionId)?.desc,
        creditCost: cost,
      },
      () => _doRunAudioShake(actionId, tool, label, cost),
    )
  }

  async function _doRunAudioShake(actionId: string, tool: string, label: string, cost: number) {
    // Stem tools require a selected clip
    const audioUrl = getSelectedClipUrl()
    if (!audioUrl) {
      addMsg({
        role: 'bot',
        text: `🎚 ${label}\n\nPlease select an audio clip on the timeline first.\n\nThe clip's audio will be sent to AudioShake for processing.\n\nSelect a clip → then press "${label}" again.`,
      })
      return
    }

    setWorking(actionId)
    setLoading(true)
    addMsg({ role: 'user', text: label })

    const processingMsg: Record<string, string> = {
      isolate_stems: `🎚 Isolating stems...\n\nSending to AudioShake. Processing takes 1–3 minutes.\n\nExpected stems: Vocals (lead + backing), Drums, Bass, Guitar, Piano, Strings, Wind`,
      remix_remaster: `🎛 Preparing remix stems...\n\nExtracting high-fidelity stems for Dolby Atmos / Sony 360 remixing.\n\nThis usually takes 2–4 minutes.`,
      instrumental_acapella: `🎤 Creating instrumental & acapella versions...\n\nAudioShake is removing vocals / instruments.\n\nUsually ready in 1–2 minutes.`,
    }
    addMsg({ role: 'bot', text: processingMsg[actionId] ?? `Processing... ⏳` })

    try {
      const res = await hubFetch('/api/audio/generate', {
        method: 'POST',
        body: JSON.stringify({ tool, audioUrl, bpm, key }),
      })

      // Unexpected auth error (gate should have caught these, but handle gracefully)
      if (res.status === 401 || res.status === 402) {
        setAuthStatus('needs_login')
        addMsg({ role: 'bot', text: `🔐 Please activate ClawFlow to use this feature.` })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      setAuthStatus('ok')
      const data: any = await res.json()

      // ── Direct stems result
      if (data.stems && Array.isArray(data.stems)) {
        placeStemClips(data.stems, cost)
        return
      }

      // ── Poll for job
      if (data.jobId || data.status === 'queued') {
        addMsg({ role: 'bot', text: `⏳ Job queued (${data.jobId ?? 'pending'}) — polling AudioShake...` })
        const stems = await pollStemJob(data.jobId)
        if (stems && stems.length > 0) {
          placeStemClips(stems, cost)
        } else {
          addMsg({
            role: 'bot',
            text: `🎚 Job submitted to AudioShake (${data.jobId ?? ''}).\n\nStems will appear when processing completes.\n\n${data.message ?? ''}`,
          })
        }
        return
      }

      // ── Direct audioUrl (instrumental / acapella single file)
      if (data.audioUrl) {
        placeAudioClip(data.audioUrl, label)
        addMsg({ role: 'bot', text: `✅ ${label} ready and added to your timeline!`, audioUrl: data.audioUrl })
        return
      }

      addMsg({ role: 'bot', text: data.message ?? `✅ ${label} job submitted to AudioShake.` })
    } catch (err: any) {
      addMsg({ role: 'bot', text: `☁️ AudioShake is temporarily unreachable.\n\nError: ${err?.message ?? 'Network error'}` })
    } finally {
      setLoading(false)
      setWorking(null)
    }
  }

  function placeStemClips(stems: StemResult[], cost: number) {
    const audioTracks = tracks.filter(t => t.type === 'audio')
    stems.forEach((stem, i) => {
      const targetTrack = audioTracks[i % Math.max(audioTracks.length, 1)]
      if (!targetTrack) return
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
    })
    addMsg({
      role: 'bot',
      text: `✅ Stems added to timeline:\n${stems.map(s => `  • ${s.name}`).join('\n')}\n\n${cost} credits used`,
      stems,
    })
  }

  // ── Free-text chat — also gated behind ClawFlow ────────────────────────
  async function sendChat() {
    const msg = input.trim()
    if (!msg) return

    await checkAndRun(
      { toolName: 'Clawbot Chat', toolIcon: '🤖', requiredAccess: 'clawflow', description: 'AI music chat and suggestions' },
      () => _doSendChat(msg),
    )
  }

  async function _doSendChat(msg: string) {
    setInput('')
    addMsg({ role: 'user', text: msg })
    setLoading(true)
    try {
      const res = await hubFetch('/api/clawbot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: msg,
          app: 'flowstate_audio',
          history: messages.slice(-6).map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text })),
        }),
      })
      if (res.status === 401 || res.status === 402) {
        setAuthStatus('needs_login')
        addMsg({ role: 'bot', text: `🔐 Please activate ClawFlow to use Clawbot chat.` })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAuthStatus('ok')
      const data: any = await res.json()
      addMsg({ role: 'bot', text: data.reply ?? data.message ?? '...' })
    } catch {
      addMsg({ role: 'bot', text: `Cloud chat isn't reachable right now.` })
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating bubble trigger ───────────────────────────────────────── */}
      <button
        className={`cf-bubble-btn${open ? ' open' : ''}`}
        onClick={handleOpen}
        title={open ? 'Close Clawflow' : 'Open Clawflow AI'}
        aria-label="Toggle Clawflow AI assistant"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M5 5L17 17M17 5L5 17" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        ) : (
          <div className="cf-bubble-inner">
            <Mascot size={32} />
          </div>
        )}
        {!open && unread > 0 && (
          <span className="cf-unread">{unread}</span>
        )}
      </button>

      {/* ── Expanded chat panel ───────────────────────────────────────────── */}
      {open && (
        <div className="cf-chat-panel">
          {/* Header */}
          <div className="cf-chat-header">
            <div className="cf-chat-header-left">
              <div className="cf-header-mascot">
                <Mascot size={36} />
              </div>
              <div>
                <div className="cf-chat-title">Clawflow AI</div>
                <div className="cf-chat-sub">
                  {authStatus === 'ok' && hasSubscription
                    ? '● Active — AudioShake ready'
                    : authStatus === 'ok'
                    ? '● Connected — ClawFlow needed'
                    : 'AudioShake · Music AI'}
                </div>
              </div>
            </div>
            {/* Sign in button — uses IPC to open in system browser */}
            {authStatus === 'needs_login' && (
              <button
                className="cf-signin-link"
                onClick={() => checkAndRun({ toolName: 'Clawflow AI', toolIcon: '⚡', requiredAccess: 'clawflow' }, () => {})}
              >
                Sign in
              </button>
            )}
          </div>

          {/* Greeting (only when no messages yet) */}
          {messages.length === 0 && (
            <div className="cf-greeting">
              <div className="cf-greeting-mascot">
                <Mascot size={72} />
              </div>
              <div className="cf-greeting-text">
                <span className="cf-greeting-hi">Hey there! 👋</span>
                <span className="cf-greeting-sub">What can I help you with?</span>
              </div>
            </div>
          )}

          {/* AudioShake action bubbles — gate fires on click */}
          <div className="cf-action-bubbles">
            {AUDIOSHAKE_ACTIONS.map(action => (
              <button
                key={action.id}
                className={`cf-action-bubble${!hasSubscription ? ' locked' : ''}${working === action.id ? ' working' : ''}`}
                onClick={() => handleActionClick(action.id, action.tool, action.label, action.cost)}
                disabled={loading}
                title={hasSubscription ? action.desc : 'Requires ClawFlow subscription — click to activate'}
              >
                <span className="cf-ab-emoji">{action.emoji}</span>
                <span className="cf-ab-label">{action.label}</span>
                {working === action.id
                  ? <span className="cf-ab-cost working">⏳</span>
                  : !hasSubscription
                  ? <span className="cf-ab-cost locked">🔒</span>
                  : <span className="cf-ab-cost">{action.cost} cr</span>
                }
              </button>
            ))}
          </div>

          {/* Message thread */}
          {messages.length > 0 && (
            <div className="cf-messages">
              {messages.map((m, i) => (
                <div key={i} className={`cf-msg cf-msg-${m.role}`}>
                  {m.role === 'bot' && (
                    <div className="cf-msg-av"><Mascot size={18} /></div>
                  )}
                  <div className="cf-msg-bubble">
                    <pre className="cf-msg-text">{m.text}</pre>
                    {m.audioUrl && (
                      <audio controls src={m.audioUrl} style={{ marginTop: 5, width: '100%', height: 26 }} />
                    )}
                    {m.stems && m.stems.length > 0 && (
                      <div className="cf-stem-links">
                        {m.stems.map((s, j) => (
                          <a key={j} href={s.url} target="_blank" rel="noreferrer" className="cf-stem-link">
                            ⬇ {s.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="cf-msg cf-msg-bot">
                  <div className="cf-msg-av"><Mascot size={18} /></div>
                  <div className="cf-msg-bubble">
                    <div className="cf-typing"><span/><span/><span/></div>
                  </div>
                </div>
              )}
              <div ref={msgEndRef} />
            </div>
          )}

          {/* Subscription CTA — clicking opens the modal */}
          {authStatus !== 'unknown' && !hasSubscription && (
            <button
              className="cf-sub-cta"
              onClick={() => checkAndRun({ toolName: 'AudioShake', toolIcon: '⚡', requiredAccess: 'clawflow' }, () => {})}
            >
              ⚡ Unlock AudioShake with ClawFlow →
            </button>
          )}

          {/* Chat input */}
          <div className="cf-input-row">
            <input
              ref={inputRef}
              className="cf-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything..."
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendChat() } }}
              disabled={loading}
            />
            <button
              className="cf-send-btn"
              onClick={sendChat}
              disabled={loading || !input.trim()}
              title="Send"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7L13 1L7 13L6 8L1 7Z" fill="white" stroke="white" strokeWidth=".5" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Auth Gate Modal — rendered at root level for proper z-index */}
      {authModal && (
        <AuthGateModal
          config={authModal.config}
          auth={authModal.auth}
          onClose={closeModal}
          onGranted={authModal.onGranted}
        />
      )}
    </>
  )
}
