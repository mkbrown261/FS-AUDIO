import React, { useState, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'

const FLOWSTATE_HUB = 'https://flowstate-67g.pages.dev'

interface Message {
  role: 'user' | 'clawbot'
  content: string
  coinCost?: number
}

const QUICK_ACTIONS = [
  { label: 'Generate Beat', tool: 'generate_beat', cost: 15 },
  { label: 'Generate Melody', tool: 'generate_melody', cost: 20 },
  { label: 'Full Track', tool: 'generate_track', cost: 40 },
  { label: 'Suggest Arrangement', tool: 'suggest_arrangement', cost: 10 },
  { label: 'Analyze Key & BPM', tool: 'detect_key_bpm', cost: 2 },
  { label: 'AI Master', tool: 'master_track', cost: 20 },
]

function BotIcon({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'mascot-lg' : size === 'md' ? 'mascot-md' : 'mascot-sm'
  return <img src="/assets/clawbot-mascot.png" alt="Clawbot" className={cls} />
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 12 C2 9.5 4 8 7 8 C10 8 12 9.5 12 12" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export function ClawbotPanel() {
  const { aiLevel, bpm, key, addClip, tracks, selectedTrackId } = useProjectStore()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'clawbot',
      content: `Clawbot — AI music assistant for Flowstate Audio.\n\nI can generate beats, melodies, and full tracks, suggest arrangements, analyze key and BPM, and help with your workflow.`,
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [coinsUsed, setCoinsUsed] = useState(0)
  const [generatingTool, setGeneratingTool] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  function scrollToBottom() {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function sendMessage(text?: string) {
    const msg = text ?? input
    if (!msg.trim()) return
    setInput('')
    const userMsg: Message = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    scrollToBottom()

    try {
      const res = await fetch(`${FLOWSTATE_HUB}/api/clawbot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          app: 'flowstate_audio',
          history: messages.slice(-6).map(m => ({ role: m.role === 'clawbot' ? 'assistant' : 'user', content: m.content }))
        })
      })
      const data = await res.json()
      const reply: Message = {
        role: 'clawbot',
        content: data.reply ?? data.message ?? 'No response.',
        coinCost: data.coinCost,
      }
      setMessages(prev => [...prev, reply])
      if (data.coinCost) setCoinsUsed(c => c + data.coinCost)
    } catch {
      setMessages(prev => [...prev, { role: 'clawbot', content: 'AI features require API configuration.' }])
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }

  async function generateAudio(tool: string, cost: number) {
    setGeneratingTool(tool)
    const promptEl = document.getElementById('clawbot-prompt') as HTMLTextAreaElement
    const prompt = promptEl?.value || `Create a ${key} ${tool.replace(/_/g,' ')} at ${bpm} BPM`

    setMessages(prev => [...prev, {
      role: 'user',
      content: `Generate: ${prompt} (${tool.replace(/_/g,' ')})`,
    }])
    setLoading(true)
    scrollToBottom()

    try {
      const res = await fetch(`${FLOWSTATE_HUB}/api/audio/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, prompt, bpm, key, style: 'pop', durationSeconds: 30 })
      })
      const data = await res.json()

      if (data.audioUrl) {
        const targetTrack = tracks.find(t => t.id === selectedTrackId) ?? tracks[0]
        if (targetTrack) {
          addClip({
            id: `clip-ai-${Date.now()}`,
            trackId: targetTrack.id,
            startBeat: 0,
            durationBeats: 16,
            name: prompt.slice(0, 24),
            type: 'audio',
            audioUrl: data.audioUrl,
            gain: 1, fadeIn: 0, fadeOut: 0,
            looped: false, muted: false, aiGenerated: true,
          })
        }
        setMessages(prev => [...prev, { role: 'clawbot', content: `Generated and added to timeline.\n\nAudio: ${data.audioUrl}`, coinCost: cost }])
      } else if (data.suggestion) {
        const s = data.suggestion
        setMessages(prev => [...prev, {
          role: 'clawbot',
          content: `Arrangement Suggestion\n\nChord Progression: ${s.chordProgression}\n\nStructure:\n${s.arrangement.join(' > ')}\n\nTracks: ${s.suggestedTracks.join(', ')}\n\nTips:\n${s.productionTips.map((t: string) => `- ${t}`).join('\n')}`,
          coinCost: cost,
        }])
      } else {
        setMessages(prev => [...prev, { role: 'clawbot', content: data.message ?? data.result?.message ?? 'Queued — check back shortly.', coinCost: data.coinCost ?? 0 }])
      }

      if (data.coinCost ?? cost) setCoinsUsed(c => c + (data.coinCost ?? cost))
    } catch {
      setMessages(prev => [...prev, { role: 'clawbot', content: 'AI features require API configuration.' }])
    } finally {
      setLoading(false)
      setGeneratingTool(null)
      scrollToBottom()
    }
  }

  return (
    <div className="clawbot-panel">
      {/* Header */}
      <div className="clawbot-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <BotIcon size="md" />
          <span>Clawbot</span>
        </div>
        {coinsUsed > 0 && <span className="coins-badge">{coinsUsed} credits used</span>}
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
              {m.coinCost != null && m.coinCost > 0 && (
                <span className="coin-cost">{m.coinCost} credits</span>
              )}
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
        {QUICK_ACTIONS.map(({ label, tool, cost }) => (
          <button
            key={tool}
            className="quick-btn"
            onClick={() => generateAudio(tool, cost)}
            disabled={loading || generatingTool !== null}
          >
            {generatingTool === tool ? 'Working...' : label}
            <span className="qa-cost">{cost} cr</span>
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
