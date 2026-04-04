import React, { useState, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'

const FLOWSTATE_HUB = 'https://flowstate-67g.pages.dev'

interface Message {
  role: 'user' | 'clawbot'
  content: string
  coinCost?: number
}

const QUICK_ACTIONS = [
  { label: '🎵 Generate Beat', tool: 'generate_beat', cost: 15 },
  { label: '🎼 Generate Melody', tool: 'generate_melody', cost: 20 },
  { label: '🎤 Full Track', tool: 'generate_track', cost: 40 },
  { label: '📋 Suggest Arrangement', tool: 'suggest_arrangement', cost: 10 },
  { label: '🔍 Analyze Key & BPM', tool: 'detect_key_bpm', cost: 2 },
  { label: '✨ AI Master', tool: 'master_track', cost: 20 },
]

export function ClawbotPanel() {
  const { clawflowActive, aiLevel, bpm, key, addClip, tracks, selectedTrackId } = useProjectStore()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'clawbot',
      content: `Hey! I'm Clawbot — your AI music assistant integrated with Flowstate Audio.\n\nI can generate beats, melodies, full tracks, suggest arrangements, and help with your workflow. All AI music generation requires an active ClawFlow subscription.\n\n${clawflowActive ? '✅ ClawFlow is active — all features enabled.' : '⚠️ ClawFlow not detected. Connect to Flowstate Hub to activate.'}`,
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
      setMessages(prev => [...prev, { role: 'clawbot', content: 'Connection error. Make sure you have internet access and Flowstate Hub is reachable.' }])
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }

  async function generateAudio(tool: string, cost: number) {
    if (!clawflowActive && ['generate_track','generate_melody','generate_beat','master_track','suggest_arrangement'].includes(tool)) {
      setMessages(prev => [...prev, {
        role: 'clawbot',
        content: `🔒 ClawFlow subscription required to use ${tool.replace('_',' ')}. Visit Flowstate Hub to subscribe — first month $20.\n\n👉 ${FLOWSTATE_HUB}`
      }])
      scrollToBottom()
      return
    }

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
        // Add to timeline
        const targetTrack = tracks.find(t => t.id === selectedTrackId) ?? tracks[0]
        if (targetTrack) {
          addClip({
            id: `clip-ai-${Date.now()}`,
            trackId: targetTrack.id,
            startBeat: 0,
            durationBeats: 16,
            name: `🤖 ${prompt.slice(0, 24)}`,
            type: 'audio',
            audioUrl: data.audioUrl,
            gain: 1, fadeIn: 0, fadeOut: 0,
            looped: false, muted: false, aiGenerated: true,
          })
        }
        setMessages(prev => [...prev, { role: 'clawbot', content: `✅ Generated! Added to timeline.\n\n🎵 Audio: ${data.audioUrl}`, coinCost: cost }])
      } else if (data.suggestion) {
        const s = data.suggestion
        setMessages(prev => [...prev, {
          role: 'clawbot',
          content: `🎼 Arrangement Suggestion\n\nChord Progression: ${s.chordProgression}\n\nStructure:\n${s.arrangement.join(' → ')}\n\nTracks: ${s.suggestedTracks.join(', ')}\n\nTips:\n${s.productionTips.map((t: string) => `• ${t}`).join('\n')}`,
          coinCost: cost,
        }])
      } else {
        setMessages(prev => [...prev, { role: 'clawbot', content: data.message ?? data.result?.message ?? 'Queued — check back shortly.', coinCost: data.coinCost ?? 0 }])
      }

      if (data.coinCost ?? cost) setCoinsUsed(c => c + (data.coinCost ?? cost))
    } catch {
      setMessages(prev => [...prev, { role: 'clawbot', content: 'Generation failed — check your network connection.' }])
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
        <span>🦾 Clawbot</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`cf-badge ${clawflowActive ? 'active' : 'inactive'}`}>
            {clawflowActive ? '✅ ClawFlow' : '🔒 ClawFlow'}
          </span>
          {coinsUsed > 0 && <span className="coins-badge">⚡ {coinsUsed} used</span>}
        </div>
      </div>

      {/* Messages */}
      <div className="clawbot-messages">
        {messages.map((m, i) => (
          <div key={i} className={`cb-msg ${m.role}`}>
            <div className="cb-av">{m.role === 'clawbot' ? '🦾' : '👤'}</div>
            <div className="cb-bubble">
              <pre className="cb-text">{m.content}</pre>
              {m.coinCost != null && m.coinCost > 0 && (
                <span className="coin-cost">⚡ {m.coinCost} coins</span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="cb-msg clawbot">
            <div className="cb-av">🦾</div>
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
            className={`quick-btn ${!clawflowActive && tool !== 'detect_key_bpm' ? 'locked' : ''}`}
            onClick={() => generateAudio(tool, cost)}
            disabled={loading || generatingTool !== null}
          >
            {generatingTool === tool ? '⏳' : label}
            <span className="qa-cost">{cost}⚡</span>
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
          {loading ? '⏳' : '↑'}
        </button>
      </div>

      {!clawflowActive && (
        <a href={FLOWSTATE_HUB} target="_blank" rel="noreferrer" className="clawflow-cta">
          🦾 Activate ClawFlow — First Month $20 →
        </a>
      )}
    </div>
  )
}
